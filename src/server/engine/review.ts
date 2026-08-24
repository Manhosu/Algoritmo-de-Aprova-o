import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { APP_TIMEZONE } from "@/config/app";
import {
  completeReview,
  selectDueReviews,
  startReviewSeries,
} from "@/modules/review/engine";
import { toCivilDate, type CivilDate } from "@/modules/shared/dates";
import { db } from "@/server/db";
import {
  dailyTaskItems,
  reviewOccurrences,
  reviewSchedules,
  studyLogs,
  studyPlanSubjects,
  studyPlanTopics,
  topicStates,
} from "@/server/db/schema";

import { getActiveConfig } from "./config";
import {
  applyStudyToTopicState,
  awardXp,
  markActivity,
  xpEntriesFor,
} from "./progress";
import { recountTask } from "./task-progress";

/**
 * MOTOR 2 — REVISÕES ESPAÇADAS (README 1.7).
 * ============================================================================
 *
 * ⚠️ SEPARADO DO MOTOR 1. Este arquivo não lê pesos da Tarefa do Dia, não
 * consulta prioridade e não altera `daily_tasks`. O único ponto de contato
 * entre os dois é um NÚMERO de minutos que o Motor 1 desconta do dia — e ele
 * atravessa de lá para cá, nunca ao contrário.
 *
 * A regra é do README e tem uma razão prática: misturar os dois faria a
 * aderência às revisões medir a Tarefa do Dia, e a Tarefa do Dia depender da
 * agenda de revisão. Nenhuma das duas métricas significaria mais o que diz.
 *
 * O CICLO
 * ----------------------------------------------------------------------------
 *   estudo concluído → nasce a série → 24h → 7 → 30 → 60 → 90 dias
 *
 * Só a PRIMEIRA etapa nasce agendada. As demais dependem de quando a anterior
 * for realmente feita, não de quando estava prevista. Ver `startReviewSeries`.
 */

/* ========================================================================== *
 * ESTUDO CONCLUÍDO — O GATILHO
 * ========================================================================== */

export type CompleteStudyResult =
  | { ok: true; studyLogId: string; firstReviewOn: CivilDate; xpEarned: number }
  | { ok: false; reason: "not_found" | "already_completed" };

/**
 * Marca um item de estudo como concluído e faz nascer a série de revisões.
 *
 * É o único gatilho automático do Motor 2 (`trigger = 'study_completed'`).
 * Responder questão NÃO agenda revisão: praticar não é a mesma coisa que
 * estudar o conteúdo, e a curva do esquecimento que este motor combate é a do
 * material visto, não a do exercício feito.
 */
export async function completeStudy(input: {
  userId: string;
  dailyTaskItemId: string;
  minutes?: number;
  now?: Date;
}): Promise<CompleteStudyResult> {
  const now = input.now ?? new Date();
  const today = toCivilDate(now, APP_TIMEZONE);

  const [item] = await db
    .select({
      id: dailyTaskItems.id,
      dailyTaskId: dailyTaskItems.dailyTaskId,
      preparationId: dailyTaskItems.preparationId,
      planTopicId: dailyTaskItems.planTopicId,
      kind: dailyTaskItems.kind,
      status: dailyTaskItems.status,
      technique: dailyTaskItems.technique,
      targetMinutes: dailyTaskItems.targetMinutes,
    })
    .from(dailyTaskItems)
    .where(eq(dailyTaskItems.id, input.dailyTaskItemId))
    .limit(1);

  if (!item || item.kind !== "study") return { ok: false, reason: "not_found" };
  if (item.status === "completed") return { ok: false, reason: "already_completed" };

  const [intervals, xp] = await Promise.all([
    getActiveConfig("review_intervals"),
    xpEntriesFor("study"),
  ]);

  const series = startReviewSeries({
    studyCompletedAt: now,
    intervals: intervals.value,
    timeZone: APP_TIMEZONE,
  });

  const minutes = input.minutes ?? item.targetMinutes ?? 0;
  let earned = 0;

  const studyLogId = await db.transaction(async (tx) => {
    const [log] = await tx
      .insert(studyLogs)
      .values({
        userId: input.userId,
        preparationId: item.preparationId,
        planTopicId: item.planTopicId,
        dailyTaskItemId: item.id,
        technique: item.technique,
        minutesSpent: minutes,
        completedAt: now,
        completedDate: today,
      })
      .returning({ id: studyLogs.id });

    const [schedule] = await tx
      .insert(reviewSchedules)
      .values({
        preparationId: item.preparationId,
        userId: input.userId,
        planTopicId: item.planTopicId,
        trigger: "study_completed",
        triggeredByStudyLogId: log.id,
        status: "active",
        currentStageIndex: 0,
        totalStages: series.totalStages,
        engineConfigId: intervals.id,
        startedAt: now,
      })
      .returning({ id: reviewSchedules.id });

    /**
     * Só a primeira ocorrência é gravada.
     *
     * Materializar as cinco criaria quatro datas que estarão erradas assim que
     * o aluno atrasar uma revisão — e corrigi-las depois seria reescrever o
     * compromisso, apagando o atraso que a métrica de aderência precisa medir.
     */
    await tx.insert(reviewOccurrences).values({
      reviewScheduleId: schedule.id,
      preparationId: item.preparationId,
      userId: input.userId,
      planTopicId: item.planTopicId,
      stageIndex: series.firstStage.stageIndex,
      intervalDays: series.firstStage.intervalDays,
      dueDate: series.firstStage.dueDate,
      dueAt: series.firstStage.dueAt,
      status: "scheduled",
    });

    await tx
      .update(dailyTaskItems)
      .set({
        status: "completed",
        startedAt: sql`coalesce(${dailyTaskItems.startedAt}, ${now.toISOString()}::timestamptz)`,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(dailyTaskItems.id, item.id));

    await applyStudyToTopicState(tx, {
      planTopicId: item.planTopicId,
      minutes,
      completedAt: now,
    });

    earned = await awardXp(tx, {
      userId: input.userId,
      entries: xp.entries,
      sourceType: "study_log",
      sourceId: log.id,
      engineConfigId: xp.engineConfigId,
      occurredAt: now,
      occurredDate: today,
    });

    await markActivity(tx, {
      userId: input.userId,
      date: today,
      kind: "study",
      xpEarned: earned,
      now,
    });

    await recountTask(tx, item.dailyTaskId, now);

    return log.id;
  });

  return {
    ok: true,
    studyLogId,
    firstReviewOn: series.firstStage.dueDate,
    xpEarned: earned,
  };
}

/* ========================================================================== *
 * REVISÕES PARA HOJE
 * ========================================================================== */

export type DueReviewView = {
  occurrenceId: string;
  planTopicId: string;
  topicName: string;
  subjectName: string;
  topicSlug: string | null;
  stageIndex: number;
  intervalDays: number;
  dueDate: CivilDate;
  daysLate: number;
  isLate: boolean;
};

export type ReviewsToday = {
  due: DueReviewView[];
  /** Quantas vencem nos próximos 7 dias, para o aluno saber o que vem. */
  upcoming: number;
  /** Aderência histórica, 0–100. Alimenta o Índice de Preparação. */
  adherencePercent: number;
};

/**
 * A tela "Revisões para Hoje" (README 1.7).
 *
 * Inclui as VENCIDAS de dias anteriores. A revisão atrasada acumula, não some:
 * uma revisão que desaparece por não ter sido feita no dia certo transformaria
 * o esquecimento em silêncio, que é o problema que este motor existe para
 * combater.
 *
 * Ordem: as mais atrasadas primeiro. Quem está devendo há duas semanas precisa
 * ver isso antes do que vence hoje.
 */
export async function getReviewsToday(input: {
  userId: string;
  preparationId?: string | null;
  now?: Date;
}): Promise<ReviewsToday> {
  const now = input.now ?? new Date();
  const today = toCivilDate(now, APP_TIMEZONE);

  const conditions = [eq(reviewOccurrences.userId, input.userId)];
  if (input.preparationId) {
    conditions.push(eq(reviewOccurrences.preparationId, input.preparationId));
  }

  const rows = await db
    .select({
      occurrenceId: reviewOccurrences.id,
      planTopicId: reviewOccurrences.planTopicId,
      stageIndex: reviewOccurrences.stageIndex,
      intervalDays: reviewOccurrences.intervalDays,
      dueDate: reviewOccurrences.dueDate,
      status: reviewOccurrences.status,
      topicName: studyPlanTopics.displayName,
      subjectName: studyPlanSubjects.displayName,
      canonicalTopicId: studyPlanTopics.canonicalTopicId,
    })
    .from(reviewOccurrences)
    .innerJoin(studyPlanTopics, eq(reviewOccurrences.planTopicId, studyPlanTopics.id))
    .innerJoin(studyPlanSubjects, eq(studyPlanTopics.planSubjectId, studyPlanSubjects.id))
    .where(and(...conditions))
    .orderBy(asc(reviewOccurrences.dueDate));

  const slugs = await topicSlugs(
    rows.map((r) => r.canonicalTopicId).filter((id): id is string => id !== null),
  );

  const due = selectDueReviews(
    rows.map((row) => ({ ...row, dueDate: row.dueDate as CivilDate })),
    today,
  );

  const scheduled = rows.filter((row) => row.status === "scheduled");
  const upcoming = scheduled.filter((row) => {
    const days = daysAhead(today, row.dueDate as CivilDate);
    return days > 0 && days <= 7;
  }).length;

  const completed = rows.filter((row) => row.status === "completed").length;
  const overdue = due.filter((item) => item.isLate).length;
  const denominator = completed + overdue;

  return {
    due: due.map((item) => ({
      occurrenceId: item.occurrence.occurrenceId,
      planTopicId: item.occurrence.planTopicId,
      topicName: item.occurrence.topicName,
      subjectName: item.occurrence.subjectName,
      topicSlug: item.occurrence.canonicalTopicId
        ? (slugs.get(item.occurrence.canonicalTopicId) ?? null)
        : null,
      stageIndex: item.occurrence.stageIndex,
      intervalDays: item.occurrence.intervalDays,
      dueDate: item.occurrence.dueDate,
      daysLate: item.daysLate,
      isLate: item.isLate,
    })),
    upcoming,
    adherencePercent:
      denominator === 0 ? 100 : Math.round((completed / denominator) * 100),
  };
}

async function topicSlugs(canonicalIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (canonicalIds.length === 0) return result;

  const rows = await db.query.canonicalTopics.findMany({
    where: (t, { inArray }) => inArray(t.id, canonicalIds),
    columns: { id: true, slug: true },
  });

  for (const row of rows) result.set(row.id, row.slug);
  return result;
}

function daysAhead(from: CivilDate, to: CivilDate): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/* ========================================================================== *
 * CONCLUIR UMA REVISÃO
 * ========================================================================== */

export type CompleteReviewOutcome =
  | {
      ok: true;
      isLate: boolean;
      daysLate: number;
      nextReviewOn: CivilDate | null;
      seriesCompleted: boolean;
      xpEarned: number;
    }
  | { ok: false; reason: "not_found" | "already_done" };

/**
 * Conclui uma revisão e agenda a seguinte.
 *
 * ⚠️ O próximo intervalo conta a partir da EXECUÇÃO REAL, não da data prevista
 * (decisão do Eduardo). Sem isso, quem revisasse com 10 dias de atraso receberia
 * a revisão seguinte já vencida — um acúmulo instantâneo, que é o oposto do que
 * a curva do esquecimento quer: o conteúdo acabou de ser revisto, está fresco, e
 * o intervalo tem que partir de agora.
 *
 * O atraso não é perdoado nem escondido: fica em `days_late` e alimenta a
 * aderência do Índice de Preparação.
 */
export async function completeReviewOccurrence(input: {
  userId: string;
  occurrenceId: string;
  performanceRating?: "easy" | "ok" | "hard";
  now?: Date;
}): Promise<CompleteReviewOutcome> {
  const now = input.now ?? new Date();
  const today = toCivilDate(now, APP_TIMEZONE);

  const [occurrence] = await db
    .select({
      id: reviewOccurrences.id,
      reviewScheduleId: reviewOccurrences.reviewScheduleId,
      preparationId: reviewOccurrences.preparationId,
      planTopicId: reviewOccurrences.planTopicId,
      stageIndex: reviewOccurrences.stageIndex,
      dueDate: reviewOccurrences.dueDate,
      status: reviewOccurrences.status,
    })
    .from(reviewOccurrences)
    .where(
      and(
        eq(reviewOccurrences.id, input.occurrenceId),
        eq(reviewOccurrences.userId, input.userId),
      ),
    )
    .limit(1);

  if (!occurrence) return { ok: false, reason: "not_found" };
  if (occurrence.status !== "scheduled") return { ok: false, reason: "already_done" };

  const [intervals, xp] = await Promise.all([
    getActiveConfig("review_intervals"),
    xpEntriesFor("review"),
  ]);

  const result = completeReview({
    occurrence: {
      stageIndex: occurrence.stageIndex,
      dueDate: occurrence.dueDate as CivilDate,
    },
    completedAt: now,
    intervals: intervals.value,
    timeZone: APP_TIMEZONE,
    performanceRating: input.performanceRating,
  });

  let earned = 0;

  await db.transaction(async (tx) => {
    await tx
      .update(reviewOccurrences)
      .set({
        status: "completed",
        completedAt: now,
        completedDate: result.completedDate,
        isLate: result.isLate,
        daysLate: result.daysLate,
        performanceRating: input.performanceRating ?? null,
        updatedAt: now,
      })
      .where(eq(reviewOccurrences.id, occurrence.id));

    if (result.nextStage) {
      await tx.insert(reviewOccurrences).values({
        reviewScheduleId: occurrence.reviewScheduleId,
        preparationId: occurrence.preparationId,
        userId: input.userId,
        planTopicId: occurrence.planTopicId,
        stageIndex: result.nextStage.stageIndex,
        intervalDays: result.nextStage.intervalDays,
        dueDate: result.nextStage.dueDate,
        dueAt: result.nextStage.dueAt,
        status: "scheduled",
      });

      await tx
        .update(reviewSchedules)
        .set({ currentStageIndex: result.nextStage.stageIndex, updatedAt: now })
        .where(eq(reviewSchedules.id, occurrence.reviewScheduleId));
    } else {
      await tx
        .update(reviewSchedules)
        .set({ status: "completed", completedAt: now, updatedAt: now })
        .where(eq(reviewSchedules.id, occurrence.reviewScheduleId));
    }

    await tx
      .update(topicStates)
      .set({
        reviewsCompleted: sql`${topicStates.reviewsCompleted} + 1`,
        lastReviewedAt: now,
        /**
         * Concluir uma revisão é o único caminho para "dominado". Responder
         * questão sozinho não basta: o produto inteiro se apoia na ideia de que
         * o conteúdo revisado no espaçamento certo é o que fica.
         */
        coverageStatus: sql`case
          when ${topicStates.reviewsCompleted} + 1 >= 3 then 'mastered'::coverage_status
          when ${topicStates.coverageStatus} = 'not_started' then 'in_progress'::coverage_status
          else 'studied'::coverage_status end`,
        updatedAt: now,
      })
      .where(eq(topicStates.planTopicId, occurrence.planTopicId));

    earned = await awardXp(tx, {
      userId: input.userId,
      entries: xp.entries,
      sourceType: "review_occurrence",
      sourceId: occurrence.id,
      engineConfigId: xp.engineConfigId,
      occurredAt: now,
      occurredDate: today,
    });

    await markActivity(tx, {
      userId: input.userId,
      date: today,
      kind: "review",
      xpEarned: earned,
      now,
    });
  });

  return {
    ok: true,
    isLate: result.isLate,
    daysLate: result.daysLate,
    nextReviewOn: result.nextStage?.dueDate ?? null,
    seriesCompleted: result.seriesCompleted,
    xpEarned: earned,
  };
}

/**
 * Cancela as revisões de assuntos que saíram do plano.
 *
 * Chamado quando o aluno desativa um assunto ou encerra a preparação. Sem isto,
 * "Revisões para Hoje" continuaria cobrando revisão de conteúdo que ele decidiu
 * não estudar — e a aderência mediria uma dívida que não existe mais.
 */
export async function cancelReviewsForInactiveTopics(
  preparationId: string,
): Promise<number> {
  const result = await db
    .update(reviewOccurrences)
    .set({ status: "canceled", canceledAt: new Date() })
    .where(
      and(
        eq(reviewOccurrences.preparationId, preparationId),
        eq(reviewOccurrences.status, "scheduled"),
        sql`exists (
          select 1 from ${studyPlanTopics}
          where ${studyPlanTopics.id} = ${reviewOccurrences.planTopicId}
            and (${studyPlanTopics.isActive} = false or ${studyPlanTopics.deletedAt} is not null)
        )`,
      ),
    );

  return result.count;
}

/** Usado pelo cronograma: quantos assuntos ainda não foram estudados. */
export async function countPendingTopics(preparationId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(studyPlanTopics)
    .leftJoin(topicStates, eq(topicStates.planTopicId, studyPlanTopics.id))
    .where(
      and(
        eq(studyPlanTopics.preparationId, preparationId),
        eq(studyPlanTopics.isActive, true),
        isNull(studyPlanTopics.deletedAt),
        sql`coalesce(${topicStates.coverageStatus}, 'not_started') in ('not_started', 'in_progress')`,
      ),
    );

  return row?.total ?? 0;
}
