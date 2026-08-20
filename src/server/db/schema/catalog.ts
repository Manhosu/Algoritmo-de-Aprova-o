import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { deletedAt, primaryId, timestamps } from "./_shared";
import { contentOriginEnum } from "./enums";
import { users } from "./identity";

/* ==========================================================================
 * CATÁLOGO CANÔNICO
 * ==========================================================================
 *
 * ESTA É A PONTE. Leia antes de mexer em qualquer coisa aqui.
 *
 * O produto tem DUAS taxonomias que precisam se encontrar:
 *
 *   (a) O conteúdo programático do edital DE CADA ALUNO, que a IA extrai de um
 *       PDF e vem em texto livre ("Crase", "Emprego do sinal indicativo de
 *       crase", "Acentuação gráfica e crase"). Fica em `preparation.ts`.
 *
 *   (b) O CATÁLOGO CANÔNICO — este arquivo — que é a taxonomia única mantida
 *       pela operação e à qual as questões, os materiais e as estatísticas de
 *       turma estão presos.
 *
 * Se as duas não se encontrarem, a Tarefa do Dia manda o aluno "resolver 15
 * questões de Crase" e o banco devolve zero, a Cobertura do Edital calcula
 * sobre um denominador que não existe, e o card de Lacunas fica vazio. O
 * produto parece funcionar e não funciona.
 *
 * O encontro acontece em três camadas, nesta ordem:
 *   1. `canonicalTopicId` no item do edital do aluno (casamento direto);
 *   2. `canonicalTopicAliases` (sinônimos aprendidos, incluindo os que um
 *      administrador resolveu à mão — resolver uma vez conserta para todos);
 *   3. `topicMappingQueue` (a fila do painel, em `preparation.ts`), para o que
 *      não casou. O que não casa precisa ser VISÍVEL, não silencioso.
 * ========================================================================== */

/**
 * Banca organizadora (Cebraspe, FGV, FCC...).
 *
 * Tabela, não texto livre (decisão fechada): o filtro de questões por banca
 * precisa ser confiável, e o mesmo nome digitado de três jeitos diferentes
 * quebraria o filtro sem ninguém perceber.
 */
export const examBoards = pgTable(
  "exam_boards",
  {
    id: primaryId(),
    name: varchar({ length: 160 }).notNull(),
    shortName: varchar({ length: 40 }).notNull(),
    slug: varchar({ length: 60 }).notNull(),
    isActive: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("exam_boards_slug_unique").on(table.slug),
    index("exam_boards_active_idx").on(table.isActive, table.sortOrder),
  ],
);

/**
 * Disciplina canônica (Português, Direito Administrativo, Raciocínio Lógico...).
 */
export const canonicalSubjects = pgTable(
  "canonical_subjects",
  {
    id: primaryId(),
    name: varchar({ length: 160 }).notNull(),
    slug: varchar({ length: 180 }).notNull(),
    /** Forma normalizada (minúscula, sem acento) usada pelo casamento automático. */
    normalizedName: varchar({ length: 180 }).notNull(),
    description: text(),
    /** Ícone/cor opcionais para a UI de Desempenho por Disciplina. */
    icon: varchar({ length: 40 }),
    colorToken: varchar({ length: 40 }),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex("canonical_subjects_slug_unique").on(table.slug),
    index("canonical_subjects_normalized_idx").on(table.normalizedName),
  ],
);

/**
 * Assunto canônico. É uma ÁRVORE: `parentId` aponta para o assunto pai dentro
 * da mesma disciplina, porque edital de concurso é hierárquico
 * ("Crase" está dentro de "Sintaxe", que está dentro de "Gramática").
 *
 * `path` e `depth` são desnormalizações deliberadas: sem elas, "todos os
 * assuntos abaixo de X" vira consulta recursiva a cada carregamento de tela.
 * Com elas vira um `LIKE 'x.y.%'` com índice.
 */
export const canonicalTopics = pgTable(
  "canonical_topics",
  {
    id: primaryId(),
    subjectId: uuid()
      .notNull()
      .references(() => canonicalSubjects.id, { onDelete: "cascade" }),
    parentId: uuid().references((): AnyPgColumn => canonicalTopics.id, {
      onDelete: "cascade",
    }),

    name: varchar({ length: 240 }).notNull(),
    slug: varchar({ length: 260 }).notNull(),
    normalizedName: varchar({ length: 260 }).notNull(),

    /** Caminho materializado, ex.: "portugues.sintaxe.crase". */
    path: text().notNull(),
    depth: smallint().notNull().default(0),
    sortOrder: integer().notNull().default(0),

    description: text(),
    isActive: boolean().notNull().default(true),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex("canonical_topics_slug_unique").on(table.slug),
    index("canonical_topics_subject_idx").on(table.subjectId, table.sortOrder),
    index("canonical_topics_parent_idx").on(table.parentId),
    index("canonical_topics_path_idx").on(table.path),
    index("canonical_topics_normalized_idx").on(table.normalizedName),
  ],
);

/**
 * Sinônimos de um assunto canônico. É o MECANISMO DE APRENDIZADO do casamento.
 *
 * Fluxo que faz o sistema melhorar sozinho:
 *   1. o edital de um aluno traz "Emprego do sinal indicativo de crase";
 *   2. o casamento automático não tem confiança suficiente e manda para a fila;
 *   3. um administrador resolve, apontando para o assunto canônico "Crase";
 *   4. a resolução vira uma linha AQUI;
 *   5. o próximo aluno que subir um edital com essa redação casa sozinho.
 *
 * Sem esta tabela, a fila do painel recebe o mesmo item para sempre.
 */
export const canonicalTopicAliases = pgTable(
  "canonical_topic_aliases",
  {
    id: primaryId(),
    topicId: uuid()
      .notNull()
      .references(() => canonicalTopics.id, { onDelete: "cascade" }),

    alias: varchar({ length: 300 }).notNull(),
    /** Chave de busca: minúscula, sem acento, sem pontuação, espaços colapsados. */
    normalizedAlias: varchar({ length: 300 }).notNull(),

    /** Quem criou o sinônimo — "admin" tem prioridade sobre "ai" em conflito. */
    origin: contentOriginEnum().notNull().default("admin"),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),

    ...timestamps,
  },
  (table) => [
    /**
     * Um mesmo texto normalizado não pode apontar para dois assuntos: se
     * apontasse, o casamento automático viraria sorteio.
     */
    uniqueIndex("canonical_topic_aliases_normalized_unique").on(table.normalizedAlias),
    index("canonical_topic_aliases_topic_idx").on(table.topicId),
  ],
);

/** Mesma ideia dos sinônimos de assunto, no nível da disciplina. */
export const canonicalSubjectAliases = pgTable(
  "canonical_subject_aliases",
  {
    id: primaryId(),
    subjectId: uuid()
      .notNull()
      .references(() => canonicalSubjects.id, { onDelete: "cascade" }),
    alias: varchar({ length: 300 }).notNull(),
    normalizedAlias: varchar({ length: 300 }).notNull(),
    origin: contentOriginEnum().notNull().default("admin"),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("canonical_subject_aliases_normalized_unique").on(
      table.normalizedAlias,
    ),
    index("canonical_subject_aliases_subject_idx").on(table.subjectId),
  ],
);

/* ========================================================================== *
 * RELAÇÕES
 * ========================================================================== */

export const canonicalSubjectsRelations = relations(
  canonicalSubjects,
  ({ many }) => ({
    topics: many(canonicalTopics),
    aliases: many(canonicalSubjectAliases),
  }),
);

export const canonicalTopicsRelations = relations(canonicalTopics, ({ one, many }) => ({
  subject: one(canonicalSubjects, {
    fields: [canonicalTopics.subjectId],
    references: [canonicalSubjects.id],
  }),
  parent: one(canonicalTopics, {
    fields: [canonicalTopics.parentId],
    references: [canonicalTopics.id],
    relationName: "topic_parent",
  }),
  children: many(canonicalTopics, { relationName: "topic_parent" }),
  aliases: many(canonicalTopicAliases),
}));

export const canonicalTopicAliasesRelations = relations(
  canonicalTopicAliases,
  ({ one }) => ({
    topic: one(canonicalTopics, {
      fields: [canonicalTopicAliases.topicId],
      references: [canonicalTopics.id],
    }),
  }),
);
