import { createHmac } from "node:crypto";

import { hash } from "@node-rs/argon2";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Cria (ou reaproveita) uma conta de administrador.
 *
 *   npx tsx scripts/create-admin.ts "Nome" email@dominio.com "a senha" +5511999998888
 *
 * POR QUE CRIAR DIRETO NO BANCO, E NÃO PELO CADASTRO
 * ----------------------------------------------------------------------------
 * ⚠️ O CADASTRO DISPARA E-MAIL DE VERIFICAÇÃO. Numa conta administrativa cujo
 * domínio não é nosso, isso manda uma mensagem para uma caixa que pode ser de
 * terceiro — e, junto, a informação de que a conta existe. Aqui a conta já
 * nasce verificada e nenhum e-mail sai.
 *
 * A SENHA PASSA PELA MESMA POLÍTICA da tela. Criar admin por fora seria o lugar
 * óbvio para uma senha fraca entrar sem ninguém conferir, então a conferência é
 * a mesma função que o cadastro usa: se reprovar, o script para.
 *
 * O hash usa os parâmetros do OWASP para argon2id, iguais aos de
 * `server/auth/password.ts`. Divergir aqui geraria um hash que o login não
 * valida, e o sintoma seria "senha errada" com a senha certa.
 */

const ARGON2 = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

async function main() {
  const [nome, email, senha, whatsapp] = process.argv.slice(2);

  if (!nome || !email || !senha || !whatsapp) {
    console.error(
      '\nUso: npx tsx scripts/create-admin.ts "Nome" email@dominio.com "a senha" +5511999998888\n',
    );
    process.exit(1);
  }

  /**
   * ⚠️ O WHATSAPP É OBRIGATÓRIO NO BANCO, não aqui por capricho.
   *
   * `users_identity_required_check` exige nome, e-mail, WhatsApp e pseudônimo
   * em toda conta que não esteja anonimizada — é a obrigatoriedade do cadastro
   * escrita como invariante, e não como promessa da aplicação.
   *
   * Por isso ele é argumento e não valor inventado no script: um número
   * plausível gerado aqui pode ser de uma pessoa de verdade.
   */
  if (!/^\+[1-9][0-9]{7,14}$/.test(whatsapp)) {
    console.error(`\n✗ "${whatsapp}" não está em E.164. Exemplo: +5511999998888\n`);
    process.exit(1);
  }

  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");

  const { checkPasswordStrength } = await import("@/server/auth/password");
  const forca = checkPasswordStrength(senha, { email, name: nome });

  if (!forca.ok) {
    console.error("\n✗ A senha não passa na política do próprio produto:\n");
    for (const problema of forca.problems) console.error(`  · ${problema}`);
    console.error("");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, prepare: false });

  try {
    const passwordHash = await hash(senha, ARGON2);
    const normalizado = email.toLowerCase().trim();

    const [existente] = await sql<Array<{ id: string; role: string }>>`
      select id, role from users where lower(email) = ${normalizado}
    `;

    if (existente) {
      // Reaproveitar em vez de recusar: rodar de novo para trocar a senha de um
      // admin que se perdeu é o caso mais provável de uso repetido.
      await sql`
        update users
        set password_hash = ${passwordHash},
            password_changed_at = now(),
            role = 'admin',
            status = 'active',
            email_verified_at = coalesce(email_verified_at, now()),
            updated_at = now()
        where id = ${existente.id}
      `;
      console.log(`\n✓ Conta ${normalizado} atualizada: senha nova e papel de admin.\n`);
      return;
    }

    /**
     * O pseudônimo sai do e-mail, e não do id, porque ele precisa ser o mesmo
     * antes e depois da anonimização — é ele que liga o histórico de uso a uma
     * pessoa sem guardar quem ela é.
     */
    const pseudonym = createHmac("sha256", process.env.ANONYMIZATION_PEPPER ?? "x")
      .update(normalizado)
      .digest("hex");

    const [criado] = await sql<Array<{ id: string }>>`
      insert into users
        (name, email, email_verified_at, whatsapp, password_hash, password_changed_at,
         pseudonym_key, role, status, timezone)
      values
        (${nome}, ${normalizado}, now(), ${whatsapp}, ${passwordHash}, now(),
         ${pseudonym}, 'admin', 'active', 'America/Sao_Paulo')
      returning id
    `;

    /**
     * Assinatura do plano gratuito.
     *
     * O admin também é aluno: se ele clicar em "Ir para a área de estudo" sem
     * assinatura, as telas que leem o plano não têm o que ler. Free é o que
     * basta — a área administrativa não depende de plano.
     */
    const [free] = await sql<Array<{ id: string }>>`select id from plans where code = 'free' limit 1`;
    if (free) {
      await sql`
        insert into subscriptions (user_id, plan_id, status, provider)
        values (${criado.id}, ${free.id}, 'active', 'manual')
      `;
    }

    console.log(`\n✓ Conta criada: ${nome} <${normalizado}>`);
    console.log("  Papel: admin · e-mail já verificado · plano Free");
    console.log("  Ela já pode entrar em /entrar e abrir /admin/textos.\n");
  } finally {
    await sql.end();
  }
}

await main();
