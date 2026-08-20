import { relations } from "drizzle-orm";
import {
  bigint,
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
  varchar,
} from "drizzle-orm/pg-core";

import { createdAt, primaryId, timestamps } from "./_shared";
import {
  coinReasonEnum,
  missionRecurrenceEnum,
  missionStatusEnum,
  redemptionStatusEnum,
  xpActivityEnum,
} from "./enums";
import { engineConfigs, levels } from "./engine";
import { users } from "./identity";

/* ==========================================================================
 * GAMIFICAÇÃO (MARCO 2 — modelada agora, de propósito)
 * ==========================================================================
 *
 * Modelar isto junto com o Marco 1 foi decisão do Eduardo, e é a decisão certa:
 * XP é consequência de eventos que o Marco 1 JÁ produz (questão respondida,
 * estudo concluído, revisão feita). Se as tabelas só existissem em setembro,
 * ou o histórico de agosto ficaria sem XP, ou seria preciso reprocessá-lo com
 * regras que ninguém mais lembraria.
 * ========================================================================== */

/**
 * LIVRO-RAZÃO DE XP — não um contador.
 *
 * Cada ganho é uma linha imutável. O saldo é a soma. Isso custa mais espaço que
 * um `users.totalXp += 5` e vale a pena por três motivos concretos:
 *
 *   1. AUDITORIA — "por que eu tenho 5.740 XP?" tem resposta linha a linha.
 *   2. RECÁLCULO — os valores de XP são editáveis pelo painel (README 2.3).
 *      Com ledger, mudar o valor de "acerto" de 5 para 8 afeta o futuro sem
 *      corromper o passado; `engineConfigId` registra qual tabela de valores
 *      valia em cada linha.
 *   3. ESTORNO — resposta anulada, questão removida do banco, correção de
 *      importação: basta lançar a contrapartida, sem "consertar" um contador.
 *
 * `id` é bigint identity, e não UUID: é tabela append-only de alto volume, o id
 * nunca aparece em URL, e a localidade do índice importa.
 */
export const xpLedger = pgTable(
  "xp_ledger",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    activity: xpActivityEnum().notNull(),
    /** Pode ser negativo (estorno / ajuste administrativo). */
    amount: integer().notNull(),

    /** O que gerou o XP: "question_attempt", "study_log", "review_occurrence"... */
    sourceType: varchar({ length: 60 }),
    sourceId: uuid(),

    /** Qual tabela de valores de XP valia neste lançamento. */
    engineConfigId: uuid().references(() => engineConfigs.id, { onDelete: "set null" }),

    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    occurredDate: date({ mode: "string" }).notNull(),

    note: text(),
    createdAt: createdAt(),
  },
  (table) => [
    index("xp_ledger_user_date_idx").on(table.userId, table.occurredDate),
    index("xp_ledger_user_occurred_idx").on(table.userId, table.occurredAt),
    /**
     * Impede lançamento duplicado do mesmo evento — o mesmo acerto não pode
     * pagar XP duas vezes se a requisição for repetida.
     */
    uniqueIndex("xp_ledger_source_unique").on(
      table.userId,
      table.activity,
      table.sourceType,
      table.sourceId,
    ),
  ],
);

/** Mesma lógica de livro-razão, para as Moedas gastas na Loja. */
export const coinLedger = pgTable(
  "coin_ledger",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    reason: coinReasonEnum().notNull(),
    amount: integer().notNull(),
    sourceType: varchar({ length: 60 }),
    sourceId: uuid(),

    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    occurredDate: date({ mode: "string" }).notNull(),
    note: text(),
    createdAt: createdAt(),
  },
  (table) => [index("coin_ledger_user_idx").on(table.userId, table.occurredAt)],
);

/**
 * Estado consolidado de gamificação do aluno.
 *
 * É CACHE do que os livros-razão dizem — reconstruível a qualquer momento. A
 * Home precisa de XP, nível, moedas e streak em uma leitura; somar o ledger
 * inteiro a cada carregamento não escala.
 */
export const userGamificationStates = pgTable(
  "user_gamification_states",
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),

    totalXp: integer().notNull().default(0),
    currentLevelId: uuid().references(() => levels.id, { onDelete: "set null" }),
    /** Quanto falta para o próximo nível — exibido na barra de progresso. */
    xpToNextLevel: integer(),

    coinBalance: integer().notNull().default(0),

    currentStreak: integer().notNull().default(0),
    longestStreak: integer().notNull().default(0),
    lastActivityDate: date({ mode: "string" }),

    recomputedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [index("user_gamification_states_xp_idx").on(table.totalXp)],
);

/**
 * Um dia com atividade do aluno.
 *
 * Existe separado do rollup diário porque o card "Sequência Atual" precisa
 * marcar os dias da semana (S T Q Q S S D no mockup) e porque o streak precisa
 * ser RECONSTRUÍVEL — um contador incrementado quebra em qualquer falha de
 * escrita e ninguém descobre até o aluno reclamar que perdeu 27 dias.
 */
export const streakDays = pgTable(
  "streak_days",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activityDate: date({ mode: "string" }).notNull(),

    /** O que contou como atividade naquele dia. */
    hadQuestions: boolean().notNull().default(false),
    hadStudy: boolean().notNull().default(false),
    hadReview: boolean().notNull().default(false),

    xpEarned: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("streak_days_unique").on(table.userId, table.activityDate),
    index("streak_days_date_idx").on(table.activityDate),
  ],
);

/* ========================================================================== *
 * CONQUISTAS E MISSÕES
 * ========================================================================== */

export const achievements = pgTable(
  "achievements",
  {
    id: primaryId(),
    code: varchar({ length: 60 }).notNull(),
    name: varchar({ length: 120 }).notNull(),
    description: text(),
    icon: varchar({ length: 40 }),

    /** Regra de desbloqueio, avaliada pelo módulo de gamificação. */
    criteria: jsonb().notNull(),
    xpReward: integer().notNull().default(0),
    coinReward: integer().notNull().default(0),

    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [uniqueIndex("achievements_code_unique").on(table.code)],
);

export const userAchievements = pgTable(
  "user_achievements",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    achievementId: uuid()
      .notNull()
      .references(() => achievements.id, { onDelete: "cascade" }),

    progress: integer().notNull().default(0),
    target: integer(),
    unlockedAt: timestamp({ withTimezone: true }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("user_achievements_unique").on(table.userId, table.achievementId),
    index("user_achievements_unlocked_idx").on(table.userId, table.unlockedAt),
  ],
);

/** Catálogo de missões (README 2.1: "Missões do Dia", progresso 3/5). */
export const missions = pgTable(
  "missions",
  {
    id: primaryId(),
    code: varchar({ length: 60 }).notNull(),
    name: varchar({ length: 160 }).notNull(),
    description: text(),

    recurrence: missionRecurrenceEnum().notNull().default("daily"),
    /** "answer_questions", "study_minutes", "complete_reviews"... */
    targetType: varchar({ length: 60 }).notNull(),
    targetValue: integer().notNull(),

    xpReward: integer().notNull().default(0),
    coinReward: integer().notNull().default(0),

    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [uniqueIndex("missions_code_unique").on(table.code)],
);

export const userDailyMissions = pgTable(
  "user_daily_missions",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    missionId: uuid()
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    missionDate: date({ mode: "string" }).notNull(),

    progress: integer().notNull().default(0),
    /** Copiado do catálogo: se a meta mudar, o dia de ontem não muda junto. */
    targetValue: integer().notNull(),
    status: missionStatusEnum().notNull().default("pending"),
    completedAt: timestamp({ withTimezone: true }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("user_daily_missions_unique").on(
      table.userId,
      table.missionDate,
      table.missionId,
    ),
    index("user_daily_missions_date_idx").on(table.userId, table.missionDate),
  ],
);

/* ========================================================================== *
 * LOJA
 * ========================================================================== */

export const storeItems = pgTable(
  "store_items",
  {
    id: primaryId(),
    code: varchar({ length: 60 }).notNull(),
    name: varchar({ length: 160 }).notNull(),
    description: text(),
    imageUrl: text(),
    category: varchar({ length: 60 }),

    costCoins: integer().notNull(),
    /** NULO = estoque ilimitado. */
    stock: integer(),

    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [uniqueIndex("store_items_code_unique").on(table.code)],
);

export const storeRedemptions = pgTable(
  "store_redemptions",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storeItemId: uuid()
      .notNull()
      .references(() => storeItems.id, { onDelete: "restrict" }),

    /** Custo no momento do resgate — o preço da loja pode mudar depois. */
    costCoins: integer().notNull(),
    status: redemptionStatusEnum().notNull().default("pending"),

    redeemedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    fulfilledAt: timestamp({ withTimezone: true }),
    canceledAt: timestamp({ withTimezone: true }),
    note: text(),

    ...timestamps,
  },
  (table) => [
    index("store_redemptions_user_idx").on(table.userId, table.redeemedAt),
    index("store_redemptions_status_idx").on(table.status),
  ],
);

/* ========================================================================== *
 * RELAÇÕES
 * ========================================================================== */

export const xpLedgerRelations = relations(xpLedger, ({ one }) => ({
  user: one(users, { fields: [xpLedger.userId], references: [users.id] }),
}));

export const userGamificationStatesRelations = relations(
  userGamificationStates,
  ({ one }) => ({
    user: one(users, {
      fields: [userGamificationStates.userId],
      references: [users.id],
    }),
    currentLevel: one(levels, {
      fields: [userGamificationStates.currentLevelId],
      references: [levels.id],
    }),
  }),
);

export const userAchievementsRelations = relations(userAchievements, ({ one }) => ({
  user: one(users, { fields: [userAchievements.userId], references: [users.id] }),
  achievement: one(achievements, {
    fields: [userAchievements.achievementId],
    references: [achievements.id],
  }),
}));

export const userDailyMissionsRelations = relations(userDailyMissions, ({ one }) => ({
  user: one(users, { fields: [userDailyMissions.userId], references: [users.id] }),
  mission: one(missions, {
    fields: [userDailyMissions.missionId],
    references: [missions.id],
  }),
}));
