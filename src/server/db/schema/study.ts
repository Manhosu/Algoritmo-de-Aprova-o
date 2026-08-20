import { relations } from "drizzle-orm";
import {
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { createdAt, primaryId, timestamps } from "./_shared";
import { dailyTaskItems } from "./daily-task";
import {
  deviceTypeEnum,
  studyTechniqueEnum,
  usageSessionEndReasonEnum,
} from "./enums";
import { users } from "./identity";
import { preparations, studyPlanTopics } from "./preparation";

/* ==========================================================================
 * ESTUDO CONCLUÍDO
 * ========================================================================== */

/**
 * Registro de "estudei este assunto" (decisão 5 do Eduardo).
 *
 * É O GATILHO DO MOTOR 2: ao gravar uma linha aqui, o sistema cria uma
 * `reviewSchedule` com as cinco ocorrências (24h, 7, 30, 60, 90 dias). É o
 * único evento que dispara a curva do esquecimento.
 *
 * `technique` alimenta o card "Melhor técnica de estudo" (README 2.1) — a
 * técnica é cruzada com o desempenho posterior no mesmo assunto, e não com a
 * opinião do aluno.
 */
export const studyLogs = pgTable(
  "study_logs",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    preparationId: uuid()
      .notNull()
      .references(() => preparations.id, { onDelete: "cascade" }),
    planTopicId: uuid()
      .notNull()
      .references(() => studyPlanTopics.id, { onDelete: "cascade" }),

    /** Preenchido quando o estudo veio da Tarefa do Dia. */
    dailyTaskItemId: uuid().references(() => dailyTaskItems.id, {
      onDelete: "set null",
    }),

    technique: studyTechniqueEnum(),
    minutesSpent: integer(),
    notes: text(),

    completedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Data civil no fuso do aluno — usada por streak e rollups. */
    completedDate: date({ mode: "string" }).notNull(),

    createdAt: createdAt(),
  },
  (table) => [
    index("study_logs_user_date_idx").on(table.userId, table.completedDate),
    index("study_logs_topic_idx").on(table.planTopicId, table.completedAt),
    index("study_logs_preparation_idx").on(table.preparationId, table.completedDate),
  ],
);

/* ==========================================================================
 * PERMANÊNCIA NA PLATAFORMA — "HORAS ESTUDADAS"
 * ==========================================================================
 *
 * README 2.1: "tempo total que o usuário fica no site (medir permanência real)".
 *
 * ATENÇÃO — ESTA É A MÉTRICA MAIS FÁCIL DE INFLAR DO PRODUTO INTEIRO.
 * O aluno que deixa a aba aberta durante a novela "estudou 3 horas" se a
 * medição for ingênua. Uma métrica que mente é pior que métrica nenhuma, porque
 * a cliente vai tomar decisão em cima dela.
 *
 * Por isso o modelo é de sessão com SINAL DE VIDA, não de "entrou/saiu":
 *   • o cliente manda um heartbeat periódico enquanto a aba está visível e há
 *     interação; aba em segundo plano não conta;
 *   • `lastHeartbeatAt` é o que fecha a sessão: sem sinal por N minutos, a
 *     sessão é encerrada retroativamente no último sinal — e não no momento em
 *     que a rotina de limpeza rodou;
 *   • `durationSeconds` é gravado no fechamento, já descontado o silêncio;
 *   • há teto por sessão, para o caso patológico.
 *
 * Nada disso é o mesmo que `authSessions`: aquela é a sessão de LOGIN e pode
 * durar semanas. Esta é a permanência, e dura minutos.
 */
export const usageSessions = pgTable(
  "usage_sessions",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Sessão de login que originou esta permanência, quando conhecida. */
    authSessionId: uuid(),

    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastHeartbeatAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp({ withTimezone: true }),

    /** Tempo efetivo, já descontado o silêncio entre sinais. */
    durationSeconds: integer().notNull().default(0),
    heartbeatCount: integer().notNull().default(0),

    /** Data civil de início — permite somar "horas de hoje" sem converter fuso. */
    startedDate: date({ mode: "string" }).notNull(),
    startedHour: smallint().notNull(),

    deviceType: deviceTypeEnum().notNull().default("unknown"),
    userAgent: text(),
    ipHash: varchar({ length: 64 }),

    endReason: usageSessionEndReasonEnum(),

    createdAt: createdAt(),
  },
  (table) => [
    index("usage_sessions_user_date_idx").on(table.userId, table.startedDate),
    /** Consulta da rotina que fecha sessões órfãs. */
    index("usage_sessions_open_idx").on(table.endedAt, table.lastHeartbeatAt),
  ],
);

/**
 * Rollup diário por aluno.
 *
 * É a tabela que o Dashboard lê. Uma linha por aluno por dia COM ATIVIDADE —
 * e é justamente a ausência de linha que implementa a regra crítica do gráfico
 * de evolução: "no dia em que o aluno não responder questões, o gráfico NÃO
 * cai — simplesmente não existe ponto naquele dia" (README 2.1).
 *
 * O gráfico plota `questionsCorrect / questionsAnswered` das linhas existentes.
 * Dia sem linha não vira zero porque não existe nada para virar zero. A regra
 * fica garantida pelo modelo, não pela disciplina de quem escreve o front.
 *
 * Consequência importante: dias com atividade que NÃO é questão (só estudo, só
 * revisão) geram linha com `questionsAnswered = 0`. O gráfico precisa filtrar
 * `questionsAnswered > 0` — a regra está documentada aqui e no módulo de
 * métricas.
 */
export const dailyUserRollups = pgTable(
  "daily_user_rollups",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rollupDate: date({ mode: "string" }).notNull(),

    questionsAnswered: integer().notNull().default(0),
    questionsCorrect: integer().notNull().default(0),

    studyMinutes: integer().notNull().default(0),
    studySessionsCount: integer().notNull().default(0),
    reviewsCompleted: integer().notNull().default(0),
    reviewsDue: integer().notNull().default(0),

    /** Permanência real do dia, somada das `usageSessions`. */
    activeSeconds: integer().notNull().default(0),

    xpEarned: integer().notNull().default(0),
    coinsEarned: integer().notNull().default(0),

    dailyTaskCompleted: integer().notNull().default(0),
    dailyTaskItemsCompleted: integer().notNull().default(0),

    computedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("daily_user_rollups_unique").on(table.userId, table.rollupDate),
    index("daily_user_rollups_date_idx").on(table.rollupDate),
  ],
);

/**
 * Retrato diário da plataforma inteira, para a aba Visão Geral do painel.
 * Calculado uma vez por dia; evita varredura completa a cada abertura.
 */
export const dailyPlatformRollups = pgTable(
  "daily_platform_rollups",
  {
    rollupDate: date({ mode: "string" }).primaryKey(),

    newUsers: integer().notNull().default(0),
    activeUsers: integer().notNull().default(0),
    preparationsCreated: integer().notNull().default(0),
    editaisUploaded: integer().notNull().default(0),
    diagnosticsCompleted: integer().notNull().default(0),

    questionsAnswered: integer().notNull().default(0),
    questionsCorrect: integer().notNull().default(0),
    studyMinutes: integer().notNull().default(0),
    reviewsCompleted: integer().notNull().default(0),

    freeLimitHits: integer().notNull().default(0),
    upgrades: integer().notNull().default(0),
    cancellations: integer().notNull().default(0),

    computedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
);

export const studyLogsRelations = relations(studyLogs, ({ one }) => ({
  user: one(users, { fields: [studyLogs.userId], references: [users.id] }),
  planTopic: one(studyPlanTopics, {
    fields: [studyLogs.planTopicId],
    references: [studyPlanTopics.id],
  }),
  preparation: one(preparations, {
    fields: [studyLogs.preparationId],
    references: [preparations.id],
  }),
}));

export const usageSessionsRelations = relations(usageSessions, ({ one }) => ({
  user: one(users, { fields: [usageSessions.userId], references: [users.id] }),
}));
