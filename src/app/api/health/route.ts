import { sql } from "drizzle-orm";

import { db } from "@/server/db";

/**
 * Saúde e latência do banco, vistas de dentro do servidor.
 *
 * ⚠️ EXISTE PARA RESPONDER "ONDE ESTÃO OS SEGUNDOS", e não por completude.
 *
 * Responder uma questão levava 7 segundos em produção. No meu computador o
 * mesmo caminho levava 700 ms. Sem medir de DENTRO do servidor não há como
 * separar as três hipóteses: rede do usuário, render da página, ou distância
 * entre a função e o banco. As duas primeiras eu já tinha medido pelo
 * navegador; esta é a terceira.
 *
 * ⚠️ NÃO EXPÕE DADO NENHUM. Só tempos e a contagem de idas. Está na lista de
 * rotas públicas porque um monitor externo precisa alcançá-la sem sessão, e
 * porque saber que o banco responde não conta nada sobre ninguém.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const inicio = Date.now();

  /* Uma ida trivial: mede a distância, sem trabalho de banco no meio. */
  const t1 = Date.now();
  await db.execute(sql`select 1`);
  const idaSimples = Date.now() - t1;

  /* Dez idas em série: é a forma do caminho de responder uma questão. */
  const t2 = Date.now();
  for (let i = 0; i < 10; i += 1) {
    await db.execute(sql`select 1`);
  }
  const dezEmSerie = Date.now() - t2;

  /*
    Três em paralelo: mostra se o gargalo é a distância ou o pool.

    ⚠️ TRÊS, e não dez, porque `max: 3` é o tamanho do pool. Pedir dez em
    paralelo estoura o pooler em modo sessão — este endpoint já derrubou o
    banco uma vez com `EMAXCONNSESSION: max clients reached in session mode`.
    Uma sonda de saúde que causa a doença não serve.
  */
  const t3 = Date.now();
  await Promise.all(Array.from({ length: 3 }, () => db.execute(sql`select 1`)));
  const tresEmParalelo = Date.now() - t3;

  /* Uma transação vazia: o custo de BEGIN e COMMIT, que toda escrita paga. */
  const t4 = Date.now();
  await db.transaction(async (tx) => {
    await tx.execute(sql`select 1`);
  });
  const transacaoVazia = Date.now() - t4;

  return Response.json(
    {
      ok: true,
      idaSimplesMs: idaSimples,
      dezEmSerieMs: dezEmSerie,
      mediaPorIdaMs: Math.round(dezEmSerie / 10),
      tresEmParaleloMs: tresEmParalelo,
      transacaoVaziaMs: transacaoVazia,
      totalMs: Date.now() - inicio,
      regiao: process.env.VERCEL_REGION ?? "local",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
