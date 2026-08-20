import { config } from "dotenv";
import postgres from "postgres";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Confere se o banco configurado responde, pelas DUAS conexões.
 *
 * Existe porque o Supabase expõe dois endereços com papéis diferentes, e trocar
 * um pelo outro produz falhas intermitentes difíceis de diagnosticar:
 *
 *   • porta 6543 (pooler, modo transaction) — é o que a aplicação usa. Exige
 *     `prepare: false`: prepared statements não sobrevivem à troca de conexão
 *     do pooler e a query quebra só sob carga, em produção.
 *
 *   • porta 5432 (direta) — é o que migrations e backup usam. O pooler em modo
 *     transaction não sustenta DDL de forma confiável.
 *
 * Uso: npm run db:ping
 */

type Target = { label: string; url: string | undefined; note: string };

const targets: Target[] = [
  {
    label: "aplicação (pooler, 6543)",
    url: process.env.DATABASE_URL,
    note: "usada pelas telas e rotas",
  },
  {
    label: "migrations (direta, 5432)",
    url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL,
    note: "usada por db:migrate e pelo backup",
  },
];

async function ping(target: Target): Promise<boolean> {
  if (!target.url) {
    console.log(`  ✗ ${target.label} — não configurada`);
    return false;
  }

  const sql = postgres(target.url, { max: 1, prepare: false, connect_timeout: 30 });

  try {
    const started = Date.now();
    const rows = await sql<Array<{ version: string; db: string; tables: number }>>`
      select
        version() as version,
        current_database() as db,
        (select count(*)::int from information_schema.tables
          where table_schema = 'public' and table_type = 'BASE TABLE') as tables
    `;
    const elapsed = Date.now() - started;
    const row = rows[0];

    console.log(`  ✓ ${target.label} — ${elapsed}ms`);
    console.log(`      ${row.version.split(" on ")[0]}`);
    console.log(`      banco "${row.db}", ${row.tables} tabela(s) no schema public`);
    return true;
  } catch (error) {
    console.log(`  ✗ ${target.label} — ${error instanceof Error ? error.message : error}`);
    return false;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  console.log("Testando conexão com o banco...\n");

  let allOk = true;
  for (const target of targets) {
    const ok = await ping(target);
    if (!ok) allOk = false;
  }

  console.log("");
  if (!allOk) {
    console.log("Alguma conexão falhou. Confira DATABASE_URL e DATABASE_URL_DIRECT no .env.local.");
    process.exit(1);
  }
  console.log("As duas conexões respondem.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
