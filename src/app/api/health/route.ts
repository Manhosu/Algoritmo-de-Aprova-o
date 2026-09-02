import { sql } from "drizzle-orm";

import { db } from "@/server/db";

/**
 * Saúde e latência do banco, vistas de dentro do servidor.
 *
 * ⚠️ EXISTE PORQUE RESPONDEU UMA PERGUNTA QUE O NAVEGADOR NÃO RESPONDIA.
 *
 * Responder uma questão levava 5 segundos em produção e o render da mesma
 * página levava 250 ms. Medindo de fora não dava para separar rede, render e
 * distância até o banco. Este endpoint mediu de dentro: 115 ms por ida, região
 * `iad1`, com o banco em `sa-east-1`. A função rodava em Washington e o banco
 * em São Paulo. Ver `docs/regiao-e-latencia.md`.
 *
 * ⚠️ UMA CONSULTA SÓ, e isso é uma correção.
 *
 * A primeira versão fazia quinze — uma simples, dez em série, três em paralelo
 * e uma transação — e segurava as três conexões do pool. Com ela, TRÊS chamadas
 * simultâneas devolviam 500: a sonda de saúde era a maior carga do sistema, e
 * eu quase concluí que o produto não aguentava concorrência. Ele aguenta: 48
 * páginas autenticadas simultâneas responderam 200, com mediana de 323 ms.
 *
 * O que a investigação precisava (média por ida em série) foi feito uma vez e
 * está documentado. O que fica é o mínimo para um monitor externo: o banco
 * responde, quanto demora uma ida, e de onde.
 *
 * ⚠️ NÃO EXPÕE DADO NENHUM. Só tempo e região.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const inicio = Date.now();

  try {
    await db.execute(sql`select 1`);
  } catch {
    /*
      Falha de banco é 503, não 500: o serviço existe e está indisponível.
      Um monitor externo distingue as duas coisas, e a mensagem não conta nada
      sobre a causa para quem não deveria saber.
    */
    return Response.json(
      { ok: false, regiao: process.env.VERCEL_REGION ?? "local" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const idaMs = Date.now() - inicio;

  return Response.json(
    {
      ok: true,
      idaMs,
      regiao: process.env.VERCEL_REGION ?? "local",
      /*
        ⚠️ A região precisa ser a mesma do banco (`sa-east-1` → `gru1`). Se isto
        voltar a dizer `iad1`, alguém removeu o `vercel.json` ou a configuração
        foi sobrescrita no painel da Vercel, e o produto inteiro fica 20x mais
        lento sem nenhum erro aparecer.
      */
      regiaoEsperada: "gru1",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
