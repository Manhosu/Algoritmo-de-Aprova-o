import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Compara o que o Mercado Pago diz com o que o nosso banco guarda.
 *
 *   npm run billing:check
 *
 * ⚠️ EXISTE PARA A FALHA QUE NÃO APARECE EM LUGAR NENHUM.
 *
 * Se a URL do webhook não estiver registrada na aplicação de PRODUÇÃO, o aluno
 * paga, o Mercado Pago aprova e cobra, e a nossa linha fica em `pending` para
 * sempre. Ninguém recebe erro: o aluno vê o pagamento aprovado no aplicativo do
 * banco, e o produto continua tratando ele como Free.
 *
 * Do nosso lado tudo parece calmo, porque nada falhou. O que faltou foi uma
 * requisição que nunca chegou, e ausência não dispara alarme.
 *
 * Este script põe os dois lados lado a lado. Divergência entre eles é o sinal.
 *
 * ⚠️ SÓ LÊ. Não cria assinatura, não cancela, não cobra ninguém.
 *
 * `verify:billing` faz o ciclo inteiro e serve ao ambiente de TESTE. Rodá-lo
 * com credencial de produção criaria uma assinatura de verdade na conta da
 * cliente, e é por isso que a conferência de produção precisava de um script
 * que só observa.
 */

const { db } = await import("../src/server/db");
const { subscriptions, users, plans } = await import("../src/server/db/schema");
const { getPreapproval, getMercadoPagoAccount } = await import(
  "../src/server/billing/mercadopago"
);
const { desc, eq } = await import("drizzle-orm");

const conta = await getMercadoPagoAccount();

console.log(
  `\nConta do Mercado Pago: ${conta ? conta.nickname : "(não configurada)"}` +
    (conta ? ` · ${conta.isTestAccount ? "TESTE" : "PRODUÇÃO"}` : ""),
);

if (conta?.isTestAccount) {
  console.log(
    "⚠️  Em modo de teste, nenhuma cobrança é real e só conta de teste consegue assinar.",
  );
}

const linhas = await db
  .select({
    id: subscriptions.id,
    status: subscriptions.status,
    externo: subscriptions.externalSubscriptionId,
    email: users.email,
    plano: plans.name,
    criadaEm: subscriptions.createdAt,
  })
  .from(subscriptions)
  .innerJoin(users, eq(users.id, subscriptions.userId))
  .innerJoin(plans, eq(plans.id, subscriptions.planId))
  .orderBy(desc(subscriptions.createdAt))
  .limit(20);

console.log(`\nAssinaturas no banco: ${linhas.length}\n`);

let divergencias = 0;

for (const linha of linhas) {
  const rotulo = `${(linha.email ?? "—").padEnd(38)} ${linha.plano.padEnd(14)} ${linha.status.padEnd(10)}`;

  /*
    Free não passa pelo Mercado Pago: ele é criado no cadastro, sem cobrança.
    Cobrá-lo aqui encheria a saída de linhas que nunca terão par do outro lado.
  */
  if (!linha.externo) {
    console.log(`  ${rotulo} (sem assinatura no Mercado Pago)`);
    continue;
  }

  try {
    const deles = await getPreapproval(linha.externo);

    /*
      A tradução é a mesma que o webhook usa: `authorized` do lado deles é
      `active` do nosso. Comparar as duas palavras cruas acusaria divergência em
      toda linha saudável.
    */
    const esperado =
      deles.status === "authorized"
        ? "active"
        : deles.status === "cancelled"
          ? "canceled"
          : "pending";

    const bate = linha.status === esperado;
    if (!bate) divergencias += 1;

    console.log(
      `  ${bate ? "✓" : "✗"} ${rotulo} lá: ${deles.status.padEnd(12)}` +
        (bate ? "" : `  ← esperado aqui: ${esperado}`),
    );
  } catch (erro) {
    divergencias += 1;
    console.log(
      `  ✗ ${rotulo} não consegui ler no Mercado Pago: ${
        erro instanceof Error ? erro.message.slice(0, 60) : "falhou"
      }`,
    );
  }
}

if (divergencias > 0) {
  console.log(
    `\n${divergencias} divergência(s). A causa mais provável é o webhook: confira se ` +
      "a URL https://oalgoritmodaaprovacao.com.br/api/webhooks/mercadopago está " +
      "registrada na aplicação de produção, com o mesmo segredo de MERCADOPAGO_WEBHOOK_SECRET.\n",
  );
} else {
  console.log("\nOs dois lados contam a mesma história.\n");
}

process.exit(0);
