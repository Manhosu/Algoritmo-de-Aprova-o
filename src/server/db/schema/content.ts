import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { deletedAt, primaryId, timestamps } from "./_shared";
import { canonicalSubjects, canonicalTopics } from "./catalog";
import {
  contentAccessLevelEnum,
  contentProgressStatusEnum,
  contentStatusEnum,
  contentTypeEnum,
} from "./enums";
import { users } from "./identity";

/* ==========================================================================
 * MÓDULOS DE CONTEÚDO (MARCO 2)
 * ==========================================================================
 *
 * ⚠️ REGRA DOS FILTROS (correção da cliente, decisão fechada):
 * Flashcards, Mapas Mentais e Videoaulas filtram por disciplina e assunto, mas
 * o acervo é ABERTO — não mostram apenas o que está vinculado ao edital do
 * aluno.
 *
 * O schema já reflete isso: `contentItems` se classifica pelo CATÁLOGO
 * CANÔNICO e NÃO tem nenhuma referência a `preparations`. Não existe caminho
 * no modelo que permita, por engano, restringir o acervo ao edital do aluno —
 * a restrição precisaria ser inventada, e não apenas esquecida.
 *
 * O que limita o acesso é o PLANO (`planContentAccess`), não o edital.
 * ========================================================================== */

/**
 * Item de conteúdo: mapa mental, flashcard (deck), videoaula, texto, PDF, áudio.
 *
 * Tabela única polimórfica em vez de uma tabela por tipo: os campos são quase
 * os mesmos, a listagem da Home é unificada ("Acesso Rápido") e o controle de
 * acesso por plano é idêntico. Só o baralho de flashcards tem filhos, e eles
 * ficam em `flashcards`.
 */
export const contentItems = pgTable(
  "content_items",
  {
    id: primaryId(),
    type: contentTypeEnum().notNull(),

    title: varchar({ length: 240 }).notNull(),
    description: text(),

    canonicalSubjectId: uuid().references(() => canonicalSubjects.id, {
      onDelete: "set null",
    }),
    canonicalTopicId: uuid().references(() => canonicalTopics.id, {
      onDelete: "set null",
    }),

    /**
     * A partir de qual nível de plano o item aparece.
     * "limited" = visível no Free; "full" = só no Premium.
     */
    requiredAccessLevel: contentAccessLevelEnum().notNull().default("limited"),

    /** Arquivo/vídeo. Mapa mental guarda a imagem aqui — abre com zoom na tela. */
    storagePath: text(),
    externalUrl: text(),
    thumbnailUrl: text(),
    /** Dimensões da imagem do mapa mental, para o visualizador com zoom. */
    imageWidth: integer(),
    imageHeight: integer(),
    durationSeconds: integer(),
    fileSizeBytes: integer(),

    status: contentStatusEnum().notNull().default("draft"),
    sortOrder: integer().notNull().default(0),

    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    publishedAt: timestamp({ withTimezone: true }),

    ...timestamps,
    deletedAt: deletedAt(),
  },
  (table) => [
    /** O índice da tela de acervo com filtro por disciplina e assunto. */
    index("content_items_filter_idx").on(
      table.type,
      table.status,
      table.canonicalSubjectId,
      table.canonicalTopicId,
    ),
    index("content_items_topic_idx").on(table.canonicalTopicId),
    index("content_items_access_idx").on(table.requiredAccessLevel, table.status),
  ],
);

/** Cartão de um baralho de flashcards. */
export const flashcards = pgTable(
  "flashcards",
  {
    id: primaryId(),
    contentItemId: uuid()
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),

    front: text().notNull(),
    back: text().notNull(),
    hint: text(),
    sortOrder: integer().notNull().default(0),

    ...timestamps,
  },
  (table) => [index("flashcards_deck_idx").on(table.contentItemId, table.sortOrder)],
);

/** Progresso do aluno em um item de conteúdo. */
export const contentProgress = pgTable(
  "content_progress",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    contentItemId: uuid()
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),

    status: contentProgressStatusEnum().notNull().default("not_started"),
    progressPercent: integer().notNull().default(0),
    /** Onde parou a videoaula. */
    lastPositionSeconds: integer(),

    lastAccessedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("content_progress_unique").on(table.userId, table.contentItemId),
    index("content_progress_user_idx").on(table.userId, table.lastAccessedAt),
  ],
);

/* ========================================================================== *
 * TRILHAS
 * ========================================================================== */

export const trails = pgTable(
  "trails",
  {
    id: primaryId(),
    title: varchar({ length: 200 }).notNull(),
    description: text(),
    canonicalSubjectId: uuid().references(() => canonicalSubjects.id, {
      onDelete: "set null",
    }),
    coverUrl: text(),
    requiredAccessLevel: contentAccessLevelEnum().notNull().default("limited"),
    status: contentStatusEnum().notNull().default("draft"),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (table) => [index("trails_status_idx").on(table.status, table.sortOrder)],
);

export const trailSteps = pgTable(
  "trail_steps",
  {
    id: primaryId(),
    trailId: uuid()
      .notNull()
      .references(() => trails.id, { onDelete: "cascade" }),

    title: varchar({ length: 200 }).notNull(),
    contentItemId: uuid().references(() => contentItems.id, { onDelete: "set null" }),
    canonicalTopicId: uuid().references(() => canonicalTopics.id, {
      onDelete: "set null",
    }),

    sortOrder: integer().notNull().default(0),
    isRequired: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [index("trail_steps_trail_idx").on(table.trailId, table.sortOrder)],
);

export const userTrailProgress = pgTable(
  "user_trail_progress",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    trailId: uuid()
      .notNull()
      .references(() => trails.id, { onDelete: "cascade" }),

    currentStepId: uuid().references(() => trailSteps.id, { onDelete: "set null" }),
    stepsCompleted: integer().notNull().default(0),
    stepsTotal: integer().notNull().default(0),
    status: contentProgressStatusEnum().notNull().default("not_started"),

    startedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("user_trail_progress_unique").on(table.userId, table.trailId),
  ],
);

export const contentItemsRelations = relations(contentItems, ({ one, many }) => ({
  canonicalSubject: one(canonicalSubjects, {
    fields: [contentItems.canonicalSubjectId],
    references: [canonicalSubjects.id],
  }),
  canonicalTopic: one(canonicalTopics, {
    fields: [contentItems.canonicalTopicId],
    references: [canonicalTopics.id],
  }),
  flashcards: many(flashcards),
}));

export const flashcardsRelations = relations(flashcards, ({ one }) => ({
  deck: one(contentItems, {
    fields: [flashcards.contentItemId],
    references: [contentItems.id],
  }),
}));

export const trailsRelations = relations(trails, ({ many }) => ({
  steps: many(trailSteps),
}));
