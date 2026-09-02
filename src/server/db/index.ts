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
 * daí o `max` baixo abaixo.
 *
 * ⚠️ O TETO DELE TEM NOME: `pool_size: 15`. É o que o Supabase responde quando
 * estoura: `EMAXCONNSESSION: max clients reached in session mode - max clients
 * are limited to pool_size: 15`. Quinze CLIENTES no total, somando toda função
 * serverless viva, mais qualquer script rodando na máquina de alguém.
 *
 * Quando a concorrência crescer além disso, a saída é aumentar o pool no painel
 * do Supabase — nunca voltar para o 6543. A medição de 6543 acima continua
 * valendo: ele trava em silêncio, que é o pior modo de falhar.
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
     * UMA conexão por instância. Era 3, e a troca tem uma história.
     *
     * ⚠️ O TETO DO SUPABASE É `pool_size: 15` CLIENTES. Com 3 por instância,
     * cinco funções simultâneas esgotavam o banco e as seguintes recebiam
     * `EMAXCONNSESSION: max clients reached in session mode`. Com 1, cabem
     * quinze instâncias — o triplo de alunos ao mesmo tempo, sem tocar em
     * infraestrutura.
     *
     * A nota antiga defendia `max` maior porque `Promise.all` de leituras é o
     * padrão nas telas: a Home faz quatro. Com `max: 1` elas passam a ir em
     * série pela mesma conexão.
     *
     * ⚠️ ESSE ARGUMENTO CAIU QUANDO A REGIÃO FOI CORRIGIDA. Cada ida ao banco
     * custava 115 ms (função em `iad1`, banco em `sa-east-1`) e passou a custar
     * 2 ms. Serializar quatro leituras custava 460 ms e passou a custar 8 ms.
     * Ver `docs/regiao-e-latencia.md`.
     *
     * Oito milissegundos por tela é preço barato por triplicar a concorrência
     * que o produto suporta.
     *
     * ⚠️ Com `max: 1`, chamar `db.` DENTRO de um callback de transação trava:
     * a transação segura a única conexão e a consulta nova espera por ela para
     * sempre. Dentro de `db.transaction` use SEMPRE o `tx`. Conferido: hoje
     * nenhum arquivo faz isso.
     */
    max: 1,
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
