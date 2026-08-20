import { config } from "dotenv";
import postgres from "postgres";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Retrato do banco configurado: estrutura, dados iniciais e volume de uso.
 *
 * Serve para responder rápido "o banco está como deveria?" sem abrir o painel
 * do Supabase — e para conferir, depois de uma migration, se o que foi aplicado
 * é o que se esperava.
 *
 * Uso: npm run db:status
 */

/**
 * Todas as contagens são restritas ao schema `public`.
 *
 * O Supabase instala os próprios schemas (`auth`, `storage`, `realtime`,
 * `extensions`) com dezenas de enums, constraints e gatilhos. Sem o filtro, os
 * números aqui não bateriam com o que as nossas migrations criaram — e um
 * relatório que não bate com a expectativa não serve para conferir nada.
 */
const PUBLIC_SCHEMA = `(select oid from pg_namespace where nspname = 'public')`;

const STRUCTURE: Array<[string, string]> = [
  ["tabelas", `select count(*)::int as n from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'`],
  ["tipos enum", `select count(*)::int as n from pg_type
     where typtype = 'e' and typnamespace = ${PUBLIC_SCHEMA}`],
  ["índices", `select count(*)::int as n from pg_indexes where schemaname = 'public'`],
  ["chaves estrangeiras", `select count(*)::int as n from pg_constraint
     where contype = 'f' and connamespace = ${PUBLIC_SCHEMA}`],
  ["constraints CHECK", `select count(*)::int as n from pg_constraint
     where contype = 'c' and connamespace = ${PUBLIC_SCHEMA}`],
  ["gatilhos", `select count(*)::int as n from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     where not t.tgisinternal and c.relnamespace = ${PUBLIC_SCHEMA}`],
];

const SEED_DATA: Array<[string, string]> = [
  ["planos", "plans"],
  ["limites de plano", "plan_limits"],
  ["níveis", "levels"],
  ["configurações dos motores", "engine_configs"],
  ["bancas", "exam_boards"],
  ["disciplinas canônicas", "canonical_subjects"],
  ["assuntos canônicos", "canonical_topics"],
  ["sinônimos de assunto", "canonical_topic_aliases"],
  ["questões", "questions"],
  ["alternativas", "question_options"],
  ["missões", "missions"],
  ["documentos legais", "legal_documents"],
];

const USAGE: Array<[string, string]> = [
  ["usuários", "users"],
  ["preparações", "preparations"],
  ["tarefas do dia", "daily_tasks"],
  ["revisões agendadas", "review_occurrences"],
  ["respostas de questões", "question_attempts"],
  ["itens na fila de mapeamento", "topic_mapping_queue"],
];

async function main() {
  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");

  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 30 });

  try {
    const host = new URL(url).hostname;
    console.log(`Banco: ${host}\n`);

    console.log("ESTRUTURA");
    for (const [label, query] of STRUCTURE) {
      const rows = await sql.unsafe<Array<{ n: number }>>(query);
      console.log(`  ${label.padEnd(28)} ${rows[0].n}`);
    }

    console.log("\nDADOS INICIAIS");
    for (const [label, table] of SEED_DATA) {
      const rows = await sql.unsafe<Array<{ n: number }>>(
        `select count(*)::int as n from ${table}`,
      );
      console.log(`  ${label.padEnd(28)} ${rows[0].n}`);
    }

    console.log("\nUSO");
    for (const [label, table] of USAGE) {
      const rows = await sql.unsafe<Array<{ n: number }>>(
        `select count(*)::int as n from ${table}`,
      );
      console.log(`  ${label.padEnd(28)} ${rows[0].n}`);
    }

    /* --- checagens que valem mais que a contagem --------------------------- */
    console.log("\nSANIDADE");

    const activeConfigs = await sql<Array<{ kind: string; version: number }>>`
      select kind, version from engine_configs where is_active order by kind
    `;
    console.log(
      `  ${"configuração ativa por tipo".padEnd(28)} ${activeConfigs.length}` +
        (activeConfigs.length === 0 ? "  ⚠ os motores não geram tarefa sem isso" : ""),
    );


    const orphanQuestions = await sql<Array<{ n: number }>>`
      select count(*)::int as n from questions q
      where q.status = 'published'
        and (select count(*) from question_options o
             where o.question_id = q.id and o.is_correct) <> 1
    `;
    const orphans = orphanQuestions[0].n;
    console.log(
      `  ${"questões sem gabarito único".padEnd(28)} ${orphans}` +
        (orphans > 0 ? "  ⚠ verifique a importação" : ""),
    );

    const publishedPolicy = await sql<Array<{ n: number }>>`
      select count(*)::int as n from legal_documents
      where type = 'privacy' and is_current
    `;
    console.log(
      `  ${"política de privacidade no ar".padEnd(28)} ${publishedPolicy[0].n === 0 ? "não" : "sim"}` +
        (publishedPolicy[0].n === 0 ? "  ⚠ obrigatória antes do lançamento" : ""),
    );

    /**
     * Versão ativa e quantas já existiram de cada tipo.
     *
     * Mais de uma versão significa que a configuração já foi alterada — e é
     * exatamente esse histórico que permite explicar uma tarefa antiga com os
     * pesos que valiam no dia dela.
     */
    const versions = await sql<Array<{ kind: string; active: number; total: number }>>`
      select kind,
             max(version) filter (where is_active) as active,
             count(*)::int as total
      from engine_configs group by kind order by kind
    `;
    console.log("\nCONFIGURAÇÃO DOS MOTORES");
    for (const row of versions) {
      const historico = row.total > 1 ? `  (${row.total} versões no histórico)` : "";
      console.log(`  ${row.kind.padEnd(28)} v${row.active}${historico}`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
