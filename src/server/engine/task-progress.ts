import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { dailyTaskItems, dailyTasks } from "@/server/db/schema";

/**
 * O contador de itens concluídos da Tarefa do Dia.
 *
 * Fica num arquivo próprio porque DOIS caminhos o atualizam — responder questão
 * (`questions/service`) e concluir estudo (`engine/review`) — e duplicar a
 * lógica é como os dois lados acabam discordando sobre o que "tarefa concluída"
 * significa.
 *
 * A contagem é RECALCULADA a partir das linhas, nunca incrementada. Um contador
 * que só sobe fica errado na primeira falha de escrita, e a barra de progresso
 * do aluno passa a mentir sem que ninguém perceba.
 */

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function recountTask(
  tx: Transaction,
  dailyTaskId: string,
  now: Date,
): Promise<void> {
  const [row] = await tx
    .select({
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${dailyTaskItems.status} = 'completed')::int`,
    })
    .from(dailyTaskItems)
    .where(eq(dailyTaskItems.dailyTaskId, dailyTaskId));

  const total = row?.total ?? 0;
  const done = row?.done ?? 0;

  await tx
    .update(dailyTasks)
    .set({
      itemsCompleted: done,
      status: done === 0 ? "generated" : done >= total ? "completed" : "in_progress",
      // O carimbo de conclusão volta a ser nulo se um item for reaberto: uma
      // tarefa "concluída em" com item pendente seria um registro que se
      // contradiz.
      completedAt: done >= total && total > 0 ? now : null,
      updatedAt: now,
    })
    .where(eq(dailyTasks.id, dailyTaskId));
}
