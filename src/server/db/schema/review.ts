import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import {
  reviewOccurrenceStatusEnum,
  reviewScheduleStatusEnum,
  reviewTriggerEnum,
} from "./enums";
import { engineConfigs } from "./engine";
import { users } from "./identity";
import { preparations, studyPlanTopics } from "./preparation";
import { studyLogs } from "./study";

/* ==========================================================================
 * MOTOR 2 — REVISÃO (CURVA DO ESQUECIMENTO)
 * ==========================================================================
 *
 * ⚠️ MOTOR INDEPENDENTE. Não entra na lógica da Tarefa do Dia (README 1.7,
 * decisão fechada com a cliente). Tabelas próprias, regra própria, tela própria.
 *
 * DUAS ENTIDADES, NÃO UMA — e é aqui que a modelagem costuma errar:
 *
 *   • `reviewSchedules`   = A SÉRIE. Nasce uma vez, quando o aluno marca um
 *                           assunto como estudado. Representa o compromisso
 *                           "este assunto vai ser revisado 5 vezes".
 *
 *   • `reviewOccurrences` = CADA REVISÃO. Uma linha por etapa (24h, 7, 30, 60,
 *                           90 dias), com data de vencimento própria e status
 *                           próprio.
 *
 * Modelar como uma coisa só (um campo "próxima revisão" na série) destruiria o
 * histórico: não haveria como saber quais revisões foram feitas, quais foram
 * puladas e quantos dias de atraso cada uma teve — que é justamente o dado que
 * o card "Revisões Feitas" e a aderência do Índice de Preparação consomem.
 *
 * REGRA DO ATRASO (decisão 6 do Eduardo)
 * ----------------------------------------------------------------------------
 *   • revisão vencida NÃO some: acumula na tela com marcação de atraso;
 *   • o intervalo seguinte conta a partir da EXECUÇÃO REAL, não da data que
 *     estava prevista — quem revisou com 10 dias de atraso não deve receber a
 *     próxima revisão imediatamente;
 *   • desempenho ruim na revisão NÃO reinicia o ciclo no Marco 1 (fica
 *     registrado em `performanceRating` para calibração futura).
 * ========================================================================== */

/**
 * A série de revisões de um assunto, disparada por um estudo concluído.
 *
 * `engineConfigId` amarra a série aos intervalos vigentes quando ela nasceu: se
 * a operação mudar a curva de [1,7,30,60,90] para outra, as séries já em
 * andamento continuam com a régua com que começaram, em vez de saltarem etapas.
 */
export const reviewSchedules = pgTable(
  "review_schedules",
  {
    id: primaryId(),
    preparationId: uuid()
      .notNull()
      .references(() => preparations.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planTopicId: uuid()
      .notNull()
      .references(() => studyPlanTopics.id, { onDelete: "cascade" }),

    trigger: reviewTriggerEnum().notNull().default("study_completed"),
    /** O estudo que deu origem à série. */
    triggeredByStudyLogId: uuid().references(() => studyLogs.id, {
      onDelete: "set null",
    }),

    status: reviewScheduleStatusEnum().notNull().default("active"),

    /** Índice da etapa atual dentro de `intervalsInDays`. */
    currentStageIndex: smallint().notNull().default(0),
    totalStages: smallint().notNull(),

    engineConfigId: uuid().references(() => engineConfigs.id, { onDelete: "set null" }),

    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp({ withTimezone: true }),
    canceledAt: timestamp({ withTimezone: true }),
    cancelReason: text(),

    ...timestamps,
  },
  (table) => [
    index("review_schedules_user_idx").on(table.userId, table.status),
    index("review_schedules_topic_idx").on(table.planTopicId, table.status),
    index("review_schedules_preparation_idx").on(table.preparationId, table.status),
  ],
);

/**
 * Uma revisão agendada.
 *
 * `planTopicId` e `userId` são desnormalizados de propósito: a tela "Revisões
 * para Hoje" é uma das mais acessadas do produto e precisa responder
 * "o que vence hoje para este aluno" com um único índice, sem passar pela
 * série.
 *
 * `dueDate` (data civil) e `dueAt` (instante) coexistem: a data é o que a tela
 * e o índice usam; o instante é o que permite ordenar dentro do dia.
 */
export const reviewOccurrences = pgTable(
  "review_occurrences",
  {
    id: primaryId(),
    reviewScheduleId: uuid()
      .notNull()
      .references(() => reviewSchedules.id, { onDelete: "cascade" }),

    preparationId: uuid()
      .notNull()
      .references(() => preparations.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planTopicId: uuid()
      .notNull()
      .references(() => studyPlanTopics.id, { onDelete: "cascade" }),

    /** 0 = 24h, 1 = 7 dias, 2 = 30, 3 = 60, 4 = 90 (README 1.7). */
    stageIndex: smallint().notNull(),
    intervalDays: integer().notNull(),

    dueDate: date({ mode: "string" }).notNull(),
    dueAt: timestamp({ withTimezone: true }).notNull(),

    status: reviewOccurrenceStatusEnum().notNull().default("scheduled"),

    completedAt: timestamp({ withTimezone: true }),
    /** Data civil da conclusão — base do intervalo seguinte (decisão 6). */
    completedDate: date({ mode: "string" }),

    /** Marcação de atraso exibida na tela. Calculada na conclusão. */
    isLate: boolean().notNull().default(false),
    daysLate: integer().notNull().default(0),

    /**
     * Percepção do aluno ao revisar ("fácil" / "ok" / "difícil").
     * Coletado desde o Marco 1 mas NÃO altera o ciclo agora — está aqui para
     * que a calibração futura tenha dado histórico com que trabalhar, em vez de
     * começar do zero.
     */
    performanceRating: text(),

    canceledAt: timestamp({ withTimezone: true }),

    ...timestamps,
  },
  (table) => [
    /** Não pode haver duas revisões da mesma etapa na mesma série. */
    uniqueIndex("review_occurrences_stage_unique").on(
      table.reviewScheduleId,
      table.stageIndex,
    ),
    /** A consulta da tela "Revisões para Hoje", incluindo as atrasadas. */
    index("review_occurrences_due_idx").on(table.userId, table.status, table.dueDate),
    index("review_occurrences_preparation_idx").on(table.preparationId, table.dueDate),
    index("review_occurrences_topic_idx").on(table.planTopicId),
    index("review_occurrences_completed_idx").on(table.userId, table.completedDate),
  ],
);

export const reviewSchedulesRelations = relations(reviewSchedules, ({ one, many }) => ({
  preparation: one(preparations, {
    fields: [reviewSchedules.preparationId],
    references: [preparations.id],
  }),
  planTopic: one(studyPlanTopics, {
    fields: [reviewSchedules.planTopicId],
    references: [studyPlanTopics.id],
  }),
  occurrences: many(reviewOccurrences),
}));

export const reviewOccurrencesRelations = relations(reviewOccurrences, ({ one }) => ({
  schedule: one(reviewSchedules, {
    fields: [reviewOccurrences.reviewScheduleId],
    references: [reviewSchedules.id],
  }),
  planTopic: one(studyPlanTopics, {
    fields: [reviewOccurrences.planTopicId],
    references: [studyPlanTopics.id],
  }),
}));
