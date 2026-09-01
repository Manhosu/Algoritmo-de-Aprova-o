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
  dailyTasks,
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
import { recordFunnelActivity } from "@/server/analytics/funnel-activity";
import { markFunnelStage } from "@/server/preparations/service";

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
   * "Esconder questões resolvidas."
   *
   * ⚠️ MUDOU EM 31/08/2026, A PEDIDO DA CLIENTE. Antes escondia só os ACERTOS,
   * com o raciocínio de que a questão errada precisa voltar para o aluno rever
   * onde falhou.
   *
   * Ela preferiu esconder TODAS as respondidas: quem abre o banco quer avançar
   * no acervo, e reencontrar a mesma questão errada no meio da lista atrapalha
   * mais do que ajuda. O erro continua acessível — basta desmarcar o filtro, e
   * a revisão espaçada devolve o assunto pelo caminho próprio dela.
   */
  if (input.filters.onlyUnanswered) {
    conditions.push(
      sql`not exists (
        select 1 from ${questionAttempts}
        where ${questionAttempts.questionId} = ${questions.id}
          and ${questionAttempts.userId} = ${input.userId}
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

/** Teto do Free, para quem não tem assinatura ativa. Padrão conservador. */
const FREE_DAILY_QUESTIONS = 10;

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

  /**
   * ⚠️ `NULL` NA COLUNA SIGNIFICA ILIMITADO — não "ausente".
   *
   * `?? 10` parecia certo e limitava o PREMIUM a 10 questões por dia: no
   * Premium a coluna é NULL de propósito, para dizer "sem teto", e o `??` não
   * distingue isso de "não existe linha de limites". Ver a mesma nota em
   * `checkPreparationLimit`, onde o erro gêmeo dizia a um aluno Premium que ele
   * podia ter uma preparação só.
   */
  const limits = subscription?.plan?.limits;
  const limit = limits ? limits.dailyQuestionLimit : FREE_DAILY_QUESTIONS;
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

  /*
   * ⚠️ AS QUATRO LEITURAS VÃO JUNTAS (pedido da cliente em 27/08/2026).
   *
   * Elas eram sequenciais: limite, questão, alternativas e configuração de XP,
   * uma esperando a anterior. Nenhuma depende do resultado da outra, e cada
   * ida ao banco custa uma volta de rede — quatro em fila é o que a cliente
   * sentiu como "demora um pouco para computar a resposta".
   *
   * Em paralelo, o custo passa a ser o da mais lenta, não a soma. São quatro
   * consultas simultâneas, bem abaixo do teto do pooler de sessão (ver a
   * medição em server/db/index.ts).
   *
   * A configuração de XP entra aqui, fora da transação: ela não muda no meio
   * da resposta, e segurar a conexão por uma leitura de configuração é
   * desperdício.
   *
   * `findPlanTopic` fica DE FORA porque depende do `canonicalTopicId` da
   * questão — só dá para buscá-lo depois de saber qual é o assunto dela.
   */
  const [limit, question, options] = await Promise.all([
    getDailyLimit(input.userId, today),

    db.query.questions.findFirst({
      where: (t, { and: a, eq: e, isNull: n }) =>
        a(e(t.id, input.questionId), e(t.status, "published"), n(t.deletedAt)),
      columns: { id: true, explanation: true, canonicalTopicId: true },
    }),

    db
      .select({
        id: questionOptions.id,
        isCorrect: questionOptions.isCorrect,
        explanation: questionOptions.explanation,
      })
      .from(questionOptions)
      .where(eq(questionOptions.questionId, input.questionId)),
  ]);

  if (limit.reached) {
    return { ok: false, reason: "limit_reached", limit };
  }

  if (!question) return { ok: false, reason: "not_found", limit };

  const chosen = options.find((option) => option.id === input.optionId);
  const correct = options.find((option) => option.isCorrect);

  if (!chosen || !correct) return { ok: false, reason: "not_found", limit };

  const isCorrect = chosen.isCorrect;

  /**
   * Esta resposta é a que fecha a cota do dia?
   *
   * Calculado uma vez, aqui, porque serve a DOIS lugares: `limit_reached_at` na
   * transação e o marco de monetização no funil, depois dela. Duas cópias da
   * mesma aritmética divergiriam no primeiro ajuste de regra de plano.
   */
  const reachedLimit = limit.limit !== null && limit.used + 1 >= limit.limit;

  /**
   * O assunto do PLANO do aluno, para o desempenho voltar ao motor.
   *
   * Sem isto, responder uma questão no banco livre não moveria o
   * `topic_states` daquele assunto e a Tarefa do Dia continuaria priorizando
   * algo que o aluno já dominou. A ligação é feita pelo assunto canônico, que
   * é a ponte que o casamento construiu.
   */
  const [planTopicId, xp] = await Promise.all([
    input.planTopicId ??
      (question.canonicalTopicId && input.preparationId
        ? findPlanTopic(input.preparationId, question.canonicalTopicId)
        : Promise.resolve(null)),
    xpEntriesFor("question", isCorrect),
  ]);

  /** Preenchido dentro da transação, lido depois dela para o funil. */
  let tarefaConcluida = false;

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
      const avanco = await advanceTaskItem(tx, input.dailyTaskItemId, input.userId, now);
      tarefaConcluida = avanco.taskJustCompleted;
    }

    /**
     * Consumo do dia. O `ON CONFLICT` é o que torna a checagem do limite um
     * SELECT por chave única em vez de um COUNT sobre o histórico inteiro.
     *
     * `limit_reached_at` responde à métrica de monetização "quantos atingem o
     * limite do Free" — o instante de maior intenção de upgrade do produto.
     */
    await tx
      .insert(dailyQuestionUsage)
      .values({
        userId: input.userId,
        usageDate: today,
        questionsAnswered: 1,
        limitAtTime: limit.limit,
        limitReachedAt: reachedLimit ? now : null,
      })
      .onConflictDoUpdate({
        target: [dailyQuestionUsage.userId, dailyQuestionUsage.usageDate],
        set: {
          questionsAnswered: sql`${dailyQuestionUsage.questionsAnswered} + 1`,
          limitReachedAt: reachedLimit
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

  /**
   * O FUNIL, DEPOIS da transação e sem segurá-la.
   *
   * ⚠️ Fora do `tx` de propósito: são duas escritas numa tabela de métrica, e
   * uma falha ali não pode desfazer a resposta do aluno. Métrica perdida é
   * chateação; resposta perdida é o aluno respondendo de novo a mesma questão.
   *
   * `Promise.all` porque uma não depende da outra, e `catch` porque o
   * `answerQuestion` já tem tudo que importa em mãos — deixar o erro subir daqui
   * transformaria uma falha de telemetria em erro de tela.
   */
  await Promise.all([
    markFunnelStage(input.userId, "first_question_answered", now),
    recordFunnelActivity({
      userId: input.userId,
      now,
      completedTask: tarefaConcluida,
      reachedFreeLimit: reachedLimit,
    }),
  ]).catch(() => {
    /* telemetria não derruba a resposta */
  });

  return {
    ok: true,
    isCorrect,
    correctOptionId: correct.id,
    explanation: question.explanation,
    optionExplanations: Object.fromEntries(
      options.map((option) => [option.id, option.explanation]),
    ),
    /*
     * O consumo DEPOIS desta resposta, calculado — não relido do banco.
     *
     * Era `await getDailyLimit(...)` aqui, e `getDailyLimit` são DUAS consultas
     * em série (assinatura e depois consumo). Isso custava duas voltas de rede
     * para reconstruir um número que já está em mãos: o limite não muda no meio
     * de uma resposta, e a transação acabou de somar exatamente 1 ao consumo.
     *
     * É a mesma aritmética que já governa a gravação de `limit_reached_at`
     * logo acima (`limit.used + 1 >= limit.limit`), então derivar aqui não
     * inventa regra nova — usa a que já está escrita.
     *
     * ⚠️ Duas respostas simultâneas do mesmo aluno leem `used` igual e cada uma
     * relata `used + 1`. O CONTADOR NO BANCO continua certo, porque lá a soma é
     * `questions_answered + 1` no próprio SQL; o que pode ficar um passo atrás
     * é só o número exibido, até o próximo carregamento. Reler não resolveria
     * isso de verdade — resolveria por acaso, e ao preço de duas voltas em toda
     * resposta.
     */
    limit: {
      limit: limit.limit,
      used: limit.used + 1,
      remaining: limit.limit === null ? null : Math.max(0, limit.limit - (limit.used + 1)),
      reached: limit.limit !== null && limit.used + 1 >= limit.limit,
      planCode: limit.planCode,
    },
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
  userId: string,
  now: Date,
): Promise<{ taskJustCompleted: boolean }> {
  /**
   * ⚠️ O `userId` NO WHERE NÃO É ZELO EXTRA — é o que fecha o buraco.
   *
   * O id do item chega pela URL (`/questoes?tarefa=…`), que é o que faz a
   * linha "Pratique" da Tarefa do Dia se riscar quando o aluno responde. Sem
   * amarrar ao dono, qualquer pessoa logada poderia colar o id de outra e
   * fechar a tarefa dela — e ganhar o XP na conta errada.
   *
   * Durante um tempo isso não era alcançável, porque nada passava o id adiante.
   * Passou a ser no momento em que a URL começou a carregá-lo.
   */
  const [item] = await tx
    .select({
      id: dailyTaskItems.id,
      dailyTaskId: dailyTaskItems.dailyTaskId,
      status: dailyTaskItems.status,
      answered: dailyTaskItems.answeredQuestionCount,
      target: dailyTaskItems.targetQuestionCount,
    })
    .from(dailyTaskItems)
    .innerJoin(dailyTasks, eq(dailyTasks.id, dailyTaskItems.dailyTaskId))
    .where(and(eq(dailyTaskItems.id, itemId), eq(dailyTasks.userId, userId)))
    .limit(1);

  if (!item || item.status === "completed") return { taskJustCompleted: false };

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

  if (!completed) return { taskJustCompleted: false };

  const { justCompleted } = await recountTask(tx, item.dailyTaskId, now);
  return { taskJustCompleted: justCompleted };
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
