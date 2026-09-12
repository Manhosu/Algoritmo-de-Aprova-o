import "server-only";

import { and, eq } from "drizzle-orm";

import { APP_TIMEZONE } from "@/config/app";
import { addDays, toCivilDate, type CivilDate } from "@/modules/shared/dates";
import { db } from "@/server/db";
import { scheduleEntries, studyPlanTopics, topicStates } from "@/server/db/schema";

/**
 * O BOTÃO "MOVER" DO CRONOGRAMA.
 * ============================================================================
 *
 * Pedido da cliente em 11/09/2026: "é possível colocar um botão de mover nas
 * tarefas do cronograma, para o aluno ajustar o cronograma como preferir? É que
 * estou achando muito engessado".
 *
 * O movimento vira UMA linha em `schedule_entries` (origem `student_moved`,
 * fixada), e a projeção respeita essa linha a cada recálculo — ver
 * `ProjectScheduleInput.pins`. Mover de novo substitui a linha; "Automático"
 * apaga, e o assunto volta a ser posicionado pelo sistema.
 */

/** Horizonte quando a preparação não tem data de prova — o mesmo da projeção. */
const HORIZONTE_SEM_PROVA = 90;

export type ResultadoDoMovimento = { ok: true } | { ok: false; message: string };

export async function moverAssunto(input: {
  userId: string;
  preparationId: string;
  planTopicId: string;
  /** Nulo devolve o assunto ao posicionamento automático. */
  paraData: string | null;
  now?: Date;
}): Promise<ResultadoDoMovimento> {
  const now = input.now ?? new Date();
  const hoje = toCivilDate(now, APP_TIMEZONE);

  const preparacao = await db.query.preparations.findFirst({
    where: (t, { and: a, eq: e }) => a(e(t.id, input.preparationId), e(t.userId, input.userId)),
    columns: { id: true, status: true, examDate: true },
  });

  if (!preparacao || preparacao.status !== "active") {
    return { ok: false, message: "Não encontrei essa preparação." };
  }

  const [assunto] = await db
    .select({ id: studyPlanTopics.id, lastStudiedAt: topicStates.lastStudiedAt })
    .from(studyPlanTopics)
    .leftJoin(topicStates, eq(topicStates.planTopicId, studyPlanTopics.id))
    .where(
      and(
        eq(studyPlanTopics.id, input.planTopicId),
        eq(studyPlanTopics.preparationId, preparacao.id),
        eq(studyPlanTopics.isActive, true),
      ),
    )
    .limit(1);

  if (!assunto) return { ok: false, message: "Não encontrei esse assunto no seu cronograma." };
  if (assunto.lastStudiedAt) {
    return { ok: false, message: "Esse assunto já foi estudado e saiu do cronograma." };
  }

  if (input.paraData !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paraData)) {
      return { ok: false, message: "Escolha um dia." };
    }

    const fim =
      preparacao.examDate && preparacao.examDate > hoje
        ? (preparacao.examDate as CivilDate)
        : addDays(hoje, HORIZONTE_SEM_PROVA);

    /* Hoje é a missão, que já está montada; a véspera da prova é o limite. */
    if (input.paraData <= hoje) return { ok: false, message: "Escolha um dia a partir de amanhã." };
    if (input.paraData >= fim) return { ok: false, message: "Esse dia fica depois da prova." };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(scheduleEntries)
      .where(
        and(
          eq(scheduleEntries.preparationId, preparacao.id),
          eq(scheduleEntries.planTopicId, input.planTopicId),
          eq(scheduleEntries.source, "student_moved"),
        ),
      );

    if (input.paraData === null) return;

    await tx.insert(scheduleEntries).values({
      preparationId: preparacao.id,
      userId: input.userId,
      planTopicId: input.planTopicId,
      scheduledDate: input.paraData,
      kind: "study",
      source: "student_moved",
      isPinned: true,
      movedAt: now,
    });
  });

  return { ok: true };
}
