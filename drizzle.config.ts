import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Migrations e introspecção usam a conexão DIRETA (porta 5432), não o pooler.
 * O pooler do Supabase em modo transaction não suporta DDL de forma confiável.
 */
const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL (ou DATABASE_URL_DIRECT) não definida. " +
      "Copie o .env.example para .env.local antes de rodar o drizzle-kit.",
  );
}

export default defineConfig({
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },

  /**
   * Escrevemos as colunas em camelCase no TypeScript e o drizzle converte para
   * snake_case no banco. Mantém o TS idiomático e o SQL idiomático ao mesmo
   * tempo, sem repetir o nome de cada coluna duas vezes.
   *
   * O cliente em `src/server/db/index.ts` usa a MESMA opção — se as duas
   * divergirem, as queries quebram em runtime.
   */
  casing: "snake_case",

  verbose: true,
  strict: true,
});
