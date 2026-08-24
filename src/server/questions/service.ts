import "server-only";

import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { APP_TIMEZONE } from "@/config/app";
import { toCivilDate, toLocalHour, type CivilDate } from "@/modules/shared/dates";
import { db } from "@/server/db";
import {
  canonicalSubjects,
  canonicalTopics,
  dailyQuestionUsage,
  dailyTaskItems,
  examBoards,
  questionAttempts,
  questionOptions,
  questions,
  studyPlanTopics,
} from "@/server/db/schema";
import {
  applyAttemptToTopicState,
  awardXp,
  markActivity,
  xpEntriesFor,
} from "@/server/engine/progress";
import { recountTask } from "@/server/engine/task-progress";

/**
 * BANCO DE QUESTÕES (README 1.9).
 * ============================================================================
 *
 * Quatro exigências, e cada uma vira uma decisão aqui:
 *
 *   1. Filtros de banca, disciplina, assunto e dificuldade.
 *   2. ⚠️ O filtro de banca precisa permitir OUTRAS bancas além da do edital.
 *      Está no README com aviso: limitar à banca do edital deixaria o aluno
 *      com pouquíssimo conteúdo enquanto o acervo é construído.
 *   3. Comentário exibido logo abaixo da resposta.
 *   4. Registro automático de acerto, erro e histórico por aluno.
 *
 * E uma exigência que veio do Eduardo, não do README: o LIMITE DIÁRIO do plano
 * (Free 10 / Intermediário 20 / Premium ilimitado) já no Marco 1, "para não ter
 * que costurar isso depois no meio de um fluxo pronto".
 */

/* ========================================================================== *
 * FILTROS
 * ========================================================================== */

export type QuestionFilters = {
  examBoardId?: string | null;
  canonicalSubjectId?: string | null;
  canonicalTopicId?: string | null;
  difficulty?: "easy" | "medium" | "hard" | null;
  /** Esconde o que o aluno já respondeu certo — o padrão da tela de prática. */
  onlyUnanswered?: boolean;
};

export type FilterOption = { id: string; label: string; count?: number };

export type FilterCatalog = {
  boards: FilterOption[];
  subjects: FilterOption[];
  topics: Array<FilterOption & { subjectId: string }>;
};

/**
 * As opções dos quatro filtros.
 *
 * ⚠️ Traz TODAS as bancas com questão publicada, não só a do edital do aluno.
 * É o aviso do README 1.9, e a razão é prática: o acervo tem 106 questões hoje;
 * restringir à banca do edital deixaria a maioria dos alunos sem nada para
 * praticar. A banca do edital vira sugestão, não trava.
 */
export async function getFilterCatalog(): Promise<FilterCatalog> {
  const [boards, subjects, topics] = await Promise.all([
    db
      .selectDistinct({ id: examBoards.id, label: examBoards.shortName })
      .from(examBoards)
      .innerJoin(questions, eq(questions.examBoardId, examBoards.id))
      .where(eq(questions.status, "published"))
      .orderBy(examBoards.shortName),

    db
      .selectDistinct({ id: canonicalSubjects.id, label: canonicalSubjects.name })
      .from(canonicalSubjects)
      .innerJoin(questions, eq(questions.canonicalSubjectId, canonicalSubjects.id))
      .where(eq(questions.status, "published"))
      .orderBy(canonicalSubjects.name),

    db
      .selectDistinct({
        id: canonicalTopics.id,
        label: canonicalTopics.name,
        subjectId: canonicalTopics.subjectId,
      })
      .from(canonicalTopics)
      .innerJoin(questions, eq(questions.canonicalTopicId, canonicalTopics.id))
      .where(eq(questions.status, "published"))
      .orderBy(canonicalTopics.name),
  ]);

  return { boards, subjects, topics };
}

/** Resolve o `?assunto=slug` dos links da Tarefa do Dia. */
export async function findTopicBySlug(slug: string): Promise<{
  id: string;
  name: string;
  subjectId: string;
} | null> {
  const [row] = await db
    .select({
      id: canonicalTopics.id,
      name: canonicalTopics.name,
      subjectId: canonicalTopics.subjectId,
    })
    .from(canonicalTopics)
    .where(eq(canonicalTopics.slug, slug))
    .limit(1);

  return row ?? null;
}

/* ========================================================================== *
 * BUSCA
 * ========================================================================== */

export type QuestionOption = {
  id: string;
  label: string;
  content: string;
  /** Só chega ao cliente DEPOIS de responder. Ver `revealAnswer`. */
  isCorrect?: boolean;
  explanation?: string | null;
};

export type QuestionView = {
  id: string;
  statement: string;
  contextText: string | null;
  difficulty: "easy" | "medium" | "hard";
  /** Legenda de origem: "FGV · 2024 · TJ-SP". */
  sourceLabel: string;
  subjectName: string;
  topicName: string | null;
  options: QuestionOption[];
  /** Comentário do professor. Só chega ao cliente depois de responder. */
  explanation?: string | null;
  /** Resposta anterior deste aluno, quando existe. */
  previousAttempt: { selectedOptionId: string | null; isCorrect: boolean } | null;
};

export type QuestionPage = {
  questions: QuestionView[];
  total: number;
  /** Situação do limite diário — a tela precisa disso antes de deixar responder. */
  limit: DailyLimit;
};

const PAGE_SIZE = 10;

export async function findQuestions(input: {
  userId: string;
  filters: QuestionFilters;
  page?: number;
}): Promise<QuestionPage> {
  const conditions = [eq(questions.status, "published"), isNull(questions.deletedAt)];

  if (input.filters.examBoardId) {
    conditions.push(eq(questions.examBoardId, input.filters.examBoardId));
  }
  if (input.filters.canonicalSubjectId) {
    conditions.push(eq(questions.canonicalSubjectId, input.filters.canonicalSubjectId));
  }
  if (input.filters.canonicalTopicId) {
    conditions.push(eq(questions.canonicalTopicId, input.filters.canonicalTopicId));
  }
  if (input.filters.difficulty) {
    conditions.push(eq(questions.difficulty, input.filters.difficulty));
  }

  /**
   * "Só as que ainda não acertei."
   *
   * Exclui apenas os ACERTOS, não todas as tentativas: uma questão errada
   * precisa voltar a aparecer, senão o aluno nunca revê exatamente aquilo em
   * que falhou — que é o oposto do que o produto promete.
   */
  if (input.filters.onlyUnanswered) {
    conditions.push(
      sql`not exists (
        select 1 from ${questionAttempts}
        where ${questionAttempts.questionId} = ${questions.id}
          and ${questionAttempts.userId} = ${input.userId}
          and ${questionAttempts.isCorrect} = true
      )`,
    );
  }

  const where = and(...conditions);
  const page = Math.max(0, input.page ?? 0);

  const [rows, totalRow, limit] = await Promise.all([
    db
      .select({
        id: questions.id,
        statement: questions.statement,
        contextText: questions.contextText,
        difficulty: questions.difficulty,
        explanation: questions.explanation,
        year: questions.year,
        institution: questions.institution,
        position: questions.position,
        boardName: examBoards.shortName,
        subjectName: canonicalSubjects.name,
        topicName: canonicalTopics.name,
      })
      .from(questions)
      .innerJoin(canonicalSubjects, eq(questions.canonicalSubjectId, canonicalSubjects.id))
      .leftJoin(canonicalTopics, eq(questions.canonicalTopicId, canonicalTopics.id))
      .leftJoin(examBoards, eq(questions.examBoardId, examBoards.id))
      .where(where)
      .orderBy(questions.createdAt)
      .limit(PAGE_SIZE)
      .offset(page * PAGE_SIZE),

    db.select({ total: count() }).from(questions).where(where),

    getDailyLimit(input.userId),
  ]);

  if (rows.length === 0) {
    return { questions: [], total: totalRow[0]?.total ?? 0, limit };
  }

  const ids = rows.map((row) => row.id);

  const [optionRows, attemptRows] = await Promise.all([
    db
      .select({
        id: questionOptions.id,
        questionId: questionOptions.questionId,
        label: questionOptions.label,
        content: questionOptions.content,
        isCorrect: questionOptions.isCorrect,
        explanation: questionOptions.explanation,
      })
      .from(questionOptions)
      .where(inArray(questionOptions.questionId, ids))
      .orderBy(questionOptions.sortOrder),

    db
      .select({
        questionId: questionAttempts.questionId,
        selectedOptionId: questionAttempts.selectedOptionId,
        isCorrect: questionAttempts.isCorrect,
        answeredAt: questionAttempts.answeredAt,
      })
      .from(questionAttempts)
      .where(
        and(
          eq(questionAttempts.userId, input.userId),
          inArray(questionAttempts.questionId, ids),
        ),
      )
      .orderBy(desc(questionAttempts.answeredAt)),
  ]);

  const attempts = new Map<string, { selectedOptionId: string | null; isCorrect: boolean }>();
  for (const row of attemptRows) {
    // A lista vem da mais recente; a primeira de cada questão é a que vale.
    if (!attempts.has(row.questionId)) {
      attempts.set(row.questionId, {
        selectedOptionId: row.selectedOptionId,
        isCorrect: row.isCorrect,
      });
    }
  }

  return {
    questions: rows.map((row) => {
      const answered = attempts.get(row.id) ?? null;

      return {
        id: row.id,
        statement: row.statement,
        contextText: row.contextText,
        difficulty: row.difficulty,
        sourceLabel: buildSourceLabel(row),
        subjectName: row.subjectName,
        topicName: row.topicName,
        /**
         * ⚠️ `isCorrect` e os comentários só saem daqui quando o aluno JÁ
         * respondeu. O gabarito não pode chegar ao navegador antes da resposta:
         * qualquer pessoa abre o inspetor e vê a alternativa certa, e o produto
         * inteiro — diagnóstico, priorização, métricas — passa a medir uma
         * pessoa que não existe.
         */
        options: optionRows
          .filter((option) => option.questionId === row.id)
          .map((option) => ({
            id: option.id,
            label: option.label,
            content: option.content,
            ...(answered
              ? { isCorrect: option.isCorrect, explanation: option.explanation }
              : {}),
          })),
        explanation: answered ? row.explanation : undefined,
        previousAttempt: answered,
      };
    }),
    total: totalRow[0]?.total ?? 0,
    limit,
  };
}

function buildSourceLabel(row: {
  boardName: string | null;
  year: number | null;
  institution: string | null;
  position: string | null;
}): string {
  return [row.boardName, row.year, row.institution, row.position]
    .filter((part): part is string | number => part !== null && part !== "")
    .join(" · ");
}

/* ========================================================================== *
 * LIMITE DIÁRIO DO PLANO
 * ========================================================================== */

export type DailyLimit = {
  /** `null` = ilimitado (Premium). */
  limit: number | null;
  used: number;
  remaining: number | null;
  reached: boolean;
  planCode: string;
};

export async function getDailyLimit(
  userId: string,
  today?: CivilDate,
): Promise<DailyLimit> {
  const date = today ?? toCivilDate(new Date(), APP_TIMEZONE);

  const subscription = await db.query.subscriptions.findFirst({
    where: (t, { and: a, eq: e }) => a(e(t.userId, userId), e(t.status, "active")),
    columns: { planId: true },
    with: {
      plan: {
        columns: { code: true },
        with: { limits: { columns: { dailyQuestionLimit: true } } },
      },
    },
  });

  const limit = subscription?.plan?.limits?.dailyQuestionLimit ?? 10;
  const planCode = subscription?.plan?.code ?? "free";

  const usage = await db.query.dailyQuestionUsage.findFirst({
    where: (t, { and: a, eq: e }) => a(e(t.userId, userId), e(t.usageDate, date)),
    columns: { questionsAnswered: true },
  });

  const used = usage?.questionsAnswered ?? 0;

  return {
    limit,
    used,
    remaining: limit === null ? null : Math.max(0, limit - used),
    reached: limit !== null && used >= limit,
    planCode,
  };
}

/* ========================================================================== *
 * RESPONDER
 * ========================================================================== */

export type AnswerResult =
  | {
      ok: true;
      isCorrect: boolean;
      correctOptionId: string;
      explanation: string | null;
      optionExplanations: Record<string, string | null>;
      limit: DailyLimit;
    }
  | { ok: false; reason: "limit_reached"; limit: DailyLimit }
  | { ok: false; reason: "not_found" | "already_answered"; limit: DailyLimit };

/**
 * Registra a resposta e devolve o gabarito COM o comentário.
 *
 * A ordem importa e não é acidental:
 *
 *   1. confere o limite do plano ANTES de gravar qualquer coisa;
 *   2. grava a tentativa;
 *   3. incrementa o consumo do dia;
 *   4. só então devolve o gabarito.
 *
 * Se o gabarito saísse antes, bastaria abandonar a requisição no meio para
 * responder ilimitadamente com a resposta na mão.
 */
export async function answerQuestion(input: {
  userId: string;
  questionId: string;
  optionId: string;
  preparationId?: string | null;
  planTopicId?: string | null;
  dailyTaskItemId?: string | null;
  source?: "question_bank" | "daily_task" | "review";
  timeSpentSeconds?: number;
  now?: Date;
}): Promise<AnswerResult> {
  const now = input.now ?? new Date();
  const today = toCivilDate(now, APP_TIMEZONE);

  const limit = await getDailyLimit(input.userId, today);
  if (limit.reached) {
    return { ok: false, reason: "limit_reached", limit };
  }

  const question = await db.query.questions.findFirst({
    where: (t, { and: a, eq: e, isNull: n }) =>
      a(e(t.id, input.questionId), e(t.status, "published"), n(t.deletedAt)),
    columns: { id: true, explanation: true, canonicalTopicId: true },
  });

  if (!question) return { ok: false, reason: "not_found", limit };

  const options = await db
    .select({
      id: questionOptions.id,
      isCorrect: questionOptions.isCorrect,
      explanation: questionOptions.explanation,
    })
    .from(questionOptions)
    .where(eq(questionOptions.questionId, input.questionId));

  const chosen = options.find((option) => option.id === input.optionId);
  const correct = options.find((option) => option.isCorrect);

  if (!chosen || !correct) return { ok: false, reason: "not_found", limit };

  const isCorrect = chosen.isCorrect;

  /**
   * O assunto do PLANO do aluno, para o desempenho voltar ao motor.
   *
   * Sem isto, responder uma questão no banco livre não moveria o
   * `topic_states` daquele assunto e a Tarefa do Dia continuaria priorizando
   * algo que o aluno já dominou. A ligação é feita pelo assunto canônico, que
   * é a ponte que o casamento construiu.
   */
  const planTopicId =
    input.planTopicId ??
    (question.canonicalTopicId && input.preparationId
      ? await findPlanTopic(input.preparationId, question.canonicalTopicId)
      : null);

  // A configuração de XP é lida FORA da transação: ela não muda no meio, e
  // segurar a conexão por uma leitura de configuração é desperdício.
  const xp = await xpEntriesFor("question", isCorrect);

  await db.transaction(async (tx) => {
    await tx
      .insert(questionAttempts)
      .values({
        userId: input.userId,
        questionId: input.questionId,
        preparationId: input.preparationId ?? null,
        planTopicId,
        source: input.source ?? "question_bank",
        dailyTaskItemId: input.dailyTaskItemId ?? null,
        selectedOptionId: input.optionId,
        isCorrect,
        timeSpentSeconds: input.timeSpentSeconds ?? null,
        answeredAt: now,
        answeredDate: today,
        answeredHour: toLocalHour(now, APP_TIMEZONE),
      });

    /**
     * O desempenho volta para os motores.
     *
     * É o item 9 do checklist de aceite: "o Cronograma Adaptativo muda quando o
     * aluno estuda ou responde questões". Sem esta chamada, responder gravaria
     * histórico e mais nada — a Tarefa do Dia continuaria priorizando um
     * assunto já dominado, e o produto pareceria não escutar.
     */
    if (planTopicId) {
      await applyAttemptToTopicState(tx, {
        planTopicId,
        isCorrect,
        answeredAt: now,
      });
    }

    const earned = await awardXp(tx, {
      userId: input.userId,
      entries: xp.entries,
      // A chave é a QUESTÃO, não a tentativa: com o id da tentativa, cada nova
      // resposta traria um id novo e responder dez vezes pagaria dez vezes.
      // Ver a nota em `awardXp`.
      sourceType: "question",
      sourceId: input.questionId,
      engineConfigId: xp.engineConfigId,
      occurredAt: now,
      occurredDate: today,
    });

    await markActivity(tx, {
      userId: input.userId,
      date: today,
      kind: "questions",
      xpEarned: earned,
      now,
    });

    if (input.dailyTaskItemId) {
      await advanceTaskItem(tx, input.dailyTaskItemId, now);
    }

    /**
     * Consumo do dia. O `ON CONFLICT` é o que torna a checagem do limite um
     * SELECT por chave única em vez de um COUNT sobre o histórico inteiro.
     *
     * `limit_reached_at` responde à métrica de monetização "quantos atingem o
     * limite do Free" — o instante de maior intenção de upgrade do produto.
     */
    const reachedNow = limit.limit !== null && limit.used + 1 >= limit.limit;

    await tx
      .insert(dailyQuestionUsage)
      .values({
        userId: input.userId,
        usageDate: today,
        questionsAnswered: 1,
        limitAtTime: limit.limit,
        limitReachedAt: reachedNow ? now : null,
      })
      .onConflictDoUpdate({
        target: [dailyQuestionUsage.userId, dailyQuestionUsage.usageDate],
        set: {
          questionsAnswered: sql`${dailyQuestionUsage.questionsAnswered} + 1`,
          limitReachedAt: reachedNow
            // ⚠️ `${now}` cru num fragmento SQL vira `Date.toString()`, que o
            // Postgres recusa: o mapeador da coluna não se aplica dentro de
            // `sql`. O ISO com cast explícito é o que funciona.
            ? sql`coalesce(${dailyQuestionUsage.limitReachedAt}, ${now.toISOString()}::timestamptz)`
            : dailyQuestionUsage.limitReachedAt,
          updatedAt: now,
        },
      });

    await tx
      .update(questions)
      .set({
        attemptCount: sql`${questions.attemptCount} + 1`,
        correctCount: isCorrect
          ? sql`${questions.correctCount} + 1`
          : questions.correctCount,
      })
      .where(eq(questions.id, input.questionId));
  });

  return {
    ok: true,
    isCorrect,
    correctOptionId: correct.id,
    explanation: question.explanation,
    optionExplanations: Object.fromEntries(
      options.map((option) => [option.id, option.explanation]),
    ),
    limit: await getDailyLimit(input.userId, today),
  };
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Avança o item "Pratique" da Tarefa do Dia.
 *
 * A meta de questões existe para dimensionar o dia e definir quando o item está
 * cumprido — ela NÃO é exibida ao aluno (decisão da cliente). No plano Free o
 * teto é de 10 questões por dia; anunciar "responda 15" seria prometer o que o
 * plano não entrega.
 *
 * O item também fecha quando o aluno bate no limite do plano, com
 * `closed_by_plan_limit`. Isso existe para o produto NÃO mostrar tarefa
 * incompleta a quem estudou tudo que o plano permitia — é o gancho natural de
 * upgrade, não uma pendência vermelha na tela.
 */
async function advanceTaskItem(
  tx: Transaction,
  itemId: string,
  now: Date,
): Promise<void> {
  const [item] = await tx
    .select({
      id: dailyTaskItems.id,
      dailyTaskId: dailyTaskItems.dailyTaskId,
      status: dailyTaskItems.status,
      answered: dailyTaskItems.answeredQuestionCount,
      target: dailyTaskItems.targetQuestionCount,
    })
    .from(dailyTaskItems)
    .where(eq(dailyTaskItems.id, itemId))
    .limit(1);

  if (!item || item.status === "completed") return;

  const answered = item.answered + 1;
  const completed = item.target !== null && answered >= item.target;

  await tx
    .update(dailyTaskItems)
    .set({
      answeredQuestionCount: answered,
      status: completed ? "completed" : "in_progress",
      startedAt: sql`coalesce(${dailyTaskItems.startedAt}, ${now.toISOString()}::timestamptz)`,
      completedAt: completed ? now : null,
      updatedAt: now,
    })
    .where(eq(dailyTaskItems.id, itemId));

  if (completed) await recountTask(tx, item.dailyTaskId, now);
}

async function findPlanTopic(
  preparationId: string,
  canonicalTopicId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: studyPlanTopics.id })
    .from(studyPlanTopics)
    .where(
      and(
        eq(studyPlanTopics.preparationId, preparationId),
        eq(studyPlanTopics.canonicalTopicId, canonicalTopicId),
        eq(studyPlanTopics.isActive, true),
        isNull(studyPlanTopics.deletedAt),
      ),
    )
    .limit(1);

  return row?.id ?? null;
}
