import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import {
  dailyTaskItemKindEnum,
  scheduleEntrySourceEnum,
  scheduleEntryStatusEnum,
  scheduleRecalcReasonEnum,
} from "./enums";
import { engineConfigs } from "./engine";
import { users } from "./identity";
import { preparations, studyPlanTopics } from "./preparation";

/* ==========================================================================
 * CRONOGRAMA ADAPTATIVO
 * ==========================================================================
 *
 * README 1.8: "visão de tudo que está agendado para o aluno estudar até o dia
 * da prova", "totalmente adaptativo, nunca estático".
 *
 * O PROBLEMA TÉCNICO E COMO ELE É RESOLVIDO AQUI
 * ----------------------------------------------------------------------------
 * Materializar dia a dia até uma prova que pode estar a dez meses geraria
 * centenas de linhas por aluno que estariam obsoletas em uma semana — e teriam
 * que ser reescritas a cada questão respondida. Não fecha.
 *
 * A solução tem duas camadas:
 *
 *   • `scheduleEntries`  — JANELA MATERIALIZADA (padrão: 14 dias à frente).
 *     É o que o aluno enxerga em detalhe, o que ele pode arrastar para adiantar
 *     ou atrasar, e o que o Motor 1 consome ao montar a Tarefa do Dia.
 *
 *   • `scheduleSnapshots` — PROJEÇÃO até a data da prova, guardada como um
 *     único documento JSONB por recálculo. É agregada (assuntos por semana,
 *     carga por disciplina), não dia a dia, porque nenhuma projeção a dez meses
 *     merece precisão diária. É o que desenha a visão de longo prazo.
 *
 * Guardar o snapshot anterior em vez de sobrescrever tem um motivo prático:
 * permite dizer ao aluno O QUE MUDOU e POR QUÊ (`reason`), em vez de o plano
 * simplesmente aparecer diferente. Um cronograma que muda sem explicação é
 * indistinguível de um cronograma quebrado.
 * ========================================================================== */

/**
 * Uma projeção completa do cronograma, gerada por um recálculo.
 *
 * Só o snapshot mais recente por preparação está vigente (`supersededAt` nulo).
 * Os anteriores ficam para comparação e depuração.
 */
export const scheduleSnapshots = pgTable(
  "schedule_snapshots",
  {
    id: primaryId(),
    preparationId: uuid()
      .notNull()
      .references(() => preparations.id, { onDelete: "cascade" }),

    reason: scheduleRecalcReasonEnum().notNull(),
    engineConfigId: uuid().references(() => engineConfigs.id, { onDelete: "set null" }),

    horizonStart: date({ mode: "string" }).notNull(),
    /** Data da prova, ou o horizonte estimado quando não há data definida. */
    horizonEnd: date({ mode: "string" }).notNull(),

    /**
     * A projeção agregada. Formato:
     * { weeks: [{ startDate, plannedMinutes, topics: [{ topicId, minutes }] }],
     *   summary: { topicsRemaining, minutesRemaining, feasibility } }
     *
     * `feasibility` é o dado mais útil da tela: diz se o conteúdo restante cabe
     * na disponibilidade informada até a data da prova. Quando não cabe, o
     * produto tem que avisar em vez de fingir que cabe.
     */
    payload: jsonb().notNull(),

    generatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    supersededAt: timestamp({ withTimezone: true }),
    computeDurationMs: integer(),

    ...timestamps,
  },
  (table) => [
    index("schedule_snapshots_preparation_idx").on(
      table.preparationId,
      table.generatedAt,
    ),
    /** Índice parcial: um único snapshot vigente por preparação. */
    uniqueIndex("schedule_snapshots_current_unique")
      .on(table.preparationId)
      .where(sql`${table.supersededAt} is null`),
  ],
);

/**
 * Um item concreto do cronograma, num dia específico, dentro da janela
 * materializada.
 *
 * `source` e `movedFromDate` implementam o requisito de o aluno poder
 * "adiantar conteúdo do próximo dia" e "atrasar algum dia" (README 1.8):
 * quando ele move um item, a linha passa a valer mais que o motor
 * (`source = "student_moved"`) e o recálculo seguinte respeita a escolha dele
 * em vez de desfazê-la — caso contrário, arrastar um item pareceria não
 * funcionar.
 */
export const scheduleEntries = pgTable(
  "schedule_entries",
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

    scheduledDate: date({ mode: "string" }).notNull(),
    kind: dailyTaskItemKindEnum().notNull(),
    plannedMinutes: integer().notNull().default(0),
    plannedQuestionCount: integer(),

    status: scheduleEntryStatusEnum().notNull().default("planned"),
    source: scheduleEntrySourceEnum().notNull().default("engine"),

    /** Preenchido quando o aluno adiantou ou atrasou o item. */
    movedFromDate: date({ mode: "string" }),
    movedAt: timestamp({ withTimezone: true }),

    /** Trava o item contra reordenação automática. */
    isPinned: boolean().notNull().default(false),

    sortOrder: integer().notNull().default(0),
    completedAt: timestamp({ withTimezone: true }),
    note: text(),

    ...timestamps,
  },
  (table) => [
    index("schedule_entries_preparation_date_idx").on(
      table.preparationId,
      table.scheduledDate,
    ),
    index("schedule_entries_user_date_idx").on(table.userId, table.scheduledDate),
    index("schedule_entries_topic_idx").on(table.planTopicId),
    index("schedule_entries_status_idx").on(table.status, table.scheduledDate),
  ],
);

export const scheduleSnapshotsRelations = relations(scheduleSnapshots, ({ one }) => ({
  preparation: one(preparations, {
    fields: [scheduleSnapshots.preparationId],
    references: [preparations.id],
  }),
}));

export const scheduleEntriesRelations = relations(scheduleEntries, ({ one }) => ({
  preparation: one(preparations, {
    fields: [scheduleEntries.preparationId],
    references: [preparations.id],
  }),
  planTopic: one(studyPlanTopics, {
    fields: [scheduleEntries.planTopicId],
    references: [studyPlanTopics.id],
  }),
}));
