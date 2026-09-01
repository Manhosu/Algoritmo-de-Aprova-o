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

/**
 * Devolve se ESTA chamada foi a que fechou a tarefa.
 *
 * ⚠️ A transição importa, não o estado. `completed_tasks_count` no funil conta
 * tarefas concluídas; somar sempre que a tarefa ESTIVER concluída faria cada
 * reabertura e refechamento contar de novo, e o número subiria sozinho até não
 * significar nada.
 */
export async function recountTask(
  tx: Transaction,
  dailyTaskId: string,
  now: Date,
): Promise<{ justCompleted: boolean }> {
  /*
    O status anterior vem no MESMO SELECT, pelo join. Uma segunda consulta só
    para lê-lo custaria outra volta de rede em todo caminho de resposta e de
    estudo concluído. `max(...)` porque a coluna não está no `group by` — o join
    é para um único registro, então o máximo é o próprio valor.
  */
  const [row] = await tx
    .select({
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${dailyTaskItems.status} = 'completed')::int`,
      statusAnterior: sql<string>`max(${dailyTasks.status}::text)`,
    })
    .from(dailyTaskItems)
    .innerJoin(dailyTasks, eq(dailyTasks.id, dailyTaskItems.dailyTaskId))
    .where(eq(dailyTaskItems.dailyTaskId, dailyTaskId));

  const total = row?.total ?? 0;
  const done = row?.done ?? 0;
  const concluida = total > 0 && done >= total;

  await tx
    .update(dailyTasks)
    .set({
      itemsCompleted: done,
      status: done === 0 ? "generated" : concluida ? "completed" : "in_progress",
      // O carimbo de conclusão volta a ser nulo se um item for reaberto: uma
      // tarefa "concluída em" com item pendente seria um registro que se
      // contradiz.
      completedAt: concluida ? now : null,
      updatedAt: now,
    })
    .where(eq(dailyTasks.id, dailyTaskId));

  return { justCompleted: concluida && row?.statusAnterior !== "completed" };
}
