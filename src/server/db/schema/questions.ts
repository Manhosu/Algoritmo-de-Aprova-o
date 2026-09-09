import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { createdAt, deletedAt, primaryId, timestamps } from "./_shared";
import { plans } from "./billing";
import { canonicalSubjects, canonicalTopics, examBoards } from "./catalog";
import { dailyTaskItems } from "./daily-task";
import {
  attemptSourceEnum,
  importBatchStatusEnum,
  questionDifficultyEnum,
  questionStatusEnum,
  questionTypeEnum,
} from "./enums";
import { users } from "./identity";
import { preparations, studyPlanTopics } from "./preparation";
import { reviewOccurrences } from "./review";

/* ==========================================================================
 * BANCO DE QUESTÕES
 * ========================================================================== */

/**
 * Lote de importação (CSV no Marco 1, planilha Excel no Marco 2 — README 2.6).
 *
 * Existe para que a importação seja REVERSÍVEL: importar 2.000 questões com o
 * assunto errado sem saber quais foram é um problema sem solução barata. Com o
 * lote, é um `delete where importBatchId = ...`.
 */
export const questionImportBatches = pgTable(
  "question_import_batches",
  {
    id: primaryId(),
    fileName: varchar({ length: 260 }).notNull(),
    uploadedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),

    status: importBatchStatusEnum().notNull().default("processing"),
    totalRows: integer().notNull().default(0),
    importedRows: integer().notNull().default(0),
    skippedRows: integer().notNull().default(0),
    failedRows: integer().notNull().default(0),

    /** Erro por linha, para o admin corrigir a planilha e reenviar. */
    errors: jsonb().$type<Array<{ row: number; message: string }>>(),

    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp({ withTimezone: true }),

    ...timestamps,
  },
  (table) => [index("question_import_batches_status_idx").on(table.status)],
);

/**
 * Questão do banco.
 *
 * A classificação é feita SEMPRE contra o catálogo canônico
 * (`canonicalSubjectId` / `canonicalTopicId`), nunca contra o edital de um
 * aluno. É por isso que a mesma questão serve a todos os alunos, e é por isso
 * que a ponte de `catalog.ts` precisa funcionar.
 *
 * FILTRO DE BANCA (decisão fechada com a cliente): `examBoardId` é opcional e
 * o filtro da tela NÃO é restrito à banca do edital do aluno. Restringir
 * deixaria o banco vazio para a maioria dos concursos.
 */
export const questions = pgTable(
  "questions",
  {
    id: primaryId(),

    examBoardId: uuid().references(() => examBoards.id, { onDelete: "set null" }),
    canonicalSubjectId: uuid()
      .notNull()
      .references(() => canonicalSubjects.id, { onDelete: "restrict" }),
    canonicalTopicId: uuid().references(() => canonicalTopics.id, {
      onDelete: "set null",
    }),

    /** Contexto de origem — vira legenda "FGV · 2024 · TJ-SP · Analista". */
    year: smallint(),
    institution: varchar({ length: 200 }),
    position: varchar({ length: 200 }),

    type: questionTypeEnum().notNull().default("multiple_choice"),
    difficulty: questionDifficultyEnum().notNull().default("medium"),

    /** Texto de apoio (quando várias questões compartilham um enunciado base). */
    contextText: text(),
    statement: text().notNull(),

    /**
     * O comentário exibido logo abaixo da resposta (README 1.9).
     * É requisito de aceite do Marco 1: sem isto a questão não pode ser
     * publicada — validado na aplicação, ver `questionStatus`.
     */
    explanation: text(),

    sourceReference: text(),
    status: questionStatusEnum().notNull().default("draft"),

    /** Estatística da turma, mantida por rollup — evita COUNT no banco inteiro. */
    attemptCount: integer().notNull().default(0),
    correctCount: integer().notNull().default(0),

    importBatchId: uuid().references(() => questionImportBatches.id, {
      onDelete: "set null",
    }),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),

    /** Chave de deduplicação: hash do enunciado normalizado. */
    contentHash: varchar({ length: 64 }),

    ...timestamps,
    deletedAt: deletedAt(),
  },
  (table) => [
    /** O índice que serve à tela de filtros (README 1.9). */
    index("questions_filter_idx").on(
      table.status,
      table.canonicalSubjectId,
      table.canonicalTopicId,
      table.difficulty,
    ),
    index("questions_board_idx").on(table.examBoardId, table.status),
    index("questions_topic_idx").on(table.canonicalTopicId, table.status),
    index("questions_batch_idx").on(table.importBatchId),
    uniqueIndex("questions_content_hash_unique").on(table.contentHash),
  ],
);

/**
 * Alternativa de uma questão.
 * `explanation` por alternativa é opcional e complementa o comentário geral —
 * explicar por que a "C" está errada costuma ensinar mais que a justificativa
 * da correta.
 */
export const questionOptions = pgTable(
  "question_options",
  {
    id: primaryId(),
    questionId: uuid()
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),

    label: varchar({ length: 4 }).notNull(),
    content: text().notNull(),
    isCorrect: boolean().notNull().default(false),
    explanation: text(),
    sortOrder: integer().notNull().default(0),

    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("question_options_label_unique").on(table.questionId, table.label),
    index("question_options_question_idx").on(table.questionId, table.sortOrder),
  ],
);

/* ==========================================================================
 * HISTÓRICO DE RESPOSTAS
 * ==========================================================================
 *
 * A TABELA MAIS IMPORTANTE PARA AS MÉTRICAS. Leia a nota sobre data e hora.
 * ========================================================================== */

/**
 * Uma resposta de um aluno a uma questão.
 *
 * POR QUE HÁ TRÊS COLUNAS DE TEMPO
 * ----------------------------------------------------------------------------
 * `answeredAt` é o instante absoluto (timestamptz) — a verdade.
 * `answeredDate` e `answeredHour` são a MESMA informação já convertida para o
 * fuso do aluno e gravadas no momento da escrita.
 *
 * Isso não é redundância: são as duas métricas que o README exige.
 *
 *   • HORÁRIO DE OURO (README 2.1) = agrupar por `answeredHour` e comparar o
 *     percentual de acerto entre faixas. Sem a coluna, cada consulta teria que
 *     converter fuso linha a linha sobre o histórico inteiro — o que não usa
 *     índice e fica lento exatamente quando o aluno tem dado suficiente para a
 *     métrica valer alguma coisa.
 *
 *   • GRÁFICO DE EVOLUÇÃO (README 2.1) = percentual de acertos por
 *     `answeredDate`. E a regra crítica — "dia sem questão não tem ponto, não
 *     plota zero" — deixa de ser um caso especial no código do gráfico: se não
 *     houve resposta no dia, não existe linha, e portanto não existe ponto. A
 *     regra passa a ser uma consequência do modelo em vez de uma lembrança de
 *     quem escrever o front.
 *
 * Converter na escrita, e não na leitura, também protege contra o aluno mudar
 * de fuso: o dia em que ele respondeu continua sendo o dia em que ele respondeu.
 */
export const questionAttempts = pgTable(
  "question_attempts",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questionId: uuid()
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),

    /** Nulos quando o aluno responde no banco livre, fora de uma preparação. */
    preparationId: uuid().references(() => preparations.id, { onDelete: "set null" }),
    planTopicId: uuid().references(() => studyPlanTopics.id, { onDelete: "set null" }),

    /** De onde veio a resposta — separa Tarefa do Dia, banco livre e revisão. */
    source: attemptSourceEnum().notNull().default("question_bank"),
    dailyTaskItemId: uuid().references(() => dailyTaskItems.id, {
      onDelete: "set null",
    }),
    reviewOccurrenceId: uuid().references(() => reviewOccurrences.id, {
      onDelete: "set null",
    }),

    selectedOptionId: uuid().references(() => questionOptions.id, {
      onDelete: "set null",
    }),
    isCorrect: boolean().notNull(),
    timeSpentSeconds: integer(),

    answeredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Data civil no fuso do aluno. Ver nota acima. */
    answeredDate: date({ mode: "string" }).notNull(),
    /** Hora local 0–23. Ver nota acima. */
    answeredHour: smallint().notNull(),

    createdAt: createdAt(),
  },
  (table) => [
    /** Gráfico de evolução e rollups diários. */
    index("question_attempts_user_date_idx").on(table.userId, table.answeredDate),
    /** Horário de Ouro. */
    index("question_attempts_user_hour_idx").on(table.userId, table.answeredHour),
    /** Desempenho por assunto — alimenta `topicStates` e o card de Lacunas. */
    index("question_attempts_topic_idx").on(table.planTopicId, table.answeredAt),
    index("question_attempts_preparation_idx").on(table.preparationId, table.answeredDate),
    /** Estatística da turma por questão (README 2.6). */
    index("question_attempts_question_idx").on(table.questionId),
    check(
      "question_attempts_hour_check",
      sql`${table.answeredHour} between 0 and 23`,
    ),
  ],
);

/**
 * Consumo diário de questões por aluno.
 *
 * Faz DUAS coisas, e as duas foram pedidas explicitamente:
 *
 *   1. APLICA O LIMITE DO PLANO (Free 10 / Intermediário 20 / Premium
 *      ilimitado) sem contar linhas em `questionAttempts` a cada resposta. O
 *      Eduardo pediu o limite já no Marco 1 justamente para não ter que costurar
 *      isso depois no meio de um fluxo pronto — a checagem é um SELECT por
 *      chave única.
 *
 *   2. RESPONDE À MÉTRICA DE MONETIZAÇÃO "quantos atingem o limite do plano
 *      Free" (README 2.6). `limitReachedAt` marca o instante exato em que o
 *      aluno bateu no teto — que é o momento de maior intenção de upgrade do
 *      produto inteiro, e o dado que a cliente vai querer olhar primeiro.
 *
 * `planId` e `limitAtTime` guardam o plano e o teto vigentes NAQUELE dia: se o
 * limite do Free mudar de 10 para 15, o histórico continua contando a verdade.
 */
export const dailyQuestionUsage = pgTable(
  "daily_question_usage",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    usageDate: date({ mode: "string" }).notNull(),

    questionsAnswered: integer().notNull().default(0),

    planId: uuid().references(() => plans.id, { onDelete: "set null" }),
    /** NULO = plano sem limite naquele dia. */
    limitAtTime: integer(),
    limitReachedAt: timestamp({ withTimezone: true }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("daily_question_usage_unique").on(table.userId, table.usageDate),
    index("daily_question_usage_limit_idx").on(table.usageDate, table.limitReachedAt),
  ],
);

/**
 * Estatística agregada de erro por assunto canônico.
 *
 * Serve ao painel administrativo ("onde a turma mais erra", README 2.6) e ao
 * card de Lacunas. É rollup e não consulta ao vivo porque a pergunta é feita
 * sobre a base inteira, não sobre um aluno.
 */
export const topicPerformanceStats = pgTable(
  "topic_performance_stats",
  {
    canonicalTopicId: uuid()
      .primaryKey()
      .references(() => canonicalTopics.id, { onDelete: "cascade" }),
    attemptCount: integer().notNull().default(0),
    correctCount: integer().notNull().default(0),
    accuracyPercent: integer(),
    distinctUserCount: integer().notNull().default(0),
    lastComputedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("topic_performance_stats_accuracy_idx").on(table.accuracyPercent)],
);

/* ========================================================================== *
 * RELAÇÕES
 * ========================================================================== */

export const questionsRelations = relations(questions, ({ one, many }) => ({
  examBoard: one(examBoards, {
    fields: [questions.examBoardId],
    references: [examBoards.id],
  }),
  canonicalSubject: one(canonicalSubjects, {
    fields: [questions.canonicalSubjectId],
    references: [canonicalSubjects.id],
  }),
  canonicalTopic: one(canonicalTopics, {
    fields: [questions.canonicalTopicId],
    references: [canonicalTopics.id],
  }),
  options: many(questionOptions),
  attempts: many(questionAttempts),
}));

/* ========================================================================== *
 * ASSUNTOS ADICIONAIS DE UMA QUESTÃO
 * ========================================================================== */

/**
 * Os assuntos que a questão cobre, quando ela cobre mais de um.
 *
 * ⚠️ PEDIDO DA CLIENTE EM 09/09/2026, e ele conserta um defeito junto.
 *
 * Palavras dela: "ao subir questões da Vunesp notei que tem questões que
 * possuem mais de um assunto que são separados por ';'. Tem como o sistema
 * aceitar dessa forma e cadastrar a mesma questão em cada um dos assuntos?".
 *
 * Duplicar a questão, uma linha por assunto, é impossível e seria errado: o
 * índice único de `content_hash` recusa o segundo enunciado igual, e sem ele o
 * aluno veria a mesma pergunta duas vezes na mesma sessão de prática.
 *
 * O defeito que isso conserta: sem tratar o ";", o importador lia "Crase;
 * Concordância" como UM nome de assunto, não achava no catálogo e criava um
 * assunto canônico com esse nome. A questão ficava arquivada num assunto que
 * edital nenhum menciona, invisível para todo aluno, e a taxonomia ganhava
 * lixo com ponto e vírgula no meio.
 *
 * ⚠️ `questions.canonical_topic_id` CONTINUA SENDO O ASSUNTO PRINCIPAL.
 *
 * Ele é lido pelo Motor 1, pela maestria, pelas Trilhas e pelas estatísticas.
 * Trocar tudo por uma relação muitos-para-muitos mudaria o significado de
 * "acertei neste assunto" em nove lugares de uma vez. Aqui a tabela é um ÍNDICE
 * A MAIS: ela decide onde a questão APARECE, e o principal continua decidindo a
 * quem o desempenho é atribuído.
 *
 * Onde cada um manda, hoje:
 *
 *   ONDE A QUESTÃO APARECE — lê esta tabela
 *     `findQuestions` e o catálogo de filtros do Banco de Questões
 *     o filtro por assunto do painel (`listQuestionsForAdmin`)
 *     `countQuestionsByTopic`, que diz ao Motor 1 se há o que resolver
 *     `availableQuestions` das Trilhas e a disponibilidade por assunto do plano
 *
 *   A QUEM O DESEMPENHO PERTENCE — lê `questions.canonical_topic_id`
 *     a maestria e o "comprovar domínio"
 *     as estatísticas por assunto do painel
 *
 * A separação é deliberada. Uma questão de "Crase; Concordância" cobre os dois
 * assuntos o suficiente para ser oferecida nos dois, e não o suficiente para
 * que um acerto conte como domínio de ambos.
 */
export const questionTopics = pgTable(
  "question_topics",
  {
    questionId: uuid()
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    canonicalTopicId: uuid()
      .notNull()
      .references(() => canonicalTopics.id, { onDelete: "cascade" }),
    /** Verdadeiro para o mesmo assunto gravado em `questions.canonicalTopicId`. */
    isPrimary: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.questionId, table.canonicalTopicId] }),
    /* A busca por assunto entra por aqui, e ela é o caminho mais quente da tela. */
    index("question_topics_topic_idx").on(table.canonicalTopicId),
  ],
);

export const questionTopicsRelations = relations(questionTopics, ({ one }) => ({
  question: one(questions, {
    fields: [questionTopics.questionId],
    references: [questions.id],
  }),
  topic: one(canonicalTopics, {
    fields: [questionTopics.canonicalTopicId],
    references: [canonicalTopics.id],
  }),
}));

export const questionOptionsRelations = relations(questionOptions, ({ one }) => ({
  question: one(questions, {
    fields: [questionOptions.questionId],
    references: [questions.id],
  }),
}));

export const questionAttemptsRelations = relations(questionAttempts, ({ one }) => ({
  user: one(users, { fields: [questionAttempts.userId], references: [users.id] }),
  question: one(questions, {
    fields: [questionAttempts.questionId],
    references: [questions.id],
  }),
  selectedOption: one(questionOptions, {
    fields: [questionAttempts.selectedOptionId],
    references: [questionOptions.id],
  }),
  planTopic: one(studyPlanTopics, {
    fields: [questionAttempts.planTopicId],
    references: [studyPlanTopics.id],
  }),
}));
