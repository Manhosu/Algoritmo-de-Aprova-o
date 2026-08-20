import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env, isProduction } from "@/config/env";

import * as schema from "./schema";

/**
 * Cliente do banco.
 *
 * POR QUE UM SINGLETON GLOBAL
 * ----------------------------------------------------------------------------
 * Em desenvolvimento o Next recarrega os módulos a cada alteração. Sem o cache
 * no `globalThis`, cada recarga abriria um novo pool e o Postgres do Supabase
 * esgotaria as conexões em poucos minutos de trabalho.
 *
 * `prepare: false` é OBRIGATÓRIO com o pooler do Supabase em modo transaction:
 * prepared statements não sobrevivem à troca de conexão do pooler e a query
 * falha de forma intermitente — o tipo de erro que só aparece em produção sob
 * carga.
 */
const globalForDb = globalThis as unknown as {
  connection: postgres.Sql | undefined;
};

const connection =
  globalForDb.connection ??
  postgres(env.DATABASE_URL, {
    prepare: false,
    max: isProduction ? 10 : 3,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (!isProduction) {
  globalForDb.connection = connection;
}

export const db = drizzle(connection, {
  schema,
  /**
   * Mesma opção do `drizzle.config.ts`. Se as duas divergirem, o TypeScript
   * continua compilando e as queries quebram em runtime — mantenha as duas
   * iguais.
   */
  casing: "snake_case",
  logger: !isProduction,
});

export type Database = typeof db;
export { schema };
