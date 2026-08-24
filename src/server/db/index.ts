import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env, isProduction } from "@/config/env";

import * as schema from "./schema";

/**
 * Cliente do banco.
 *
 * ⚠️ USE O POOLER DE SESSÃO (PORTA 5432), NUNCA O DE TRANSAÇÃO (6543)
 * ----------------------------------------------------------------------------
 * Medido neste projeto em 23/08/2026, contra o Supabase real:
 *
 *     pooler 6543 · 3 consultas em paralelo · ok  (226ms)
 *     pooler 6543 · 4 consultas em paralelo · TRAVA PARA SEMPRE
 *     pooler 5432 · 8 consultas em paralelo · ok  (129ms)
 *
 * A partir da quarta consulta simultânea, o pooler de transação para de
 * responder — não devolve erro, não fecha a conexão, simplesmente nunca
 * responde. E não adianta baixar `max`: com `max: 1` as quatro vão pela mesma
 * conexão e trava igual.
 *
 * Isso é fatal para este produto, porque `Promise.all` de leituras é o padrão
 * em toda tela que carrega mais de uma coisa — a Home faz quatro, o catálogo da
 * taxonomia faz quatro. Em produção seria uma requisição pendurada até o
 * timeout da função, sem nenhuma mensagem de erro para investigar.
 *
 * O pooler de SESSÃO (5432) é IPv4, aceita o protocolo completo e não tem esse
 * teto. Em troca, ele segura uma conexão do servidor por conexão de cliente —
 * daí o `max` baixo abaixo. Se um dia a concorrência crescer a ponto de esgotar
 * o pool, a saída é aumentar o pool no painel do Supabase, não voltar para o
 * 6543.
 *
 * POR QUE UM SINGLETON GLOBAL
 * ----------------------------------------------------------------------------
 * Em desenvolvimento o Next recarrega os módulos a cada alteração. Sem o cache
 * no `globalThis`, cada recarga abriria um novo pool e o Postgres do Supabase
 * esgotaria as conexões em poucos minutos de trabalho.
 *
 * `prepare: false` fica: é inofensivo em modo sessão e evita uma armadilha
 * silenciosa caso alguém volte a apontar a URL para um pooler de transação.
 */
const globalForDb = globalThis as unknown as {
  connection: postgres.Sql | undefined;
};

const connection =
  globalForDb.connection ??
  postgres(env.DATABASE_URL, {
    prepare: false,
    /**
     * Baixo de propósito. Em modo sessão, cada conexão de cliente ocupa uma
     * conexão do servidor enquanto viver; numa plataforma serverless, cada
     * instância manteria a sua. Poucas conexões por instância, liberadas rápido
     * pelo `idle_timeout`, é o que faz a conta fechar.
     */
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
  });

/**
 * Avisa quando a URL aponta para o pooler de transação.
 *
 * O sintoma do erro é a AUSÊNCIA de sintoma: a requisição fica pendurada até o
 * timeout da função, sem exceção e sem log. Um aviso no boot é a diferença
 * entre cinco minutos e uma tarde de investigação. Ver a nota acima.
 */
if (env.DATABASE_URL.includes(":6543")) {
  console.warn(
    "\n⚠️  DATABASE_URL aponta para o pooler de TRANSAÇÃO (porta 6543).\n" +
      "   A partir de 4 consultas simultâneas ele para de responder — e várias\n" +
      "   telas fazem exatamente isso. Troque a porta para 5432 (pooler de sessão).\n",
  );
}

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
