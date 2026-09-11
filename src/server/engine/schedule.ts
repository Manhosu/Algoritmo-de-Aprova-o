import "server-only";

import { and, count, eq, isNull, sql } from "drizzle-orm";

import { APP_TIMEZONE } from "@/config/app";
import {
  projectSchedule,
  type PendingTopic,
  type ScheduleProjection,
  type TodayPlanTopic,
  type WeeklyAvailability,
} from "@/modules/schedule";
import { toCivilDate, type CivilDate } from "@/modules/shared/dates";
import { db } from "@/server/db";
import {
  dailyTaskItems,
  dailyTasks,
  preparations,
  reviewOccurrences,
  studyPlanSubjects,
  studyPlanTopics,
  topicStates,
  userAvailability,
} from "@/server/db/schema";

import { getActiveConfig } from "./config";

/**
 * CRONOGRAMA ADAPTATIVO (README 1.8).
 * ============================================================================
 *
 * Item 9 do checklist de aceite: "o Cronograma Adaptativo muda quando o aluno
 * estuda ou responde questões".
 *
 * ELE É CALCULADO NA LEITURA, NÃO GRAVADO
 * ----------------------------------------------------------------------------
 * A projeção sai de `topic_states` — que muda a cada resposta e a cada estudo —
 * e é montada no momento de abrir a tela. Não existe tabela de "cronograma
 * congelado" para sincronizar.
 *
 * Essa é a diferença entre um cronograma que se adapta e um que finge: se as
 * semanas fossem gravadas, cada resposta exigiria reescrever dezenas de linhas,
 * e qualquer falha nessa escrita deixaria o aluno olhando para um plano que não
 * corresponde mais ao que ele fez. Calculando na leitura, o cronograma é
 * SEMPRE o reflexo do estado atual — por construção, não por disciplina de
 * escrita.
 *
 * O custo é uma projeção por abertura de tela. São 300 assuntos e aritmética
 * simples; cabe folgado.
 *
 * ⚠️ `schedule_entries` existe no schema para o Marco 2, quando o aluno puder
 * ARRASTAR um item para outro dia (`moveScheduleEntry`). Aí sim há uma decisão
 * humana que precisa sobreviver ao recálculo, e ela precisa de linha própria.
 */

/** Minutos estimados para cobrir um assunto do zero. */
const MINUTES_PER_TOPIC = 45;

export type ScheduleView = ScheduleProjection & {
  preparationTitle: string;
  examDate: CivilDate | null;
  examDateIsEstimated: boolean;
};

export async function getSchedule(input: {
  userId: string;
  preparationId: string;
  now?: Date;
}): Promise<ScheduleView | null> {
  const now = input.now ?? new Date();
  const today = toCivilDate(now, APP_TIMEZONE);

  const preparation = await db.query.preparations.findFirst({
    where: (t, { and: a, eq: e }) =>
      a(e(t.id, input.preparationId), e(t.userId, input.userId)),
    columns: { id: true, title: true, examDate: true, examDateIsEstimated: true },
  });

  if (!preparation) return null;

  const [pendingTopics, availability, reviewMinutes, scheduleParams, todayPlan] =
    await Promise.all([
      loadPendingTopics(input.preparationId),
      loadAvailability(input.userId),
      averageReviewMinutesPerDay(input.userId, today),
      getActiveConfig("schedule_params"),
      loadTodayPlan(input.preparationId, today),
    ]);

  const projection = projectSchedule({
    today,
    examDate: preparation.examDate as CivilDate | null,
    examDateIsEstimated: preparation.examDateIsEstimated,
    availability,
    pendingTopics,
    averageReviewMinutesPerDay: reviewMinutes,
    scheduleParams: scheduleParams.value,
    todayPlan,
  });

  return {
    ...projection,
    preparationTitle: preparation.title ?? "Sua preparação",
    examDate: preparation.examDate as CivilDate | null,
    examDateIsEstimated: preparation.examDateIsEstimated,
  };
}

/**
 * Os assuntos que ainda faltam, com quanto falta de cada.
 *
 * "Falta" é medido pela COBERTURA, não pelo tempo já gasto: um assunto estudado
 * mas nunca revisado ainda tem trabalho pela frente, e um assunto onde o aluno
 * já acerta tudo não precisa do mesmo tempo que um que ele nunca viu.
 */
async function loadPendingTopics(preparationId: string): Promise<PendingTopic[]> {
  const rows = await db
    .select({
      planTopicId: studyPlanTopics.id,
      planSubjectId: studyPlanTopics.planSubjectId,
      subjectName: studyPlanSubjects.displayName,
      topicName: studyPlanTopics.displayName,
      coverageStatus: topicStates.coverageStatus,
      priorityScore: topicStates.priorityScore,
      currentMasteryScore: topicStates.currentMasteryScore,
      initialMastery: topicStates.initialMastery,
      lastStudiedAt: topicStates.lastStudiedAt,
    })
    .from(studyPlanTopics)
    .innerJoin(studyPlanSubjects, eq(studyPlanTopics.planSubjectId, studyPlanSubjects.id))
    .leftJoin(topicStates, eq(topicStates.planTopicId, studyPlanTopics.id))
    .where(
      and(
        eq(studyPlanTopics.preparationId, preparationId),
        eq(studyPlanTopics.isActive, true),
        isNull(studyPlanTopics.deletedAt),
      ),
    );

  return rows
    /*
      ⚠️ ASSUNTO JÁ ESTUDADO SAI DO CRONOGRAMA, e passa a ser assunto do Motor 2.

      A cliente perguntou isso nas observações da 2ª etapa e eu nunca respondi:
      "quando um assunto é estudado, ele sai do cronograma? Garantir que o Motor
      do Cronograma não continue priorizando conteúdos que já deveriam ter sido
      retirados dele".

      Enquanto o cronograma distribuía MINUTOS, o assunto estudado ficava com um
      custo menor e o defeito era discreto. Contando assuntos, ele voltou a
      ocupar uma vaga inteira — o aluno estudaria "Crase" hoje e a veria de novo
      amanhã, no lugar do próximo assunto do edital.

      Concluir o estudo abre a série de revisões (`completeStudy`), então o
      assunto não fica sem dono: ele sai da fila de COBRIR e entra na de FIXAR.
      É a divisão de trabalho entre os dois motores que o produto promete.

      ⚠️ O SINAL É `lastStudiedAt`, e não `coverageStatus`. `in_progress` também
      aparece quando o aluno só responde questões, sem ter estudado o material —
      esse assunto continua precisando entrar no cronograma.
    */
    .filter((row) => row.lastStudiedAt === null)
    .filter((row) => (row.coverageStatus ?? "not_started") !== "mastered")
    .map((row) => ({
      planTopicId: row.planTopicId,
      planSubjectId: row.planSubjectId,
      subjectName: row.subjectName,
      topicName: row.topicName,
      remainingMinutes: remainingFor(row.coverageStatus),
      /**
       * Sem prioridade calculada ainda, usa o inverso do domínio: quem sabe
       * menos vem antes. É a mesma direção do Motor 1, e evita que a ordem do
       * cronograma pareça aleatória no primeiro acesso — antes de a primeira
       * Tarefa do Dia rodar.
       */
      priorityScore: row.priorityScore ?? 1 - (row.currentMasteryScore ?? 0.5),
      /*
        A percepção do diagnóstico inicial, que é o que ordena o cronograma
        desde 08/09/2026. Ver a nota em `PendingTopic.masteryLevel`.
      */
      masteryLevel: row.initialMastery,
    }));
}

/**
 * A missão de hoje, na ordem da tela, com o que já foi estudado.
 *
 * Vazia enquanto a missão não existe — é o caso de `ensureDailyTask`, que lê o
 * cronograma justamente para montá-la. Ver a nota em
 * `ProjectScheduleInput.todayPlan`.
 */
async function loadTodayPlan(preparationId: string, today: CivilDate): Promise<TodayPlanTopic[]> {
  const rows = await db
    .select({
      planTopicId: dailyTaskItems.planTopicId,
      topicName: studyPlanTopics.displayName,
      kind: dailyTaskItems.kind,
      status: dailyTaskItems.status,
    })
    .from(dailyTaskItems)
    .innerJoin(dailyTasks, eq(dailyTasks.id, dailyTaskItems.dailyTaskId))
    .innerJoin(studyPlanTopics, eq(studyPlanTopics.id, dailyTaskItems.planTopicId))
    .where(and(eq(dailyTasks.preparationId, preparationId), eq(dailyTasks.taskDate, today)))
    .orderBy(dailyTaskItems.blockIndex);

  const porAssunto = new Map<string, TodayPlanTopic>();

  for (const row of rows) {
    const assunto = porAssunto.get(row.planTopicId) ?? {
      planTopicId: row.planTopicId,
      topicName: row.topicName,
      done: false,
    };

    /* Feito é o ESTUDO concluído — o mesmo sinal que tira o assunto da fila. */
    if (row.kind === "study" && row.status === "completed") assunto.done = true;

    porAssunto.set(row.planTopicId, assunto);
  }

  return [...porAssunto.values()];
}

function remainingFor(
  status: "not_started" | "in_progress" | "studied" | "mastered" | null,
): number {
  switch (status) {
    case "studied":
      return Math.round(MINUTES_PER_TOPIC * 0.3);
    case "in_progress":
      return Math.round(MINUTES_PER_TOPIC * 0.6);
    default:
      return MINUTES_PER_TOPIC;
  }
}

async function loadAvailability(userId: string): Promise<WeeklyAvailability[]> {
  const rows = await db
    .select({
      weekday: userAvailability.weekday,
      minutesAvailable: userAvailability.minutesAvailable,
    })
    .from(userAvailability)
    .where(eq(userAvailability.userId, userId));

  return rows;
}

/**
 * Média de minutos por dia comprometidos com revisão nos próximos 30 dias.
 *
 * ⚠️ Este é o mesmo tipo de travessia que existe entre os motores: um NÚMERO
 * sai do Motor 2 e entra na projeção. O cronograma não lê a agenda de revisão
 * item a item, não a reordena e não a altera.
 */
async function averageReviewMinutesPerDay(
  userId: string,
  today: CivilDate,
): Promise<number> {
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 30);

  const [row] = await db
    .select({ total: count() })
    .from(reviewOccurrences)
    .where(
      and(
        eq(reviewOccurrences.userId, userId),
        eq(reviewOccurrences.status, "scheduled"),
        sql`${reviewOccurrences.dueDate} <= ${horizon.toISOString().slice(0, 10)}`,
      ),
    );

  // 10 minutos por revisão, o mesmo número que o Motor 1 reserva no dia.
  return Math.round(((row?.total ?? 0) * 10) / 30);
}

/* ========================================================================== *
 * CONTAGEM REGRESSIVA
 * ========================================================================== */

export type ExamCountdown = {
  examDate: CivilDate;
  isEstimated: boolean;
  daysRemaining: number;
};

/** "Faltam X dias" da Home. Nulo quando o aluno ainda não informou a data. */
export async function getExamCountdown(
  preparationId: string,
  now = new Date(),
): Promise<ExamCountdown | null> {
  const [row] = await db
    .select({
      examDate: preparations.examDate,
      examDateIsEstimated: preparations.examDateIsEstimated,
    })
    .from(preparations)
    .where(eq(preparations.id, preparationId))
    .limit(1);

  if (!row?.examDate) return null;

  const today = toCivilDate(now, APP_TIMEZONE);
  const days = Math.round(
    (Date.parse(`${row.examDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );

  return {
    examDate: row.examDate as CivilDate,
    isEstimated: row.examDateIsEstimated,
    daysRemaining: days,
  };
}
