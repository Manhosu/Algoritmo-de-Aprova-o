import "server-only";

import { and, count, desc, eq, sql } from "drizzle-orm";

import { APP_TIMEZONE } from "@/config/app";
import {
  xpForQuestion,
  xpForReview,
  xpForStudy,
  sumXp,
  type LevelProgress,
} from "@/modules/gamification";
import {
  buildEvolutionSeries,
  findBestTechnique,
  type BestTechnique,
  type EvolutionPoint,
} from "@/modules/metrics";
import { addDays, toCivilDate, type CivilDate } from "@/modules/shared/dates";
import { db } from "@/server/db";
import {
  dailyTaskItems,
  dailyTasks,
  dailyUserRollups,
  questionAttempts,
  reviewOccurrences,
  streakDays,
  studyPlanSubjects,
  studyPlanTopics,
  topicStates,
  userGamificationStates,
  xpLedger,
} from "@/server/db/schema";
import { getActiveConfig } from "@/server/engine/config";
import {
  ensureDailyTask,
  getDailyMissions,
  type DailyMissions,
} from "@/server/engine/daily-task";
import { getLevel } from "@/server/engine/progress";
import { getReviewsToday, type DueReviewView } from "@/server/engine/review";

/**
 * O QUE A HOME PRECISA SABER.
 * ============================================================================
 *
 * Uma função, uma tela. Reunir as leituras aqui — em vez de espalhá-las pelos
 * componentes — mantém a Home com um número previsível de consultas e deixa
 * óbvio, num lugar só, o que custa carregar aquela tela.
 *
 * A geração da Tarefa do Dia acontece AQUI, na leitura, e não num job noturno.
 * Duas razões:
 *
 *   1. Um job precisaria saber a virada do dia de cada aluno no fuso dele, e
 *      rodar para quem talvez nem abra o app naquele dia.
 *   2. Gerando na primeira visita, a tarefa reflete o estado mais recente —
 *      inclusive o estudo feito ontem à noite, depois de o job ter rodado.
 *
 * `ensureDailyTask` é idempotente por dia (índice único), então recarregar a
 * página não gera tarefa nova.
 */

export type HomeStats = {
  totalXp: number;
  xpToday: number;
  questionsAnswered: number;
  questionsCorrect: number;
  reviewsPending: number;
  reviewsCompleted: number;
  reviewsCompletedToday: number;
  studyMinutesTotal: number;
  studyMinutesToday: number;
  coinBalance: number;
  currentStreak: number;
  longestStreak: number;
};

/** Um dia da faixa "S T Q Q S S D" do card de sequência. */
export type StreakDay = {
  date: CivilDate;
  /** Inicial do dia da semana, como no mockup. */
  initial: string;
  hadActivity: boolean;
  isToday: boolean;
};

export type SubjectPerformance = {
  name: string;
  accuracyPercent: number;
  answered: number;
};

export type HomeData = {
  today: CivilDate;
  missions: DailyMissions | null;
  /** Por que não há missões, quando não há. */
  missionsSkippedReason: "no_availability" | "no_topics" | "not_active" | null;
  stats: HomeStats;
  level: LevelProgress;
  /** Últimos 7 dias, do mais antigo ao mais recente. */
  streakWeek: StreakDay[];
  /** Desempenho por disciplina, do melhor para o pior. */
  subjects: SubjectPerformance[];
  /**
   * Índice de Preparação.
   *
   * ⚠️ NUNCA "Índice de Aprovação", apesar do mockup. Ver a nota em
   * `computePreparationIndex`: nenhum rótulo pode sugerir probabilidade de
   * passar, porque é promessa que não temos como cumprir.
   *
   * `null` enquanto não há métrica calculada — um índice inventado no primeiro
   * dia seria pior que card vazio.
   */
  preparationIndex: { value: number; label: string } | null;
  /** As revisões que vencem hoje ou já venceram. */
  reviewsToday: DueReviewView[];
  /** Série do gráfico de evolução. */
  evolution: EvolutionPoint[];
  bestTechnique: BestTechnique;
  /** XP por atividade, vindo da configuração versionada — nunca de constante. */
  xp: { study: number; questionCorrect: number; review: number; dailyGoal: number };
};

export async function getHomeData(input: {
  userId: string;
  preparationId: string;
  now?: Date;
}): Promise<HomeData> {
  const now = input.now ?? new Date();
  const today = toCivilDate(now, APP_TIMEZONE);

  const generated = await ensureDailyTask({
    userId: input.userId,
    preparationId: input.preparationId,
    now,
  });

  /*
   * ⚠️ DUAS LEVAS, NÃO UMA SÓ COM DOZE PROMESSAS.
   *
   * O pooler de sessão aguenta oito consultas simultâneas (ver a medição em
   * server/db/index.ts), e o painel do mockup precisa de mais que isso. Duas
   * levas de tamanho controlado custam um ida-e-volta a mais e removem o risco
   * de a Home ser exatamente a tela que estoura o limite.
   */
  const [missions, stats, xpConfig, reviews, subjects] = await Promise.all([
    generated.status === "skipped"
      ? Promise.resolve(null)
      : getDailyMissions(input.preparationId, today),
    loadStats(input.userId, today),
    getActiveConfig("xp_values"),
    getReviewsToday({ userId: input.userId, preparationId: input.preparationId }),
    loadSubjectPerformance(input.preparationId),
  ]);

  const [level, streakWeek, preparationIndex, evolution, bestTechnique] = await Promise.all([
    getLevel(stats.totalXp),
    loadStreakWeek(input.userId, today),
    loadPreparationIndex(input.preparationId),
    loadEvolution(input.userId),
    loadBestTechnique(input.preparationId),
  ]);

  return {
    today,
    missions,
    missionsSkippedReason: generated.status === "skipped" ? generated.reason : null,
    stats,
    level,
    streakWeek,
    subjects,
    preparationIndex,
    reviewsToday: reviews.due,
    evolution,
    bestTechnique,
    xp: {
      // `xpForStudy` e companhia devolvem LANÇAMENTOS, não números: um acerto
      // rende dois (a resposta e o bônus). Somar aqui é o que garante que a
      // tela mostre o mesmo valor que o livro-razão vai creditar.
      study: sumXp(xpForStudy(xpConfig.value)),
      questionCorrect: sumXp(xpForQuestion(true, xpConfig.value)),
      review: sumXp(xpForReview(xpConfig.value)),
      dailyGoal: xpConfig.value.dailyGoalCompleted,
    },
  };
}

async function loadStats(userId: string, today: CivilDate): Promise<HomeStats> {
  const [state, xpToday, answered, reviews, totals, todayRollup] = await Promise.all([
    db.query.userGamificationStates.findFirst({
      where: (t, { eq: e }) => e(t.userId, userId),
      columns: {
        totalXp: true,
        currentStreak: true,
        longestStreak: true,
        coinBalance: true,
      },
    }),

    db
      .select({ total: sql<number>`coalesce(sum(${xpLedger.amount}), 0)::int` })
      .from(xpLedger)
      .where(and(eq(xpLedger.userId, userId), eq(xpLedger.occurredDate, today))),

    /*
     * ⚠️ RESPONDIDAS E ACERTOS SAEM DA MESMA FONTE.
     *
     * Antes o total vinha de `question_attempts` e os acertos dos rollups
     * diários. Como o rollup é calculado por job e a tentativa é gravada na
     * hora, o painel exibia "0 questões resolvidas" ao lado de "91% de acerto
     * em Direito Constitucional" — dois cards se contradizendo na mesma tela.
     *
     * `question_attempts` é o evento bruto que alimenta todo o resto, então é
     * ele quem responde às duas perguntas.
     */
    db
      .select({
        total: count(),
        correct: sql<number>`count(*) filter (where ${questionAttempts.isCorrect})::int`,
      })
      .from(questionAttempts)
      .where(eq(questionAttempts.userId, userId)),

    db
      .select({ total: count() })
      .from(reviewOccurrences)
      .where(
        and(
          eq(reviewOccurrences.userId, userId),
          eq(reviewOccurrences.status, "scheduled"),
          // Vencidas e vencendo hoje: para o aluno, atrasada continua sendo
          // "pendente". Separar as duas contagens na Home só geraria a
          // pergunta "por que tenho dois números de revisão?".
          sql`${reviewOccurrences.dueDate} <= ${today}`,
        ),
      ),

    /*
     * Os acumulados vêm dos ROLLUPS diários, não de varredura nas tabelas de
     * origem. Somar `question_attempts` e `study_logs` inteiros a cada abertura
     * da Home cresceria com o histórico do aluno — e a Home é a tela mais
     * aberta do produto.
     */
    db
      .select({
        minutes: sql<number>`coalesce(sum(${dailyUserRollups.studyMinutes}), 0)::int`,
        reviews: sql<number>`coalesce(sum(${dailyUserRollups.reviewsCompleted}), 0)::int`,
      })
      .from(dailyUserRollups)
      .where(eq(dailyUserRollups.userId, userId)),

    db.query.dailyUserRollups.findFirst({
      where: (t, { and: e, eq: is }) => e(is(t.userId, userId), is(t.rollupDate, today)),
      columns: { studyMinutes: true, reviewsCompleted: true },
    }),
  ]);

  return {
    totalXp: state?.totalXp ?? 0,
    xpToday: xpToday[0]?.total ?? 0,
    questionsAnswered: answered[0]?.total ?? 0,
    questionsCorrect: answered[0]?.correct ?? 0,
    reviewsPending: reviews[0]?.total ?? 0,
    reviewsCompleted: totals[0]?.reviews ?? 0,
    reviewsCompletedToday: todayRollup?.reviewsCompleted ?? 0,
    studyMinutesTotal: totals[0]?.minutes ?? 0,
    studyMinutesToday: todayRollup?.studyMinutes ?? 0,
    coinBalance: state?.coinBalance ?? 0,
    currentStreak: state?.currentStreak ?? 0,
    longestStreak: state?.longestStreak ?? 0,
  };
}

/* ========================================================================== *
 * OS CARDS NOVOS DO PAINEL
 * ========================================================================== */

/** Iniciais como no mockup: domingo a sábado. */
const WEEKDAY_INITIALS = ["D", "S", "T", "Q", "Q", "S", "S"];

/**
 * Os sete pontos do card "Sequência Atual".
 *
 * Lê `streak_days`, que existe justamente para isto: o contador de sequência
 * sozinho diz "12 dias", mas não diz QUAIS dias — e a faixa do mockup precisa
 * marcar cada um.
 */
async function loadStreakWeek(userId: string, today: CivilDate): Promise<StreakDay[]> {
  const first = addDays(today, -6);

  const rows = await db
    .select({ date: streakDays.activityDate })
    .from(streakDays)
    .where(
      and(
        eq(streakDays.userId, userId),
        sql`${streakDays.activityDate} between ${first} and ${today}`,
      ),
    );

  const comAtividade = new Set(rows.map((row) => row.date as CivilDate));

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(first, index);
    return {
      date,
      // `T00:00:00` força leitura como data local: sem isso "2026-08-26" vira
      // meia-noite UTC e, a oeste de Greenwich, o dia da semana sai errado.
      initial: WEEKDAY_INITIALS[new Date(`${date}T00:00:00`).getDay()],
      hadActivity: comAtividade.has(date),
      isToday: date === today,
    };
  });
}

/**
 * Desempenho por disciplina.
 *
 * Agrega `topic_states` por disciplina do plano. Disciplina sem nenhuma questão
 * respondida fica DE FORA: uma barra em 0% não significa "vai mal", significa
 * "ainda não começou", e as duas coisas na mesma lista fazem o aluno achar que
 * está reprovando em algo que nunca abriu.
 */
async function loadSubjectPerformance(preparationId: string): Promise<SubjectPerformance[]> {
  const rows = await db
    .select({
      name: studyPlanSubjects.displayName,
      answered: sql<number>`coalesce(sum(${topicStates.questionsAnswered}), 0)::int`,
      correct: sql<number>`coalesce(sum(${topicStates.questionsCorrect}), 0)::int`,
    })
    .from(studyPlanSubjects)
    .leftJoin(studyPlanTopics, eq(studyPlanTopics.planSubjectId, studyPlanSubjects.id))
    .leftJoin(topicStates, eq(topicStates.planTopicId, studyPlanTopics.id))
    .where(
      and(
        eq(studyPlanSubjects.preparationId, preparationId),
        eq(studyPlanSubjects.isActive, true),
      ),
    )
    .groupBy(studyPlanSubjects.id, studyPlanSubjects.displayName);

  return rows
    .filter((row) => row.answered > 0)
    .map((row) => ({
      name: row.name,
      answered: row.answered,
      accuracyPercent: Math.round((row.correct / row.answered) * 100),
    }))
    .sort((a, b) => b.accuracyPercent - a.accuracyPercent);
}

/**
 * O Índice de Preparação já calculado.
 *
 * Lê a última linha de `preparation_metrics` em vez de recalcular: o índice é
 * versionado pela configuração do motor que o produziu (`engineConfigId`), e
 * recalcular na leitura mostraria um número que ninguém registrou.
 */
async function loadPreparationIndex(
  preparationId: string,
): Promise<{ value: number; label: string } | null> {
  const [row, config] = await Promise.all([
    db.query.preparationMetrics.findFirst({
      where: (t, { eq: is }) => is(t.preparationId, preparationId),
      orderBy: (t, { desc }) => desc(t.metricDate),
      columns: { preparationIndex: true },
    }),
    getActiveConfig("preparation_index"),
  ]);

  if (row?.preparationIndex == null) return null;

  const value = Math.round(row.preparationIndex);
  const band = config.value.bands.find((b) => value >= b.min && value <= b.max);

  return { value, label: band?.label ?? config.value.bands[0].label };
}

/** A série do gráfico "Evolução": os últimos 30 dias com questões respondidas. */
async function loadEvolution(userId: string): Promise<EvolutionPoint[]> {
  const rows = await db
    .select({
      date: dailyUserRollups.rollupDate,
      questionsAnswered: dailyUserRollups.questionsAnswered,
      questionsCorrect: dailyUserRollups.questionsCorrect,
    })
    .from(dailyUserRollups)
    .where(eq(dailyUserRollups.userId, userId))
    .orderBy(desc(dailyUserRollups.rollupDate))
    .limit(30);

  return buildEvolutionSeries(
    rows
      .map((row) => ({
        rollupDate: row.date as CivilDate,
        questionsAnswered: row.questionsAnswered,
        questionsCorrect: row.questionsCorrect,
      }))
      .reverse(),
  );
}

/**
 * A melhor técnica de estudo.
 *
 * O dado só existe porque a técnica é PRESCRITA pelo sistema — ver a nota em
 * `findBestTechnique`. `minAttempts` vem da configuração, não daqui.
 */
async function loadBestTechnique(preparationId: string): Promise<BestTechnique> {
  const [rows, config] = await Promise.all([
    db
      .select({
        technique: dailyTaskItems.technique,
        attempts: sql<number>`count(${questionAttempts.id})::int`,
        correct: sql<number>`count(*) filter (where ${questionAttempts.isCorrect})::int`,
      })
      .from(dailyTaskItems)
      .innerJoin(dailyTasks, eq(dailyTasks.id, dailyTaskItems.dailyTaskId))
      .innerJoin(
        questionAttempts,
        and(
          eq(questionAttempts.planTopicId, dailyTaskItems.planTopicId),
          // Só o que veio DEPOIS do estudo, no mesmo dia: é essa janela que
          // torna a comparação entre técnicas honesta.
          sql`${questionAttempts.answeredAt}::date = ${dailyTasks.taskDate}`,
        ),
      )
      .where(
        and(
          eq(dailyTasks.preparationId, preparationId),
          sql`${dailyTaskItems.technique} is not null`,
        ),
      )
      .groupBy(dailyTaskItems.technique),
    getActiveConfig("study_techniques"),
  ]);

  return findBestTechnique(
    rows.map((row) => ({
      technique: row.technique as string,
      attempts: row.attempts,
      correct: row.correct,
    })),
    config.value.minAttemptsForTechniqueStats,
  );
}

/** Garante a linha de gamificação do aluno. Chamada na primeira visita à Home. */
export async function ensureGamificationState(userId: string): Promise<void> {
  await db.insert(userGamificationStates).values({ userId }).onConflictDoNothing();
}
