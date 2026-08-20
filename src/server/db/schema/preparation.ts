import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { createdAt, deletedAt, primaryId, timestamps } from "./_shared";
import {
  canonicalSubjects,
  canonicalTopics,
  examBoards,
} from "./catalog";
import { engineConfigs } from "./engine";
import {
  contentOriginEnum,
  coverageStatusEnum,
  diagnosticGranularityEnum,
  diagnosticStatusEnum,
  documentSourceEnum,
  extractionStatusEnum,
  mappingQueueStatusEnum,
  masteryLevelEnum,
  preparationStatusEnum,
  topicMappingStatusEnum,
  weightSourceEnum,
} from "./enums";
import { users } from "./identity";

/* ========================================================================== *
 * PREPARAÇÃO
 * ========================================================================== */

/**
 * Uma preparação = um edital que o aluno está estudando.
 *
 * MÚLTIPLAS PREPARAÇÕES (README 1.10, decisão fechada)
 * ----------------------------------------------------------------------------
 * A relação com `users` é 1:N desde já, sem exceção no schema. A restrição
 * "mais de uma preparação só no Premium" é um LIMITE DE PLANO
 * (`planLimits.maxActivePreparations`), verificado na criação — não uma
 * limitação estrutural. Foi feito assim de propósito: quando o aluno faz
 * upgrade ou downgrade, nada no schema muda, só a contagem permitida.
 *
 * `status` É O FUNIL DE ATIVAÇÃO
 * ----------------------------------------------------------------------------
 * draft → extracting → review_pending → diagnosis_pending → active
 * Cada transição é um degrau do funil do painel administrativo (README 2.6) e
 * fica carimbada nos campos `*At` abaixo. Guardamos o carimbo, e não só o
 * status atual, porque o funil precisa saber QUANDO cada degrau foi vencido —
 * e onde o aluno parou, se parou.
 */
export const preparations = pgTable(
  "preparations",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Cargo pretendido, informado no passo 1 do fluxo "+" (README 1.4). */
    targetPosition: varchar({ length: 200 }).notNull(),
    /** Rótulo curto que o aluno vê ao trocar de preparação. */
    title: varchar({ length: 160 }),
    /** Órgão / instituição do concurso. */
    institution: varchar({ length: 200 }),

    examBoardId: uuid().references(() => examBoards.id, { onDelete: "set null" }),

    /**
     * Data da prova. Alimenta o sinal de URGÊNCIA do Motor 1 e o
     * "Faltam X dias para a prova" da Home.
     *
     * A IA tenta extrair do edital; o aluno confirma ou informa no passo 4.
     * Quando o edital ainda não marcou data, o aluno informa uma data-alvo
     * ESTIMADA e `examDateIsEstimated` fica verdadeiro — nesse caso o motor
     * usa urgência neutra em vez de acelerar em cima de uma data inventada.
     */
    examDate: date({ mode: "string" }),
    examDateIsEstimated: boolean().notNull().default(false),

    status: preparationStatusEnum().notNull().default("draft"),

    /* --- Carimbos do funil ------------------------------------------------ */
    editalUploadedAt: timestamp({ withTimezone: true }),
    extractionSucceededAt: timestamp({ withTimezone: true }),
    contentConfirmedAt: timestamp({ withTimezone: true }),
    diagnosisCompletedAt: timestamp({ withTimezone: true }),
    activatedAt: timestamp({ withTimezone: true }),
    archivedAt: timestamp({ withTimezone: true }),

    /** Preparação que o aluno está vendo agora (só uma por usuário). */
    isCurrent: boolean().notNull().default(false),

    /**
     * BLOQUEIO POR QUEDA DE PLANO — nunca exclusão.
     *
     * Um aluno Premium com 3 preparações que cai para o Free não perde nada.
     * As preparações excedentes recebem este carimbo e passam a ser
     * SOMENTE LEITURA: o conteúdo, o histórico e as métricas continuam
     * visíveis, mas não geram Tarefa do Dia, não agendam revisão e não aceitam
     * resposta de questão.
     *
     * O aluno escolhe qual das três fica ativa, e pode trocar quando quiser —
     * trocar custa nada e é justo. Ao voltar para o Premium, o carimbo é
     * limpo e tudo volta a funcionar.
     *
     * Apagar dado do aluno porque o cartão dele falhou seria a pior decisão
     * possível de retenção, e não está no README em lugar nenhum.
     */
    lockedByPlanAt: timestamp({ withTimezone: true }),

    ...timestamps,
    deletedAt: deletedAt(),
  },
  (table) => [
    index("preparations_user_idx").on(table.userId, table.status),
    index("preparations_status_idx").on(table.status),
    index("preparations_exam_date_idx").on(table.examDate),
    index("preparations_locked_idx").on(table.userId, table.lockedByPlanAt),
    uniqueIndex("preparations_one_current_per_user")
      .on(table.userId)
      .where(sql`${table.isCurrent} = true`),
    /** Uma preparação bloqueada não pode ser a que o aluno está usando. */
    check(
      "preparations_locked_not_current_check",
      sql`${table.lockedByPlanAt} is null or ${table.isCurrent} = false`,
    ),
  ],
);

/**
 * Disponibilidade de estudo por dia da semana — DO ALUNO, não da preparação.
 *
 * Sem isto o Motor 1 não sabe QUANTO cabe num dia e entrega 8 horas de tarefa
 * para quem estuda 2 — o jeito mais rápido de o aluno abandonar na primeira
 * semana. Uma linha por dia da semana cobre a realidade comum de "1h de segunda
 * a sexta, 4h no sábado, nada no domingo".
 *
 * POR QUE FICA NO USUÁRIO E NÃO NA PREPARAÇÃO
 * ----------------------------------------------------------------------------
 * Pedido da cliente em 20/08/2026: o campo entra no cadastro do perfil e é
 * editável a qualquer momento. E é o modelo correto de qualquer forma — um
 * aluno Premium com dois editais não tem 2 horas para CADA um; ele tem 2 horas,
 * ponto. Se a disponibilidade morasse na preparação, duas preparações
 * significariam quatro horas por dia, e o cronograma prometeria um tempo que o
 * aluno não tem.
 *
 * O motor recebe o orçamento diário do aluno e o distribui entre as preparações
 * ativas, com mais peso para a prova mais próxima.
 *
 * Toda alteração aqui dispara recálculo do cronograma
 * (`schedule_recalc_reason = 'availability_changed'`).
 *
 * weekday: 0 = domingo ... 6 = sábado (mesma convenção de `Date.getDay()`).
 */
export const userAvailability = pgTable(
  "user_availability",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    weekday: smallint().notNull(),
    minutesAvailable: integer().notNull().default(0),
    /** Faixa preferida de estudo, se o aluno informar (ex.: "19:00"). */
    preferredStartTime: varchar({ length: 5 }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("user_availability_unique").on(table.userId, table.weekday),
    check("user_availability_weekday_check", sql`${table.weekday} between 0 and 6`),
    check(
      "user_availability_minutes_check",
      sql`${table.minutesAvailable} between 0 and 1440`,
    ),
  ],
);

/* ========================================================================== *
 * EDITAL EM PDF E LEITURA PELA IA
 * ========================================================================== */

/**
 * Arquivo do edital enviado pelo aluno.
 *
 * O painel administrativo precisa de "acesso a todos os editais enviados pelos
 * alunos" (README 2.6) — é esta tabela que responde a isso.
 *
 * `checksum` evita reprocessar (e recobrar da API da Anthropic) o mesmo PDF
 * duas vezes, o que importa porque o custo de IA corre por conta da cliente.
 */
export const preparationDocuments = pgTable(
  "preparation_documents",
  {
    id: primaryId(),
    preparationId: uuid()
      .notNull()
      .references(() => preparations.id, { onDelete: "cascade" }),
    uploadedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),

    fileName: varchar({ length: 260 }).notNull(),
    storagePath: text().notNull(),
    mimeType: varchar({ length: 100 }).notNull().default("application/pdf"),
    sizeBytes: integer().notNull(),
    /** SHA-256 do arquivo. */
    checksum: varchar({ length: 64 }).notNull(),
    pageCount: integer(),

    source: documentSourceEnum().notNull().default("student_upload"),
    uploadedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),

    ...timestamps,
    deletedAt: deletedAt(),
  },
  (table) => [
    index("preparation_documents_preparation_idx").on(table.preparationId),
    index("preparation_documents_checksum_idx").on(table.checksum),
    index("preparation_documents_uploaded_at_idx").on(table.uploadedAt),
  ],
);

/**
 * Uma execução de leitura do edital pela API da Anthropic.
 *
 * Guardamos tokens e custo estimado porque a infraestrutura é paga pela cliente
 * e proporcional ao uso (README): sem esta medição não há como responder
 * "quanto está custando" nem detectar um edital de 400 páginas queimando
 * orçamento.
 *
 * `promptVersion` e `rawResponse` existem para depuração: quando a extração sai
 * ruim, a única forma de melhorar o prompt é comparar entrada e saída reais.
 */
export const editalExtractions = pgTable(
  "edital_extractions",
  {
    id: primaryId(),
    preparationId: uuid()
      .notNull()
      .references(() => preparations.id, { onDelete: "cascade" }),
    documentId: uuid()
      .notNull()
      .references(() => preparationDocuments.id, { onDelete: "cascade" }),

    status: extractionStatusEnum().notNull().default("queued"),
    provider: varchar({ length: 40 }).notNull().default("anthropic"),
    model: varchar({ length: 80 }),
    promptVersion: varchar({ length: 40 }),

    startedAt: timestamp({ withTimezone: true }),
    finishedAt: timestamp({ withTimezone: true }),
    durationMs: integer(),

    inputTokens: integer(),
    outputTokens: integer(),
    estimatedCostCents: integer(),

    /** Quantidade extraída — comparar com o que o aluno manteve mede a qualidade. */
    extractedSubjectCount: integer(),
    extractedTopicCount: integer(),
    topicsWithWeightCount: integer(),

    errorMessage: text(),
    attemptNumber: smallint().notNull().default(1),
    rawResponse: jsonb(),

    ...timestamps,
  },
  (table) => [
    index("edital_extractions_preparation_idx").on(table.preparationId, table.status),
    index("edital_extractions_status_idx").on(table.status, table.createdAt),
  ],
);

/* ========================================================================== *
 * CONTEÚDO PROGRAMÁTICO DO ALUNO
 * ========================================================================== */

/**
 * Disciplina DENTRO do edital de um aluno.
 *
 * `rawName` guarda o texto exatamente como saiu do PDF e nunca é sobrescrito.
 * `displayName` é o que o aluno vê e pode editar (README 1.4 passo 3).
 * Manter os dois separados é o que permite medir a qualidade da extração e
 * reprocessar o casamento depois sem perder o original.
 */
export const studyPlanSubjects = pgTable(
  "study_plan_subjects",
  {
    id: primaryId(),
    preparationId: uuid()
      .notNull()
      .references(() => preparations.id, { onDelete: "cascade" }),

    /** Casamento com o catálogo. NULO = ainda não casou (ver fila). */
    canonicalSubjectId: uuid().references(() => canonicalSubjects.id, {
      onDelete: "set null",
    }),

    rawName: text().notNull(),
    displayName: varchar({ length: 200 }).notNull(),
    normalizedName: varchar({ length: 200 }).notNull(),

    sortOrder: integer().notNull().default(0),
    origin: contentOriginEnum().notNull().default("ai"),

    mappingStatus: topicMappingStatusEnum().notNull().default("unmapped"),
    mappingConfidence: real(),

    isActive: boolean().notNull().default(true),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (table) => [
    index("study_plan_subjects_preparation_idx").on(table.preparationId, table.sortOrder),
    index("study_plan_subjects_canonical_idx").on(table.canonicalSubjectId),
    index("study_plan_subjects_mapping_idx").on(table.mappingStatus),
  ],
);

/**
 * Assunto DENTRO do edital de um aluno. Árvore, como o edital é.
 *
 * PESO DO ASSUNTO (decisão fechada com a cliente)
 * ----------------------------------------------------------------------------
 * `weight` é o peso usado pelo motor. `weightSource` diz de onde ele veio:
 *   • "edital"  — a IA achou a quantidade de questões por tema no PDF;
 *   • "student" — o aluno preencheu na tela de confirmação (README 1.4, 3b);
 *   • "default" — ninguém informou; o motor usa peso neutro e a UI mostra isso.
 *
 * Guardar a origem, e não só o número, é o que permite a tela de confirmação
 * destacar exatamente os campos que o aluno precisa preencher, e o motor saber
 * quando NÃO deve confiar no peso.
 *
 * `questionCountInExam` guarda o dado bruto ("12 questões") quando existir;
 * `weight` é a forma normalizada que o motor consome.
 */
export const studyPlanTopics = pgTable(
  "study_plan_topics",
  {
    id: primaryId(),
    preparationId: uuid()
      .notNull()
      .references(() => preparations.id, { onDelete: "cascade" }),
    planSubjectId: uuid()
      .notNull()
      .references(() => studyPlanSubjects.id, { onDelete: "cascade" }),
    parentId: uuid().references((): AnyPgColumn => studyPlanTopics.id, {
      onDelete: "cascade",
    }),

    /** A PONTE. Nulo = não casou com o catálogo; não há questão para ofertar. */
    canonicalTopicId: uuid().references(() => canonicalTopics.id, {
      onDelete: "set null",
    }),

    rawName: text().notNull(),
    displayName: varchar({ length: 300 }).notNull(),
    normalizedName: varchar({ length: 300 }).notNull(),

    depth: smallint().notNull().default(0),
    sortOrder: integer().notNull().default(0),

    weight: numeric({ precision: 8, scale: 3, mode: "number" }),
    weightSource: weightSourceEnum().notNull().default("default"),
    questionCountInExam: integer(),

    mappingStatus: topicMappingStatusEnum().notNull().default("unmapped"),
    mappingConfidence: real(),
    mappedAt: timestamp({ withTimezone: true }),
    mappedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),

    origin: contentOriginEnum().notNull().default("ai"),
    /** O aluno pode desativar um assunto sem apagá-lo do edital. */
    isActive: boolean().notNull().default(true),

    ...timestamps,
    deletedAt: deletedAt(),
  },
  (table) => [
    index("study_plan_topics_preparation_idx").on(table.preparationId, table.sortOrder),
    index("study_plan_topics_subject_idx").on(table.planSubjectId, table.sortOrder),
    index("study_plan_topics_parent_idx").on(table.parentId),
    index("study_plan_topics_canonical_idx").on(table.canonicalTopicId),
    /** Consulta da fila e do alerta "seu edital tem N assuntos sem questões". */
    index("study_plan_topics_mapping_idx").on(table.mappingStatus, table.preparationId),
    check("study_plan_topics_weight_check", sql`${table.weight} is null or ${table.weight} >= 0`),
  ],
);

/**
 * FILA DE ASSUNTOS NÃO MAPEADOS — pedido explícito do Eduardo.
 *
 * "Quando o casamento falhar, isso precisa ser VISÍVEL — senão o problema fica
 * invisível até o aluno reclamar que não aparece questão."
 *
 * A linha é DEDUPLICADA por `normalizedName`: se cinquenta alunos subirem
 * editais com "Emprego do sinal indicativo de crase", existe UMA linha na fila
 * com `occurrences = 50`. O administrador resolve uma vez, a resolução vira um
 * sinônimo em `canonicalTopicAliases`, e o conserto vale para os cinquenta e
 * para todos os próximos.
 *
 * `occurrences` também é a ordem de trabalho: resolve-se primeiro o que trava
 * mais aluno.
 */
export const topicMappingQueue = pgTable(
  "topic_mapping_queue",
  {
    id: primaryId(),

    /** Texto do edital, como veio, e sua forma normalizada (chave da fila). */
    rawName: text().notNull(),
    normalizedName: varchar({ length: 300 }).notNull(),
    /** Nome da disciplina onde apareceu — contexto para quem resolve. */
    subjectHint: varchar({ length: 200 }),

    /** Melhor palpite do casamento automático e sua confiança. */
    suggestedTopicId: uuid().references(() => canonicalTopics.id, {
      onDelete: "set null",
    }),
    suggestedConfidence: real(),
    /** Outros candidatos, quando ficou ambíguo. */
    alternatives: jsonb().$type<Array<{ topicId: string; confidence: number }>>(),

    /** Quantos itens de edital de alunos estão travados neste mesmo texto. */
    occurrences: integer().notNull().default(1),
    /** Quantos alunos distintos são afetados — mede o impacto real. */
    affectedUserCount: integer().notNull().default(1),

    status: mappingQueueStatusEnum().notNull().default("pending"),
    resolvedTopicId: uuid().references(() => canonicalTopics.id, {
      onDelete: "set null",
    }),
    resolvedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp({ withTimezone: true }),
    resolutionNote: text(),

    firstSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("topic_mapping_queue_normalized_unique").on(table.normalizedName),
    /** Ordenação padrão do painel: pendentes, mais impactantes primeiro. */
    index("topic_mapping_queue_status_idx").on(table.status, table.occurrences),
  ],
);

/* ========================================================================== *
 * DIAGNÓSTICO INICIAL
 * ========================================================================== */

/**
 * Uma execução do diagnóstico (README 1.5).
 *
 * DUAS DECISÕES DA CLIENTE (20/08/2026) MOLDAM ESTA TABELA
 * ----------------------------------------------------------------------------
 * 1. O diagnóstico é feito SOMENTE no nível de DISCIPLINA, com propagação para
 *    os assuntos. Um edital real tem 150 a 300 assuntos; exigir três cliques em
 *    cada um é o maior candidato a abandono do funil.
 *
 * 2. Ele NÃO pode ser refeito depois. Palavras dela: "para não interferir nas
 *    métricas do andamento do estudo depois". Está certo — se o aluno pudesse
 *    reescrever a percepção inicial, o ponto de partida das métricas mudaria
 *    retroativamente e "evoluí quanto?" deixaria de ter resposta.
 *
 * `lockedAt` marca o fechamento. Depois dele nenhuma resposta é aceita.
 *
 * Isso combina exatamente com o que `topicStates` já fazia: `initialMastery` é
 * a percepção do aluno e nunca muda; `currentMasteryScore` é o que o desempenho
 * real diz e evolui sozinho. Ou seja, o diagnóstico congelar não deixa ninguém
 * preso a um erro de clique — o algoritmo passa por cima dele conforme o aluno
 * responde questões, que é literalmente o que o aviso obrigatório da tela
 * promete.
 *
 * Como não há refino posterior, o diagnóstico precisa estar COMPLETO para a
 * preparação ser ativada. São ~10 a 15 disciplinas, não 300 assuntos.
 */
export const diagnostics = pgTable(
  "diagnostics",
  {
    id: primaryId(),
    preparationId: uuid()
      .notNull()
      .references(() => preparations.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    status: diagnosticStatusEnum().notNull().default("in_progress"),
    granularity: diagnosticGranularityEnum().notNull().default("subject"),

    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp({ withTimezone: true }),

    /** Fechamento definitivo. Preenchido, nenhuma resposta nova é aceita. */
    lockedAt: timestamp({ withTimezone: true }),

    /** Cobertura da resposta: quantos itens de quantos foram avaliados. */
    itemsAnswered: integer().notNull().default(0),
    itemsTotal: integer().notNull().default(0),

    ...timestamps,
  },
  (table) => [
    /** Um único diagnóstico por preparação — ele não se refaz. */
    uniqueIndex("diagnostics_preparation_unique").on(table.preparationId),
    index("diagnostics_user_idx").on(table.userId),
    /** Concluído implica travado: os dois carimbos andam juntos. */
    check(
      "diagnostics_completed_is_locked_check",
      sql`${table.status} <> 'completed' or (${table.completedAt} is not null and ${table.lockedAt} is not null)`,
    ),
  ],
);

/**
 * Resposta do diagnóstico para uma disciplina OU um assunto.
 *
 * `appliedToChildren` marca as respostas dadas no nível de disciplina que foram
 * propagadas para os assuntos filhos. Isso importa depois: uma percepção
 * propagada vale MENOS para o motor do que uma resposta dada assunto a assunto,
 * e o motor precisa saber a diferença.
 */
export const diagnosticResponses = pgTable(
  "diagnostic_responses",
  {
    id: primaryId(),
    diagnosticId: uuid()
      .notNull()
      .references(() => diagnostics.id, { onDelete: "cascade" }),
    preparationId: uuid()
      .notNull()
      .references(() => preparations.id, { onDelete: "cascade" }),

    planSubjectId: uuid().references(() => studyPlanSubjects.id, {
      onDelete: "cascade",
    }),
    planTopicId: uuid().references(() => studyPlanTopics.id, { onDelete: "cascade" }),

    masteryLevel: masteryLevelEnum().notNull(),
    appliedToChildren: boolean().notNull().default(false),

    answeredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (table) => [
    index("diagnostic_responses_diagnostic_idx").on(table.diagnosticId),
    index("diagnostic_responses_topic_idx").on(table.planTopicId),
    index("diagnostic_responses_subject_idx").on(table.planSubjectId),
    check(
      "diagnostic_responses_target_check",
      sql`(${table.planSubjectId} is not null) or (${table.planTopicId} is not null)`,
    ),
  ],
);

/* ========================================================================== *
 * ESTADO DERIVADO POR ASSUNTO
 * ========================================================================== */

/**
 * A MEMÓRIA DE TRABALHO DOS MOTORES.
 *
 * Uma linha por assunto do edital de um aluno, com tudo que os dois motores
 * precisam saber para decidir. É atualizada a cada questão respondida, cada
 * estudo concluído e cada revisão feita.
 *
 * Por que uma tabela derivada e não `SUM()` em cima do histórico:
 * a Tarefa do Dia precisa ordenar 300 assuntos por prioridade em tempo de
 * carregar uma tela, no celular. Reagregar milhares de respostas a cada
 * abertura não fecha a conta. Aqui a decisão do motor é uma leitura indexada.
 *
 * A fonte da verdade continua sendo o histórico (`questionAttempts`,
 * `studyLogs`, `reviewOccurrences`) — esta tabela é reconstruível a partir
 * dele, e a rotina de reconstrução é o que garante que uma calibração de pesos
 * não deixe dado inconsistente para trás.
 *
 * O aviso obrigatório da tela de diagnóstico ("será continuamente validado e
 * atualizado pelo Algoritmo") descreve exatamente esta tabela: `initialMastery`
 * é a percepção do aluno e nunca muda; `currentMasteryScore` é o que o
 * desempenho real diz, e é isso que o motor usa.
 */
export const topicStates = pgTable(
  "topic_states",
  {
    id: primaryId(),
    preparationId: uuid()
      .notNull()
      .references(() => preparations.id, { onDelete: "cascade" }),
    planTopicId: uuid()
      .notNull()
      .references(() => studyPlanTopics.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /* --- Percepção inicial (imutável) ------------------------------------- */
    initialMastery: masteryLevelEnum(),
    initialMasteryWasPropagated: boolean().notNull().default(false),

    /* --- Verdade observada ------------------------------------------------ */
    /** 0..1. Começa derivado do diagnóstico e migra para o desempenho real. */
    currentMasteryScore: real().notNull().default(0.5),
    /** 0..1. Quanto o sistema confia no score — cresce com o volume de dados. */
    masteryConfidence: real().notNull().default(0),

    questionsAnswered: integer().notNull().default(0),
    questionsCorrect: integer().notNull().default(0),
    /** Acerto nas últimas 20 respostas — capta melhora recente, não a média histórica. */
    recentAccuracy: real(),

    studySessionsCount: integer().notNull().default(0),
    studyMinutesTotal: integer().notNull().default(0),
    reviewsCompleted: integer().notNull().default(0),

    lastStudiedAt: timestamp({ withTimezone: true }),
    lastAnsweredAt: timestamp({ withTimezone: true }),
    lastReviewedAt: timestamp({ withTimezone: true }),
    lastScheduledAt: timestamp({ withTimezone: true }),

    coverageStatus: coverageStatusEnum().notNull().default("not_started"),

    /* --- Saída do Motor 1 ------------------------------------------------- */
    priorityScore: real(),
    priorityComputedAt: timestamp({ withTimezone: true }),
    /**
     * Último cálculo dos 5 sinais. Mesmo formato de
     * `daily_task_items.priority_breakdown` — ver a nota lá.
     */
    priorityBreakdown: jsonb().$type<{
      signals: {
        performance: number;
        editalWeight: number;
        urgency: number;
        recency: number;
        knowledgeGap: number;
      };
      contributions: {
        performance: number;
        editalWeight: number;
        urgency: number;
        recency: number;
        knowledgeGap: number;
      };
    }>(),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("topic_states_topic_unique").on(table.planTopicId),
    /** A consulta do Motor 1: pegar os assuntos de uma preparação por prioridade. */
    index("topic_states_priority_idx").on(table.preparationId, table.priorityScore),
    index("topic_states_user_idx").on(table.userId),
    index("topic_states_coverage_idx").on(table.preparationId, table.coverageStatus),
  ],
);

/**
 * Retrato diário da preparação.
 *
 * Alimenta o Índice de Preparação, a Cobertura do Edital e o Desempenho por
 * Disciplina do Marco 2 sem varrer o histórico inteiro a cada carregamento.
 * Uma linha por preparação por dia; dia sem atividade simplesmente não gera
 * linha — a mesma regra do gráfico de evolução.
 */
export const preparationMetrics = pgTable(
  "preparation_metrics",
  {
    id: primaryId(),
    preparationId: uuid()
      .notNull()
      .references(() => preparations.id, { onDelete: "cascade" }),
    metricDate: date({ mode: "string" }).notNull(),

    coveragePercent: real(),
    accuracyPercent: real(),
    reviewAdherencePercent: real(),
    taskCompletionPercent: real(),
    /** Índice de Preparação (0–100). NÃO é "Índice de Aprovação". */
    preparationIndex: real(),
    /** Como o índice foi composto, para poder explicá-lo. */
    indexBreakdown: jsonb(),
    /** Com qual versão da configuração o índice foi calculado (decisão 14). */
    engineConfigId: uuid().references(() => engineConfigs.id, {
      onDelete: "set null",
    }),

    computedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("preparation_metrics_unique").on(table.preparationId, table.metricDate),
    index("preparation_metrics_date_idx").on(table.metricDate),
  ],
);

/* ========================================================================== *
 * RELAÇÕES
 * ========================================================================== */

export const userAvailabilityRelations = relations(userAvailability, ({ one }) => ({
  user: one(users, { fields: [userAvailability.userId], references: [users.id] }),
}));

export const preparationsRelations = relations(preparations, ({ one, many }) => ({
  user: one(users, { fields: [preparations.userId], references: [users.id] }),
  examBoard: one(examBoards, {
    fields: [preparations.examBoardId],
    references: [examBoards.id],
  }),
  documents: many(preparationDocuments),
  extractions: many(editalExtractions),
  subjects: many(studyPlanSubjects),
  topics: many(studyPlanTopics),
  diagnostics: many(diagnostics),
  topicStates: many(topicStates),
}));

export const studyPlanSubjectsRelations = relations(
  studyPlanSubjects,
  ({ one, many }) => ({
    preparation: one(preparations, {
      fields: [studyPlanSubjects.preparationId],
      references: [preparations.id],
    }),
    canonicalSubject: one(canonicalSubjects, {
      fields: [studyPlanSubjects.canonicalSubjectId],
      references: [canonicalSubjects.id],
    }),
    topics: many(studyPlanTopics),
  }),
);

export const studyPlanTopicsRelations = relations(studyPlanTopics, ({ one, many }) => ({
  preparation: one(preparations, {
    fields: [studyPlanTopics.preparationId],
    references: [preparations.id],
  }),
  planSubject: one(studyPlanSubjects, {
    fields: [studyPlanTopics.planSubjectId],
    references: [studyPlanSubjects.id],
  }),
  canonicalTopic: one(canonicalTopics, {
    fields: [studyPlanTopics.canonicalTopicId],
    references: [canonicalTopics.id],
  }),
  parent: one(studyPlanTopics, {
    fields: [studyPlanTopics.parentId],
    references: [studyPlanTopics.id],
    relationName: "plan_topic_parent",
  }),
  children: many(studyPlanTopics, { relationName: "plan_topic_parent" }),
  state: one(topicStates, {
    fields: [studyPlanTopics.id],
    references: [topicStates.planTopicId],
  }),
}));

export const topicStatesRelations = relations(topicStates, ({ one }) => ({
  preparation: one(preparations, {
    fields: [topicStates.preparationId],
    references: [preparations.id],
  }),
  planTopic: one(studyPlanTopics, {
    fields: [topicStates.planTopicId],
    references: [studyPlanTopics.id],
  }),
}));

export const diagnosticsRelations = relations(diagnostics, ({ one, many }) => ({
  preparation: one(preparations, {
    fields: [diagnostics.preparationId],
    references: [preparations.id],
  }),
  responses: many(diagnosticResponses),
}));
