import "server-only";

import { and, eq } from "drizzle-orm";

import { toCivilDate } from "@/modules/shared/dates";
import { APP_TIMEZONE } from "@/config/app";
import { db } from "@/server/db";
import { contentProgress } from "@/server/db/schema";

import { awardCoins, awardXp, coinValues, markActivity, xpEntriesFor } from "./progress";

/**
 * A RECOMPENSA POR ESTUDAR UM MATERIAL DA BIBLIOTECA (pedido de 02/09/2026).
 * ============================================================================
 *
 * Palavras da cliente: "o aluno deveria ganhar moedas ao estudar os materiais".
 * Ele não ganhava nada: `markMaterialComplete` gravava o progresso e parava ali.
 *
 * ⚠️ PAGA UMA VEZ POR MATERIAL, e a garantia é o índice do ledger.
 *
 * `(usuário, atividade, tipo de origem, id de origem)` é único, e a origem aqui
 * é o id do item de conteúdo. Clicar de novo, ou clicar em duas abas, cai no
 * `onConflictDoNothing` e não paga a segunda vez. Sem isso, "marcar como
 * estudado" viraria um botão de imprimir moeda.
 *
 * ⚠️ E NÃO AGENDA REVISÃO, de propósito.
 *
 * Quem agenda é `completeStudy`, a partir de um item da Tarefa do Dia, que tem
 * um assunto do plano por trás. Um material da biblioteca pode não estar no
 * edital de ninguém — criar uma série de revisões a partir dele encheria o
 * calendário do aluno de compromissos que o algoritmo não pediu.
 */

export type MaterialRewardResult = {
  /** Zero quando o material já tinha sido pago antes. */
  xpEarned: number;
  coinsEarned: number;
};

export async function rewardMaterialStudied(input: {
  userId: string;
  contentItemId: string;
  now?: Date;
}): Promise<MaterialRewardResult> {
  const agora = input.now ?? new Date();
  const hoje = toCivilDate(agora, APP_TIMEZONE);

  /*
    ⚠️ A CHECAGEM ACONTECE ANTES DE ABRIR TRANSAÇÃO.

    O caso comum é o aluno reabrindo um material que já estudou, e nele não há
    nada a escrever. Abrir transação para descobrir isso gastaria uma conexão do
    pool — que tem teto de 15 clientes no plano atual — por nada.

    Não é a garantia de idempotência: essa é o índice único do ledger, que vale
    mesmo com dois cliques simultâneos passando os dois por aqui.
  */
  const [progresso] = await db
    .select({ status: contentProgress.status })
    .from(contentProgress)
    .where(
      and(
        eq(contentProgress.userId, input.userId),
        eq(contentProgress.contentItemId, input.contentItemId),
      ),
    )
    .limit(1);

  if (progresso?.status === "completed") return { xpEarned: 0, coinsEarned: 0 };

  const [xp, moedas] = await Promise.all([xpEntriesFor("study"), coinValues()]);

  return db.transaction(async (tx) => {
    const xpEarned = await awardXp(tx, {
      userId: input.userId,
      entries: xp.entries,
      sourceType: "content_item",
      sourceId: input.contentItemId,
      engineConfigId: xp.engineConfigId,
      occurredAt: agora,
      occurredDate: hoje,
    });

    const coinsEarned = await awardCoins(tx, {
      userId: input.userId,
      amount: moedas.materialStudied,
      reason: "earned_activity",
      sourceType: "content_item",
      sourceId: input.contentItemId,
      occurredAt: agora,
      occurredDate: hoje,
    });

    /*
      Estudar material conta como dia ativo. Sem isto, quem passa a tarde nos
      mapas mentais perde a sequência por não ter respondido questão — e a
      sequência é o que a Home mostra em destaque.
    */
    await markActivity(tx, {
      userId: input.userId,
      date: hoje,
      kind: "study",
      xpEarned,
      coinsPerStreakDay: moedas.streakDay,
      now: agora,
    });

    return { xpEarned, coinsEarned };
  });
}
