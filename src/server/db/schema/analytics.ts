import { relations, sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { createdAt, primaryId, timestamps } from "./_shared";
import { plans } from "./billing";
import { deviceTypeEnum, funnelStageEnum } from "./enums";
import { users } from "./identity";

/* ==========================================================================
 * TELEMETRIA E FUNIL
 * ==========================================================================
 *
 * ESTE ARQUIVO É DO MARCO 2 NO PAPEL E DO MARCO 1 NA PRÁTICA.
 *
 * O painel administrativo do Marco 2 precisa responder quantos usuários criaram
 * preparação, quantos subiram edital, quantos concluíram o diagnóstico, quantos
 * responderam a primeira questão, quantos voltaram no dia seguinte e ONDE
 * ABANDONAM (README 2.6).
 *
 * Nada disso é calculável retroativamente. Se os eventos não forem gravados
 * desde a primeira tela do Marco 1, em setembro não haverá como saber quem
 * abandonou em agosto — o dado não existe para ser recuperado. Por isso a
 * instrumentação entra junto com as telas, não depois delas.
 *
 * LGPD E MÉTRICA AGREGADA (decisão 15 do Eduardo)
 * ----------------------------------------------------------------------------
 * A exclusão de conta apaga a PII e o conteúdo do titular. Mas se apagasse
 * também os eventos, o denominador do funil encolheria com o tempo e as
 * métricas históricas mudariam sozinhas — "quantos se cadastraram em agosto"
 * daria respostas diferentes em setembro e em outubro.
 *
 * A solução: `userId` é ANULADO na exclusão e `pseudonymKey` permanece. É um
 * HMAC irreversível do id original; sem PII associada, não identifica ninguém,
 * e a contagem de coortes continua correta.
 * ========================================================================== */

/**
 * Evento bruto de produto.
 *
 * `id` é bigint identity: tabela append-only de alto volume, nunca exposta em
 * URL, e a localidade do índice importa mais que a opacidade do id.
 *
 * `anonymousId` cobre o que acontece ANTES do cadastro (visita à landing,
 * início do formulário) — sem isso o topo do funil fica invisível e não há como
 * saber quantos desistem antes de virar usuário.
 */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),

    /** Anulado na exclusão de conta. Ver nota sobre LGPD acima. */
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Sobrevive à exclusão. Irreversível. Mantém a contagem agregada correta. */
    pseudonymKey: varchar({ length: 64 }),
    /** Identificador de navegador para eventos pré-cadastro. */
    anonymousId: varchar({ length: 64 }),

    /** Nome do evento em snake_case: "preparation_created", "edital_uploaded"... */
    name: varchar({ length: 80 }).notNull(),
    properties: jsonb(),

    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Data e hora civis no fuso do produto — mesma razão de `questionAttempts`. */
    occurredDate: date({ mode: "string" }).notNull(),
    occurredHour: smallint().notNull(),

    path: varchar({ length: 300 }),
    referrer: text(),
    deviceType: deviceTypeEnum().notNull().default("unknown"),

    createdAt: createdAt(),
  },
  (table) => [
    /** A consulta do funil: contar usuários distintos por evento e período. */
    index("analytics_events_name_date_idx").on(table.name, table.occurredDate),
    index("analytics_events_user_idx").on(table.userId, table.occurredAt),
    index("analytics_events_pseudonym_idx").on(table.pseudonymKey, table.occurredDate),
    index("analytics_events_anonymous_idx").on(table.anonymousId),
    check("analytics_events_hour_check", sql`${table.occurredHour} between 0 and 23`),
  ],
);

/**
 * FUNIL MATERIALIZADO — uma linha por usuário.
 *
 * `analyticsEvents` é a fonte da verdade; esta tabela é o índice dela.
 *
 * Sem ela, cada aba do painel administrativo faria `count(distinct user_id)`
 * sobre milhões de eventos, uma vez por degrau do funil, a cada carregamento.
 * Com ela, cada degrau é um `count(*) where <coluna> is not null` — e a
 * pergunta mais difícil do README, "onde abandonam (ponto exato do fluxo)",
 * vira um simples `group by last_stage_reached`.
 *
 * Cada carimbo é gravado UMA VEZ, na primeira ocorrência. São marcos, não
 * contadores: "quando este usuário respondeu a primeira questão" tem uma
 * resposta só.
 */
export const userFunnelProgress = pgTable(
  "user_funnel_progress",
  {
    /**
     * A CHAVE É A PSEUDÔNIMA, não o id do usuário — de propósito.
     *
     * Se a chave primária fosse `user_id`, a linha do funil morreria junto com
     * a conta e o denominador histórico encolheria a cada exclusão. Chaveando
     * pela pseudônima, a linha sobrevive à anonimização com o `user_id` anulado
     * e a coorte de agosto continua contando a mesma coisa em outubro.
     */
    pseudonymKey: varchar({ length: 64 }).primaryKey(),
    /** Anulado na anonimização. */
    userId: uuid().references(() => users.id, { onDelete: "set null" }),

    /* --- Ativação (README 2.6) ------------------------------------------- */
    signedUpAt: timestamp({ withTimezone: true }).notNull(),
    firstLoginAt: timestamp({ withTimezone: true }),
    preparationCreatedAt: timestamp({ withTimezone: true }),
    editalUploadedAt: timestamp({ withTimezone: true }),
    extractionSucceededAt: timestamp({ withTimezone: true }),
    contentConfirmedAt: timestamp({ withTimezone: true }),
    diagnosisCompletedAt: timestamp({ withTimezone: true }),
    firstTaskGeneratedAt: timestamp({ withTimezone: true }),
    firstQuestionAnsweredAt: timestamp({ withTimezone: true }),
    firstReviewCompletedAt: timestamp({ withTimezone: true }),

    /* --- Retenção --------------------------------------------------------- */
    /** Retorno no dia seguinte ao cadastro (D+1). */
    returnedNextDayAt: timestamp({ withTimezone: true }),
    returnedWeekTwoAt: timestamp({ withTimezone: true }),
    lastActiveDate: date({ mode: "string" }),
    activeDaysCount: integer().notNull().default(0),
    completedTasksCount: integer().notNull().default(0),

    /* --- Monetização ------------------------------------------------------ */
    /** Primeira vez que bateu no teto diário do plano — pico de intenção. */
    freeLimitFirstReachedAt: timestamp({ withTimezone: true }),
    freeLimitReachCount: integer().notNull().default(0),
    upgradedAt: timestamp({ withTimezone: true }),
    upgradedToPlanId: uuid().references(() => plans.id, { onDelete: "set null" }),
    downgradedAt: timestamp({ withTimezone: true }),
    churnedAt: timestamp({ withTimezone: true }),

    /* --- Abandono --------------------------------------------------------- */
    /** Degrau mais avançado alcançado. Responde "onde abandonam". */
    lastStageReached: funnelStageEnum().notNull().default("signed_up"),
    lastStageReachedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),

    ...timestamps,
  },
  (table) => [
    index("user_funnel_progress_stage_idx").on(
      table.lastStageReached,
      table.lastStageReachedAt,
    ),
    uniqueIndex("user_funnel_progress_user_unique").on(table.userId),
    index("user_funnel_progress_signup_idx").on(table.signedUpAt),
    index("user_funnel_progress_last_active_idx").on(table.lastActiveDate),
  ],
);

/**
 * Uso de recurso por dia — responde a "quais recursos mais utilizam"
 * (README 2.6, Retenção).
 *
 * Agregado por (recurso, dia) em vez de por evento: a pergunta é sempre sobre a
 * turma, nunca sobre um clique específico.
 */
export const featureUsageRollups = pgTable(
  "feature_usage_rollups",
  {
    id: primaryId(),
    rollupDate: date({ mode: "string" }).notNull(),
    /** "questions", "reviews", "daily_task", "flashcards", "mind_maps"... */
    feature: varchar({ length: 60 }).notNull(),

    uniqueUsers: integer().notNull().default(0),
    interactions: integer().notNull().default(0),
    totalSeconds: integer().notNull().default(0),

    computedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("feature_usage_rollups_date_idx").on(table.rollupDate, table.feature),
  ],
);

/**
 * Registro de execução dos jobs de manutenção (rollups, fechamento de sessões
 * órfãs, geração da Tarefa do Dia, backup).
 *
 * Job que falha em silêncio é a causa mais comum de métrica errada: a tela não
 * quebra, ela só passa a mentir. Aqui fica o registro para o painel avisar.
 */
export const jobRuns = pgTable(
  "job_runs",
  {
    id: primaryId(),
    jobName: varchar({ length: 80 }).notNull(),
    status: varchar({ length: 20 }).notNull(),

    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp({ withTimezone: true }),
    durationMs: integer(),

    processedCount: integer(),
    errorMessage: text(),
    details: jsonb(),

    createdAt: createdAt(),
  },
  (table) => [index("job_runs_name_idx").on(table.jobName, table.startedAt)],
);

export const userFunnelProgressRelations = relations(userFunnelProgress, ({ one }) => ({
  user: one(users, { fields: [userFunnelProgress.userId], references: [users.id] }),
}));
