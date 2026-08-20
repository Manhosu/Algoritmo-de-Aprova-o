import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Aplica as migrations pendentes.
 *
 * Roda pela conexão DIRETA (porta 5432) e com `max: 1`. O pooler do Supabase em
 * modo transaction não sustenta DDL de forma confiável, e mais de uma conexão
 * aplicando migration ao mesmo tempo é uma corrida com resultado imprevisível.
 */
async function main() {
  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "DATABASE_URL (ou DATABASE_URL_DIRECT) não definida. " +
        "Copie o .env.example para .env.local antes de migrar.",
    );
  }

  const connection = postgres(url, { max: 1, prepare: false });
  const db = drizzle(connection, { casing: "snake_case" });

  console.log("Aplicando migrations...");
  const startedAt = Date.now();

  await migrate(db, { migrationsFolder: "./drizzle" });

  console.log(`Migrations aplicadas em ${Date.now() - startedAt}ms.`);
  await connection.end();
}

main().catch((error) => {
  console.error("Falha ao aplicar migrations:", error);
  process.exit(1);
});
