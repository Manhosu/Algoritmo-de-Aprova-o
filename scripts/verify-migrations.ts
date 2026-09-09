import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";

/**
 * Aplica TODAS as migrations num Postgres efêmero, em memória, e confere se o
 * banco resultante é o esperado.
 *
 * POR QUE ISTO EXISTE
 * ----------------------------------------------------------------------------
 * "O schema compila em TypeScript" e "o SQL gerado é válido" são coisas
 * diferentes — e nenhuma das duas prova que a migration APLICA. Gatilhos
 * escritos à mão, constraints com expressão e índices parciais só falham na
 * hora do `CREATE`.
 *
 * O PGlite é o Postgres de verdade compilado para WebAssembly: mesmo parser,
 * mesmo planner, mesmo plpgsql. Roda sem instalar nada e sem servidor, o que
 * permite rodar esta checagem no CI e antes de qualquer migration tocar o banco
 * da cliente.
 *
 * Não substitui o banco de desenvolvimento — substitui a esperança de que o SQL
 * esteja certo.
 *
 * Uso: npm run db:verify
 */

const MIGRATIONS_DIR = "drizzle";

type Check = { label: string; sql: string; expect: (rows: unknown[]) => boolean; detail?: string };

async function main() {
  console.log("Subindo Postgres efêmero (PGlite)...\n");
  const db = new PGlite();
  await db.waitReady;

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) throw new Error("Nenhuma migration encontrada em drizzle/.");

  let statements = 0;

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    // O drizzle-kit separa os comandos com este marcador.
    const chunks = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !/^(--[^\n]*\n?)+$/.test(s));

    process.stdout.write(`  ${file} … `);
    const startedAt = Date.now();
    for (const [i, chunk] of chunks.entries()) {
      try {
        await db.exec(chunk);
        statements++;
      } catch (error) {
        console.log("FALHOU\n");
        console.error(`Comando ${i + 1} de ${file}:\n`);
        console.error(chunk.slice(0, 700));
        console.error(`\n${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    }
    console.log(`ok (${chunks.length} comandos, ${Date.now() - startedAt}ms)`);
  }

  console.log(`\nTotal aplicado: ${statements} comandos.\n`);

  /* ---------------------------------------------------------------------- *
   * Inventário do banco resultante
   * ---------------------------------------------------------------------- */
  const counts: Array<[string, string]> = [
    ["tabelas", `select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`],
    ["tipos enum", `select count(*)::int as n from pg_type where typtype = 'e'`],
    ["índices", `select count(*)::int as n from pg_indexes where schemaname = 'public'`],
    ["chaves estrangeiras", `select count(*)::int as n from pg_constraint where contype = 'f'`],
    ["constraints CHECK", `select count(*)::int as n from pg_constraint where contype = 'c' and conname not like '%_not_null'`],
    ["gatilhos", `select count(*)::int as n from pg_trigger where not tgisinternal`],
  ];

  for (const [label, sql] of counts) {
    const res = await db.query<{ n: number }>(sql);
    console.log(`  ${label.padEnd(22)} ${res.rows[0].n}`);
  }

  /* ---------------------------------------------------------------------- *
   * Invariantes que o walkthrough prometeu — verificadas de verdade
   * ---------------------------------------------------------------------- */
  console.log("\nInvariantes:\n");

  const checks: Check[] = [
    {
      label: "os dois motores não compartilham tabela",
      sql: `select count(*)::int as n from pg_constraint c
            join pg_class src on src.oid = c.conrelid
            join pg_class tgt on tgt.oid = c.confrelid
            where c.contype = 'f'
              and ((src.relname like 'daily_task%' and tgt.relname like 'review_%')
                or (src.relname like 'review_%' and tgt.relname like 'daily_task%'))`,
      expect: (r) => (r[0] as { n: number }).n === 0,
      detail: "existe FK entre as tabelas do Motor 1 e as do Motor 2",
    },
    {
      label: "só uma assinatura ativa por usuário",
      sql: `select count(*)::int as n from pg_indexes where indexname = 'subscriptions_one_active_per_user'`,
      expect: (r) => (r[0] as { n: number }).n === 1,
    },
    {
      label: "só uma versão ativa por tipo de configuração",
      sql: `select count(*)::int as n from pg_indexes where indexname = 'engine_configs_one_active_per_kind'`,
      expect: (r) => (r[0] as { n: number }).n === 1,
    },
    {
      label: "funil chaveado pela pseudônima, não pelo usuário",
      sql: `select a.attname as col from pg_index i
            join pg_class t on t.oid = i.indrelid
            join pg_attribute a on a.attrelid = t.oid and a.attnum = any(i.indkey)
            where t.relname = 'user_funnel_progress' and i.indisprimary`,
      expect: (r) => (r[0] as { col: string })?.col === "pseudonym_key",
    },
    {
      label: "tarefa do dia exige configuração (NOT NULL)",
      sql: `select is_nullable from information_schema.columns
            where table_name = 'daily_tasks' and column_name = 'engine_config_id'`,
      expect: (r) => (r[0] as { is_nullable: string })?.is_nullable === "NO",
    },
    {
      label: "disponibilidade de estudo é do usuário",
      sql: `select count(*)::int as n from information_schema.columns
            where table_name = 'user_availability' and column_name = 'user_id'`,
      expect: (r) => (r[0] as { n: number }).n === 1,
    },
    {
      label: "um diagnóstico por preparação",
      sql: `select count(*)::int as n from pg_indexes where indexname = 'diagnostics_preparation_unique'`,
      expect: (r) => (r[0] as { n: number }).n === 1,
    },
    {
      label: "gatilhos de imutabilidade da configuração instalados",
      sql: `select count(*)::int as n from pg_trigger
            where not tgisinternal and tgname in ('trg_engine_configs_immutable', 'trg_engine_configs_no_delete')`,
      expect: (r) => (r[0] as { n: number }).n === 2,
    },
    {
      label: "identidade externa não pode servir a dois alunos",
      sql: `select count(*)::int as n from pg_indexes
            where indexname = 'user_identities_provider_account_unique'`,
      expect: (r) => (r[0] as { n: number }).n === 1,
    },
    {
      label: "identidade externa some junto com a conta",
      sql: `select confdeltype as t from pg_constraint
            where conname = 'user_identities_user_id_users_id_fk'`,
      expect: (r) => (r[0] as { t: string })?.t === "c", // 'c' = CASCADE
      detail: "o id da conta Google é dado pessoal e precisa ser apagado na exclusão",
    },
  ];

  let failed = 0;
  for (const check of checks) {
    const res = await db.query(check.sql);
    const ok = check.expect(res.rows);
    console.log(`  ${ok ? "ok  " : "FALHA"}  ${check.label}`);
    if (!ok) {
      failed++;
      if (check.detail) console.log(`         ${check.detail}`);
    }
  }

  /* ---------------------------------------------------------------------- *
   * Comportamento: os CHECKs e gatilhos realmente bloqueiam?
   * ---------------------------------------------------------------------- */
  console.log("\nComportamento (o banco recusa o que deve recusar):\n");

  const behaviours: Array<{ label: string; sql: string }> = [
    {
      label: "conta anonimizada com PII é recusada",
      sql: `insert into users (id, name, email, whatsapp, pseudonym_key, status, anonymized_at)
            values (gen_random_uuid(), 'Fulano', 'f@x.com', '+5511999999999', 'k1', 'anonymized', now())`,
    },
    {
      label: "conta ativa sem WhatsApp é recusada",
      sql: `insert into users (id, name, email, pseudonym_key, status)
            values (gen_random_uuid(), 'Fulano', 'g@x.com', 'k2', 'active')`,
    },
    {
      label: "e-mail com maiúscula é recusado",
      sql: `insert into users (id, name, email, whatsapp, pseudonym_key, status)
            values (gen_random_uuid(), 'Fulano', 'MAIUSCULA@x.com', '+5511999999999', 'k3', 'active')`,
    },
    {
      label: "WhatsApp fora do padrão E.164 é recusado",
      sql: `insert into users (id, name, email, whatsapp, pseudonym_key, status)
            values (gen_random_uuid(), 'Fulano', 'h@x.com', '11999999999', 'k4', 'active')`,
    },
  ];

  for (const b of behaviours) {
    try {
      await db.exec(b.sql);
      console.log(`  FALHA  ${b.label} — o banco ACEITOU`);
      failed++;
    } catch {
      console.log(`  ok     ${b.label}`);
    }
  }

  // Gatilho de imutabilidade: precisa de uma linha travada para exercitar.
  await db.exec(`
    insert into engine_configs (id, kind, version, payload, is_active, locked_at)
    values (gen_random_uuid(), 'daily_task_weights', 1, '{"performance":30}'::jsonb, true, now());
  `);

  try {
    await db.exec(`update engine_configs set payload = '{"performance":99}'::jsonb where version = 1`);
    console.log(`  FALHA  configuração travada foi ALTERADA`);
    failed++;
  } catch {
    console.log(`  ok     configuração travada não pode ser alterada`);
  }

  try {
    await db.exec(`delete from engine_configs where version = 1`);
    console.log(`  FALHA  configuração travada foi APAGADA`);
    failed++;
  } catch {
    console.log(`  ok     configuração travada não pode ser apagada`);
  }

  try {
    await db.exec(`update engine_configs set is_active = false, retired_at = now() where version = 1`);
    console.log(`  ok     aposentar uma configuração travada continua permitido`);
  } catch (error) {
    console.log(`  FALHA  não foi possível aposentar: ${error instanceof Error ? error.message : error}`);
    failed++;
  }

  /* ---------------------------------------------------------------------- *
   * O seed roda? (não basta compilar)
   * ---------------------------------------------------------------------- */
  console.log("\nSeed:\n");

  /**
   * Remove a linha de fixture usada no teste do gatilho, para não colidir com a
   * versão 1 que o seed cria.
   *
   * Precisa desabilitar o gatilho para isso — o que é, em si, a confirmação de
   * que ele está fazendo o trabalho dele: nem o próprio verificador consegue
   * alterar uma configuração travada por vias normais.
   */
  await db.exec(`
    ALTER TABLE engine_configs DISABLE TRIGGER USER;
    DELETE FROM engine_configs;
    ALTER TABLE engine_configs ENABLE TRIGGER USER;
  `);

  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("../src/server/db/schema");
  const { runSeed } = await import("../src/server/db/seed");

  // O driver do PGlite expõe a mesma API do postgres-js; a diferença de tipos
  // não existe em runtime.
  const seedDb = drizzle(db, { schema, casing: "snake_case" });
  await runSeed(seedDb as unknown as Parameters<typeof runSeed>[0]);

  const inventory: Array<[string, string, number]> = [
    ["planos", "plans", 3],
    ["limites de plano", "plan_limits", 3],
    ["preços", "plan_prices", 4],
    ["níveis", "levels", 5],
    /* 7 desde que `study_techniques` virou configuração editável no painel. */
    ["configurações de motor", "engine_configs", 7],
    ["bancas", "exam_boards", 9],
    ["disciplinas canônicas", "canonical_subjects", 7],
    ["missões", "missions", 5],
  ];

  for (const [label, table, expected] of inventory) {
    const res = await db.query<{ n: number }>(`select count(*)::int as n from ${table}`);
    const n = res.rows[0].n;
    const ok = n === expected;
    if (!ok) failed++;
    console.log(`  ${ok ? "ok  " : "FALHA"}  ${label.padEnd(24)} ${n}${ok ? "" : ` (esperado ${expected})`}`);
  }

  const loose: Array<[string, string]> = [
    ["assuntos canônicos", "canonical_topics"],
    ["sinônimos de assunto", "canonical_topic_aliases"],
    ["questões", "questions"],
    ["alternativas", "question_options"],
  ];
  for (const [label, table] of loose) {
    const res = await db.query<{ n: number }>(`select count(*)::int as n from ${table}`);
    const n = res.rows[0].n;
    const ok = n > 0;
    if (!ok) failed++;
    console.log(`  ${ok ? "ok  " : "FALHA"}  ${label.padEnd(24)} ${n}`);
  }

  // Integridade do acervo: toda questão publicada precisa de exatamente uma
  // alternativa correta e de comentário.
  const broken = await db.query<{ n: number }>(`
    select count(*)::int as n from questions q
    where q.status = 'published'
      and (
        (select count(*) from question_options o where o.question_id = q.id and o.is_correct) <> 1
        or coalesce(length(trim(q.explanation)), 0) < 40
      )`);
  const brokenCount = broken.rows[0].n;
  if (brokenCount > 0) failed++;
  console.log(
    `  ${brokenCount === 0 ? "ok  " : "FALHA"}  questões íntegras          ${
      brokenCount === 0 ? "todas" : `${brokenCount} com problema`
    }`,
  );

  // Idempotência: rodar de novo não pode duplicar nada.
  const before = (await db.query<{ n: number }>(`select count(*)::int as n from questions`)).rows[0].n;
  await runSeed(seedDb as unknown as Parameters<typeof runSeed>[0]);
  const after = (await db.query<{ n: number }>(`select count(*)::int as n from questions`)).rows[0].n;
  const idempotent = before === after;
  if (!idempotent) failed++;
  console.log(
    `  ${idempotent ? "ok  " : "FALHA"}  seed é idempotente         ${before} → ${after}`,
  );

  await db.close();

  if (failed > 0) {
    console.error(`\n${failed} verificação(ões) falharam.`);
    process.exit(1);
  }
  console.log("\nTudo certo. As migrations aplicam, o banco se comporta como o projeto promete e o seed roda.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
