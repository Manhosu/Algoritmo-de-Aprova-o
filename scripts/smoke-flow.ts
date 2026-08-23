import { createHash, randomBytes, randomUUID, createHmac } from "node:crypto";

import { hash } from "@node-rs/argon2";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Percorre o caminho crítico do aluno com uma sessão REAL e confere o que cada
 * tela devolve.
 *
 * POR QUE ISSO EXISTE
 * ----------------------------------------------------------------------------
 * `tsc`, `eslint` e os testes de unidade não provam que a página renderiza.
 * Este script cria um usuário de verdade, abre uma sessão de verdade e pede as
 * páginas por HTTP — o mesmo caminho que o navegador percorre, incluindo o
 * proxy, os guards e as consultas ao banco.
 *
 * Ele LIMPA tudo que criou ao final, inclusive quando falha no meio.
 *
 * Uso: npm run smoke   (com `npm run dev` rodando)
 */

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const MARKER = "smoke-test";

type Step = { label: string; ok: boolean; detail: string };
const steps: Step[] = [];

function record(label: string, ok: boolean, detail = "") {
  steps.push({ label, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");

  const sql = postgres(url, { max: 1, prepare: false });

  const userId = randomUUID();
  const email = `${MARKER}-${Date.now()}@exemplo.invalido`;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const pseudonym = createHmac("sha256", process.env.ANONYMIZATION_PEPPER ?? "x")
    .update(userId)
    .digest("hex");

  const cookieName = "aa_session";
  const cookie = `${cookieName}=${token}`;

  try {
    console.log(`Alvo: ${BASE}\n`);
    console.log("Preparando usuário de teste...");

    const passwordHash = await hash("uma frase longa de teste", {
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });

    await sql`
      insert into users (id, name, email, whatsapp, password_hash, pseudonym_key, role, status, timezone)
      values (${userId}, 'Aluno de Teste', ${email}, '+5511999990000', ${passwordHash},
              ${pseudonym}, 'student', 'active', 'America/Sao_Paulo')
    `;

    const [freePlan] = await sql<Array<{ id: string }>>`
      select id from plans where code = 'free' limit 1
    `;
    await sql`
      insert into subscriptions (user_id, plan_id, status, provider)
      values (${userId}, ${freePlan.id}, 'active', 'manual')
    `;
    await sql`
      insert into user_funnel_progress (pseudonym_key, user_id, signed_up_at, last_stage_reached, last_stage_reached_at)
      values (${pseudonym}, ${userId}, now(), 'signed_up', now())
    `;
    await sql`
      insert into auth_sessions (user_id, token_hash, expires_at)
      values (${userId}, ${tokenHash}, now() + interval '1 day')
    `;

    console.log("Percorrendo o fluxo:\n");

    /* --- 1. sem disponibilidade, a Home manda para o onboarding ------------ */
    let res = await fetch(`${BASE}/inicio`, { headers: { cookie }, redirect: "manual" });
    record(
      "Home redireciona para o onboarding quando falta disponibilidade",
      res.status === 307 && (res.headers.get("location") ?? "").includes("/boas-vindas"),
      `${res.status} → ${res.headers.get("location") ?? "—"}`,
    );

    /* --- 2. a tela de onboarding abre -------------------------------------- */
    res = await fetch(`${BASE}/boas-vindas`, { headers: { cookie } });
    let html = await res.text();
    record(
      "Tela de disponibilidade renderiza",
      res.ok && html.includes("Boas-vindas") && html.includes("Segunda"),
      `${res.status}`,
    );

    /* --- 3. informada a disponibilidade, a Home abre ----------------------- */
    await sql`
      insert into user_availability (user_id, weekday, minutes_available) values
        (${userId}, 1, 60), (${userId}, 2, 60), (${userId}, 3, 60),
        (${userId}, 4, 60), (${userId}, 5, 60), (${userId}, 6, 240)
    `;

    res = await fetch(`${BASE}/inicio`, { headers: { cookie } });
    html = await res.text();
    record(
      "Home abre e convida a criar a preparação",
      res.ok && html.includes("Comece pelo edital"),
      `${res.status}`,
    );

    /* --- 4. formulário de nova preparação ---------------------------------- */
    res = await fetch(`${BASE}/preparacoes/nova`, { headers: { cookie } });
    html = await res.text();
    record(
      "Formulário de nova preparação renderiza com as bancas",
      res.ok && html.includes("Cargo pretendido") && html.includes("Cebraspe"),
      `${res.status}`,
    );

    /* --- 5. gate de plano: a segunda preparação é barrada ------------------ */
    await sql`
      insert into preparations (user_id, target_position, title, status, is_current)
      values (${userId}, 'Analista Judiciário', 'Analista Judiciário', 'draft', true)
    `;

    res = await fetch(`${BASE}/preparacoes/nova`, { headers: { cookie } });
    html = await res.text();
    record(
      "Gate do plano Free barra a segunda preparação",
      res.ok && html.includes("Você já tem"),
      `${res.status}`,
    );

    /* --- 6. a Home passa a pedir o edital ---------------------------------- */
    res = await fetch(`${BASE}/inicio`, { headers: { cookie } });
    html = await res.text();
    record(
      "Home mostra o próximo passo: enviar o edital",
      res.ok && html.includes("Falta enviar o edital"),
      `${res.status}`,
    );

    /* --- 7. estados seguintes da preparação -------------------------------- */
    const estados: Array<[string, string]> = [
      ["review_pending", "Confira o que a IA leu"],
      ["diagnosis_pending", "Falta o diagnóstico"],
      ["failed", "Não conseguimos ler seu edital"],
    ];

    for (const [status, esperado] of estados) {
      await sql`update preparations set status = ${status} where user_id = ${userId}`;
      res = await fetch(`${BASE}/inicio`, { headers: { cookie } });
      html = await res.text();
      record(`Home reflete o estado "${status}"`, res.ok && html.includes(esperado));
    }

    /* --- 8. logout revoga a sessão no banco -------------------------------- */
    res = await fetch(`${BASE}/sair`, { headers: { cookie }, redirect: "manual" });
    const [session] = await sql<Array<{ revoked_at: Date | null }>>`
      select revoked_at from auth_sessions where token_hash = ${tokenHash}
    `;
    record(
      "Logout revoga a sessão no banco, não só apaga o cookie",
      session?.revoked_at !== null,
      session?.revoked_at ? "revogada" : "AINDA ATIVA",
    );

    /* --- 9. sessão revogada não abre mais nada ----------------------------- */
    res = await fetch(`${BASE}/inicio`, { headers: { cookie }, redirect: "manual" });
    record(
      "Sessão revogada não dá mais acesso",
      res.status === 307 && (res.headers.get("location") ?? "").includes("/entrar"),
      `${res.status}`,
    );
  } finally {
    /**
     * Limpa mesmo se algo falhou no meio: usuário de teste esquecido no banco
     * da cliente contamina as métricas do funil.
     *
     * ⚠️ `subscriptions` e `payments` referenciam `users` com ON DELETE
     * RESTRICT — de propósito, porque registro financeiro tem prazo de guarda
     * legal e não pode sumir num cascade acidental. Isso significa que este
     * script precisa apagar na ordem, e não pode simplesmente remover o
     * usuário. A primeira execução falhou exatamente aqui, o que é uma boa
     * notícia: a proteção funciona.
     */
    await sql`
      delete from subscriptions
      where user_id in (select id from users where email like ${`${MARKER}-%`})
    `;
    await sql`delete from users where email like ${`${MARKER}-%`}`;
    await sql.end({ timeout: 5 });
  }

  const failed = steps.filter((step) => !step.ok);
  console.log("");
  if (failed.length > 0) {
    console.error(`${failed.length} de ${steps.length} verificações falharam.`);
    process.exit(1);
  }
  console.log(`${steps.length} verificações passaram. Dados de teste removidos.`);
}

main().catch((error) => {
  console.error("\n", error instanceof Error ? error.message : error);
  process.exit(1);
});
