import { relations, sql } from "drizzle-orm";
import {
  boolean,
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

import { primaryId, timestamps } from "./_shared";
import { engineConfigKindEnum } from "./enums";
import { users } from "./identity";

/* ==========================================================================
 * CONFIGURAÇÃO VERSIONADA DOS MOTORES
 * ==========================================================================
 *
 * Requisito do Eduardo (decisão 14), e a peça que torna o algoritmo auditável:
 *
 *   "configuração de pesos e de XP é versionada e imutável após uso, e cada
 *    tarefa gerada grava qual versão a produziu. Sem isso a tela 'Entenda o
 *    Algoritmo' mente e nenhum bug de motor é reproduzível."
 *
 * O problema que isso resolve: o painel administrativo pode mudar os pesos do
 * Motor 1 e os valores de XP a qualquer momento (README 2.6). Se a configuração
 * fosse uma linha editada no lugar, a Tarefa do Dia de ontem passaria a ser
 * inexplicável hoje — o registro diria "prioridade 0,82" e não haveria como
 * saber com quais pesos aquele 0,82 foi calculado.
 *
 * Como funciona:
 *   • editar não altera a linha: cria a versão seguinte;
 *   • ativar uma versão desativa a anterior (uma ativa por tipo, garantido por
 *     índice parcial no banco, não por convenção);
 *   • a partir do primeiro uso a versão é TRAVADA (`lockedAt`) e nunca mais
 *     muda — quem quiser alterar cria outra;
 *   • `dailyTasks`, `xpLedger`, `reviewSchedules` e as métricas guardam o id da
 *     versão que os produziu.
 *
 * Por que `payload` é JSONB e não colunas: cada tipo tem um formato diferente e
 * a lista de sinais vai crescer na calibração. Trocar o formato não pode exigir
 * migration. A tipagem e as invariantes (ex.: os 5 pesos somam 100) são
 * garantidas por schema Zod na leitura e na escrita — ver
 * `src/modules/engine-config`.
 * ========================================================================== */

export const engineConfigs = pgTable(
  "engine_configs",
  {
    id: primaryId(),

    kind: engineConfigKindEnum().notNull(),
    /** Sequencial por tipo, começando em 1. */
    version: integer().notNull(),

    /**
     * O conteúdo da configuração.
     *
     * kind = "daily_task_weights" (padrões do README 1.6):
     *   { performance: 30, editalWeight: 20, urgency: 20,
     *     recency: 15, knowledgeGap: 15 }
     *
     * kind = "xp_values" (padrões do README 2.3):
     *   { studyCompleted: 30, questionAnswered: 5, correctBonus: 5,
     *     streakDay: 20, dailyGoalCompleted: 50, reviewCompleted: 40 }
     *
     * kind = "review_intervals" (README 1.7):
     *   { intervalsInDays: [1, 7, 30, 60, 90] }
     */
    payload: jsonb().notNull(),

    /** Só uma versão ativa por tipo (garantido pelo índice parcial abaixo). */
    isActive: boolean().notNull().default(false),

    /**
     * Marcado no primeiro uso. Versão travada é IMUTÁVEL: qualquer alteração
     * precisa virar uma versão nova. É isso que mantém o histórico explicável.
     */
    lockedAt: timestamp({ withTimezone: true }),

    activatedAt: timestamp({ withTimezone: true }),
    retiredAt: timestamp({ withTimezone: true }),

    /** Quem mudou e por quê — a mesma pergunta que a auditoria vai fazer. */
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    changeNote: text(),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("engine_configs_kind_version_unique").on(table.kind, table.version),
    uniqueIndex("engine_configs_one_active_per_kind")
      .on(table.kind)
      .where(sql`${table.isActive} = true`),
    index("engine_configs_kind_idx").on(table.kind, table.version),
  ],
);

/**
 * Níveis de gamificação (README 2.3).
 *
 * Tabela e não enum: os nomes e faixas JÁ mudaram uma vez durante o projeto
 * (o mockup dizia "NÍVEL 4 AVANÇADO" até 7.000 XP; a escada atual é
 * Iniciante / Competitivo / Estrategista / Elite / Implacável). Vão mudar de
 * novo, e não podem exigir deploy.
 */
export const levels = pgTable(
  "levels",
  {
    id: primaryId(),
    levelNumber: integer().notNull(),
    code: varchar({ length: 40 }).notNull(),
    name: varchar({ length: 60 }).notNull(),
    emoji: varchar({ length: 8 }),
    minXp: integer().notNull(),
    /** NULO no último nível — é o que faz "10.000+" funcionar sem número mágico. */
    maxXp: integer(),
    /** Token de cor do design system (`--level-1` … `--level-5`). */
    colorToken: varchar({ length: 40 }),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("levels_number_unique").on(table.levelNumber),
    uniqueIndex("levels_code_unique").on(table.code),
    index("levels_min_xp_idx").on(table.minXp),
  ],
);

export const engineConfigsRelations = relations(engineConfigs, ({ one }) => ({
  createdBy: one(users, {
    fields: [engineConfigs.createdByUserId],
    references: [users.id],
  }),
}));
