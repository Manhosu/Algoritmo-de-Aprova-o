import { createHash } from "node:crypto";

import { hash } from "@node-rs/argon2";
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/*
  ⚠️ `APP_URL` PRECISA SER PÚBLICA AQUI.

  O `back_url` da assinatura sai dela, e o Mercado Pago recusa `localhost` com
  "Invalid value for back_url, must be a valid URL". No desenvolvimento a
  variável aponta para a máquina local, e este script fala com a API real — a
  URL de produção é a que faz sentido no endereço de retorno.
*/
if (!process.env.APP_URL || process.env.APP_URL.includes("localhost")) {
  process.env.APP_URL = "https://oalgoritmodaaprovacao.com.br";
}

/**
 * O CICLO DE ASSINATURA, CONTRA A API REAL DO MERCADO PAGO.
 * ============================================================================
 *
 * Item 14 do aceite do Marco 2: "assinatura no Mercado Pago completa um ciclo
 * (assinar → cobrar → cancelar)".
 *
 * ⚠️ NADA AQUI É SIMULADO. Cada passo chama a API do Mercado Pago com as
 * credenciais do ambiente e usa a resposta real. Um teste com resposta falsa
 * provaria que o nosso código conversa com a nossa imitação — que é justamente
 * o que não interessa saber.
 *
 * ⚠️ O ALUNO DE TESTE USA O E-MAIL DO COMPRADOR DE TESTE.
 *
 * Com credenciais de teste, o Mercado Pago recusa qualquer pagador que não seja
 * um usuário de teste ("Both payer and collector must be real or test users").
 * Como o `payer_email` sai da conta do aluno, a conta precisa ter esse e-mail.
 *
 * O QUE ESTE SCRIPT PROVA, E O QUE ELE NÃO PROVA
 * ----------------------------------------------------------------------------
 * Prova: a criação da assinatura pelo nosso fluxo, o `external_reference`
 * chegando lá, a releitura autenticada, o webhook encontrando a nossa linha, o
 * cancelamento e a volta ao Free.
 *
 * Não prova: a digitação do cartão na tela do Mercado Pago. Isso exige uma
 * pessoa no checkout deles, e é o único passo que fica para a cliente.
 *
 *   npm run verify:billing
 */

const EMAIL_COMPRADOR = "test_user_8391330168471915957@testuser.com";
const MARCADOR = "billing-check";

let passos = 0;
let falhas = 0;

function check(titulo: string, ok: boolean, detalhe: string) {
  passos++;
  if (!ok) falhas++;
  console.log(`  ${ok ? "✓" : "✗"} ${titulo} — ${detalhe}`);
}

async function main() {
  if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado.");
  }

  /*
    ⚠️ IMPORTAÇÕES DINÂMICAS, e não no topo.

    O ESM sobe todo `import` estático para antes da primeira linha executável,
    então `config()` rodaria DEPOIS de `@/config/env` ler as variáveis — e o
    script morreria dizendo que DATABASE_URL não existe. É o mesmo motivo pelo
    qual `verify-engine.ts` faz assim.
  */
  const { db } = await import("../src/server/db");
  const { plans, subscriptions, users } = await import("../src/server/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const { cancelPreapproval, getPreapproval } = await import(
    "../src/server/billing/mercadopago"
  );
  const { startSubscriptionCheckout } = await import("../src/server/billing/subscription");
  const { processWebhook } = await import("../src/server/billing/webhook");

  async function limpar(id: string | null) {
    if (!id) return;
    await db.delete(subscriptions).where(eq(subscriptions.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }

  let userId: string | null = null;

  try {
    console.log("Preparando aluno de teste...\n");

    /* Uma conta antiga do mesmo e-mail atrapalharia o índice único. */
    const [antigo] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, EMAIL_COMPRADOR))
      .limit(1);
    await limpar(antigo?.id ?? null);

    const senhaHash = await hash("frase longa de verificacao", {
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });

    const [aluno] = await db
      .insert(users)
      .values({
        name: "Comprador de Teste",
        email: EMAIL_COMPRADOR,
        whatsapp: "+5511999990002",
        passwordHash: senhaHash,
        pseudonymKey: createHash("sha256").update(`${MARCADOR}-${Date.now()}`).digest("hex"),
        role: "student",
        status: "active",
      })
      .returning({ id: users.id });

    userId = aluno.id;

    const [free] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.code, "free"))
      .limit(1);

    await db.insert(subscriptions).values({
      userId,
      planId: free.id,
      status: "active",
      provider: "manual",
    });

    console.log("Percorrendo o ciclo:\n");

    /* --- 1. ASSINAR ------------------------------------------------------- */
    const checkout = await startSubscriptionCheckout({
      userId,
      planCode: "premium",
      billingPeriod: "monthly",
    });

    check(
      "O fluxo do produto cria a assinatura no Mercado Pago",
      checkout.ok,
      checkout.ok ? "checkout aberto" : checkout.message,
    );

    if (!checkout.ok) throw new Error("sem assinatura, o resto não faz sentido");

    check(
      "O endereço devolvido é o checkout deles",
      checkout.checkoutUrl.startsWith("https://www.mercadopago.com"),
      checkout.checkoutUrl.slice(0, 62),
    );

    const [pendente] = await db
      .select({
        id: subscriptions.id,
        status: subscriptions.status,
        externalSubscriptionId: subscriptions.externalSubscriptionId,
      })
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "pending")))
      .limit(1);

    check(
      "A nossa linha nasce pendente, com o id deles gravado",
      Boolean(pendente?.externalSubscriptionId),
      pendente?.externalSubscriptionId ?? "sem id externo",
    );

    const preapprovalId = pendente!.externalSubscriptionId!;

    /* --- 2. O ELO ENTRE OS DOIS LADOS ------------------------------------- */
    const remota = await getPreapproval(preapprovalId);

    check(
      "O external_reference que chegou lá é o id da NOSSA linha",
      remota.external_reference === pendente!.id,
      `${remota.external_reference?.slice(0, 8)}… = ${pendente!.id.slice(0, 8)}…`,
    );

    check(
      "O valor que chegou lá é o do banco, não o do formulário",
      remota.auto_recurring?.transaction_amount === 89.9,
      `R$ ${remota.auto_recurring?.transaction_amount}`,
    );

    /* --- 3. O WEBHOOK ENCONTRA A ASSINATURA ------------------------------- */
    const notificacao = await processWebhook({
      eventId: `verificacao-${Date.now()}`,
      eventType: "subscription_preapproval",
      dataId: preapprovalId,
      payload: { type: "subscription_preapproval", data: { id: preapprovalId } },
      signatureValid: true,
    });

    /*
      A assinatura está `pending` no Mercado Pago porque ninguém digitou cartão.
      O webhook precisa RECONHECÊ-LA e dizer que não há ação — reconhecer é o
      que se está verificando; ativar sem pagamento seria o defeito.
    */
    check(
      "O webhook reconhece a assinatura e não ativa sem pagamento",
      !notificacao.handled && /status pending/.test(notificacao.reason ?? ""),
      notificacao.handled ? notificacao.detail : notificacao.reason,
    );

    const repetida = await processWebhook({
      eventId: "repetida-fixa",
      eventType: "subscription_preapproval",
      dataId: preapprovalId,
      payload: {},
      signatureValid: true,
    });
    const denovo = await processWebhook({
      eventId: "repetida-fixa",
      eventType: "subscription_preapproval",
      dataId: preapprovalId,
      payload: {},
      signatureValid: true,
    });

    check(
      "Notificação repetida é recusada pelo índice, não processada duas vezes",
      !denovo.handled && /já processada/.test(denovo.reason ?? ""),
      /*
        `WebhookResult` é união discriminada: `reason` só existe no ramo não
        tratado. Ler direto compila no ramo errado, e o typecheck pegou.
      */
      `1ª: ${repetida.handled ? "tratada" : repetida.reason} · 2ª: ${
        denovo.handled ? "tratada" : denovo.reason
      }`,
    );

    /* --- 4. CANCELAR ------------------------------------------------------ */
    const cancelada = await cancelPreapproval(preapprovalId);

    check(
      "O cancelamento vale no Mercado Pago",
      cancelada.status === "cancelled",
      cancelada.status,
    );

    const aposCancelar = await processWebhook({
      eventId: `cancelamento-${Date.now()}`,
      eventType: "subscription_preapproval",
      dataId: preapprovalId,
      payload: {},
      signatureValid: true,
    });

    check(
      "O webhook do cancelamento encerra a nossa linha",
      aposCancelar.handled,
      aposCancelar.handled ? aposCancelar.detail : aposCancelar.reason,
    );

    const [depois] = await db
      .select({ status: subscriptions.status, planId: subscriptions.planId })
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
      .limit(1);

    check(
      "O aluno volta para o Free, e não fica sem plano",
      depois?.planId === free.id,
      depois ? `ativo no plano ${depois.planId === free.id ? "Free" : "errado"}` : "SEM PLANO",
    );
  } finally {
    await limpar(userId);
    console.log("\nDados de teste removidos.");
  }

  console.log(
    falhas === 0
      ? `\n${passos} verificações passaram.`
      : `\n${falhas} de ${passos} FALHARAM.`,
  );

  if (falhas > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  });
