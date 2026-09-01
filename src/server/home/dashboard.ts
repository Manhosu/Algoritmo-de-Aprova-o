import "server-only";

import { and, count, desc, eq, isNull, lte, ne, sql } from "drizzle-orm";

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
  computeCoverage,
  computeGoldenHour,
  computePreparationIndex,
  findBestTechnique,
  findGaps,
  type BestTechnique,
  type Coverage,
  type EvolutionPoint,
  type Gap,
  type GoldenHour,
} from "@/modules/metrics";
import { addDays, toCivilDate, type CivilDate } from "@/modules/shared/dates";
import { db } from "@/server/db";
import {
  dailyTaskItems,
  dailyTasks,
  questionAttempts,
  studyLogs,
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
  /** Dia da semana que ainda não chegou. Nem estudou, nem deixou de estudar. */
  isFuture: boolean;
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
  /** Respostas de disciplinas que não estão no edital do aluno. */
  answersOutOfPlan: number;
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
  /** Faixa de horário em que o aluno mais acerta. */
  goldenHour: GoldenHour;
  /** Quanto do edital já foi coberto. */
  coverage: Coverage;
  /** Assuntos em que ele mais erra. */
  gaps: Gap[];
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
  const [missions, stats, xpConfig, reviews, subjects, answersOutOfPlan] = await Promise.all([
    generated.status === "skipped"
      ? Promise.resolve(null)
      : getDailyMissions(input.preparationId, today),
    loadStats(input.userId, today),
    getActiveConfig("xp_values"),
    getReviewsToday({ userId: input.userId, preparationId: input.preparationId }),
    loadSubjectPerformance(input.preparationId),
    countOutOfPlanAnswers(input.userId),
  ]);

  const [level, streakWeek, preparationIndex, evolution, bestTechnique, insights] =
    await Promise.all([
      getLevel(stats.totalXp),
      loadStreakWeek(input.userId, today),
      loadPreparationIndex(input.preparationId),
      loadEvolution(input.userId),
      loadBestTechnique(input.preparationId),
      loadInsights(input.userId, input.preparationId),
    ]);

  return {
    today,
    missions,
    missionsSkippedReason: generated.status === "skipped" ? generated.reason : null,
    stats,
    level,
    streakWeek,
    subjects,
    answersOutOfPlan,
    preparationIndex,
    reviewsToday: reviews.due,
    evolution,
    bestTechnique,
    goldenHour: insights.goldenHour,
    coverage: insights.coverage,
    gaps: insights.gaps,
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
  const [state, xpToday, answered, reviews, totals, reviewsDone] = await Promise.all([
    db.query.userGamificationStates.findFirst({
      where: (t, { eq: e }) => e(t.userId, userId),
      columns: {
        totalXp: true,
        currentStreak: true,
        longestStreak: true,
        coinBalance: true,
        lastActivityDate: true,
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
     * ⚠️ LÊ `study_logs`, NÃO O ROLLUP DIÁRIO.
     *
     * A versão anterior somava `daily_user_rollups`, que um job noturno
     * deveria preencher. Esse job não existe: em produção a tabela fica vazia
     * para sempre, e "Horas estudadas" mostrava 0min por mais que o aluno
     * concluísse tarefas. A cliente marcou as quatro tarefas do dia e viu zero.
     *
     * Somar os registros de estudo custa mais que ler um rollup, e é o preço
     * de mostrar um número verdadeiro. Se um dia o volume incomodar, o caminho
     * é criar o job — não voltar a ler uma tabela que ninguém escreve.
     */
    db
      .select({
        minutes: sql<number>`coalesce(sum(${studyLogs.minutesSpent}), 0)::int`,
        minutesToday: sql<number>`coalesce(sum(${studyLogs.minutesSpent}) filter (where ${studyLogs.completedDate} = ${today}), 0)::int`,
      })
      .from(studyLogs)
      .where(eq(studyLogs.userId, userId)),

    db
      .select({
        total: count(),
        today: sql<number>`count(*) filter (where ${reviewOccurrences.completedDate} = ${today})::int`,
      })
      .from(reviewOccurrences)
      .where(
        and(eq(reviewOccurrences.userId, userId), eq(reviewOccurrences.status, "completed")),
      ),
  ]);

  return {
    totalXp: state?.totalXp ?? 0,
    xpToday: xpToday[0]?.total ?? 0,
    questionsAnswered: answered[0]?.total ?? 0,
    questionsCorrect: answered[0]?.correct ?? 0,
    reviewsPending: reviews[0]?.total ?? 0,
    reviewsCompleted: reviewsDone[0]?.total ?? 0,
    reviewsCompletedToday: reviewsDone[0]?.today ?? 0,
    studyMinutesTotal: totals[0]?.minutes ?? 0,
    studyMinutesToday: totals[0]?.minutesToday ?? 0,
    coinBalance: state?.coinBalance ?? 0,
    /*
     * ⚠️ A SEQUÊNCIA GRAVADA PODE ESTAR VENCIDA.
     *
     * `current_streak` só é recalculado quando o aluno FAZ alguma coisa
     * (`markActivity`). Quem estudou trinta dias, sumiu por três e abriu o app
     * continuava lendo "30 dias" — o número mais motivador da tela, mentindo.
     *
     * A conta aqui é a leitura honesta: a sequência vale enquanto a última
     * atividade for hoje ou ontem. Hoje ainda não conta como quebra, porque o
     * dia não acabou; anteontem, sim.
     */
    currentStreak: streakAindaVale(state?.lastActivityDate ?? null, today)
      ? (state?.currentStreak ?? 0)
      : 0,
    longestStreak: state?.longestStreak ?? 0,
  };
}

/**
 * A sequência gravada ainda vale hoje?
 *
 * Vale se a última atividade foi hoje (o dia está em curso) ou ontem (a
 * sequência continua viva até a virada). Qualquer coisa mais antiga já quebrou,
 * e o banco ainda não sabe porque ninguém tocou no registro desde então.
 */
function streakAindaVale(lastActivity: string | null, today: CivilDate): boolean {
  if (!lastActivity) return false;
  return lastActivity === today || lastActivity === addDays(today, -1);
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
  /*
   * ⚠️ A SEMANA COMEÇA NO DOMINGO (pedido da cliente em 27/08/2026).
   *
   * Antes eram os últimos 7 dias corridos, então a faixa começava num dia
   * diferente a cada abertura: numa sexta ela lia "S T Q Q S S D", e no dia
   * seguinte já era outra ordem. Quem olha rápido não consegue comparar o
   * "hoje" de ontem com o de agora.
   *
   * Com semana civil, a régua é sempre a mesma: D S T Q Q S S. Os dias que
   * ainda não chegaram aparecem apagados, e é assim que o aluno vê quanto
   * ainda tem de semana pela frente.
   *
   * `T00:00:00` força leitura como data local: sem isso "2026-08-26" vira
   * meia-noite UTC e, a oeste de Greenwich, o dia da semana sai errado.
   */
  const weekdayOfToday = new Date(`${today}T00:00:00`).getDay();
  const sunday = addDays(today, -weekdayOfToday);
  const saturday = addDays(sunday, 6);

  const rows = await db
    .select({ date: streakDays.activityDate })
    .from(streakDays)
    .where(
      and(
        eq(streakDays.userId, userId),
        sql`${streakDays.activityDate} between ${sunday} and ${saturday}`,
      ),
    );

  const comAtividade = new Set(rows.map((row) => row.date as CivilDate));

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(sunday, index);
    return {
      date,
      initial: WEEKDAY_INITIALS[index],
      hadActivity: comAtividade.has(date),
      isToday: date === today,
      // Dia que ainda não chegou: some diferente de dia sem estudo.
      isFuture: date > today,
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
/**
 * Quantas respostas ficaram FORA do desempenho por disciplina.
 *
 * ⚠️ O card mostra as disciplinas DO EDITAL do aluno, e é assim que tem que
 * ser: é ele que alimenta o Motor 1. Questão de disciplina que não está no
 * plano não tem onde entrar.
 *
 * Só que, do lado do aluno, isso é silêncio: a cliente respondeu dez questões
 * de outra disciplina e o gráfico não se mexeu. Ela não tinha como saber se o
 * sistema ignorou de propósito ou se quebrou.
 *
 * Este número vira uma linha embaixo do card. Continua não entrando na conta —
 * o que muda é o aluno saber por quê.
 */
async function countOutOfPlanAnswers(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(questionAttempts)
    .where(and(eq(questionAttempts.userId, userId), isNull(questionAttempts.planTopicId)));

  return row?.total ?? 0;
}

/**
 * Horário de Ouro, Cobertura do Edital e Lacunas.
 *
 * ⚠️ AS TRÊS CONTAS JÁ EXISTIAM em `modules/metrics`, puras e testadas, desde o
 * Marco 1 — e nunca tinham chegado à tela. O que faltava era só a leitura.
 *
 * Vão juntas numa função porque as três saem das MESMAS duas tabelas
 * (`question_attempts` e `topic_states`). Separadas, seriam três idas ao banco
 * para os mesmos dados, na tela que já é a mais pesada do produto.
 */
async function loadInsights(
  userId: string,
  preparationId: string,
): Promise<{ goldenHour: GoldenHour; coverage: Coverage; gaps: Gap[] }> {
  const [horas, assuntos] = await Promise.all([
    /*
      `answered_hour` é gravado na resposta, já convertido para o fuso do
      aluno. Agrupar por ele aqui é o que torna o Horário de Ouro possível sem
      reconverter timestamp nenhum.
    */
    db
      .select({
        hour: questionAttempts.answeredHour,
        answered: count(),
        correct: sql<number>`count(*) filter (where ${questionAttempts.isCorrect})::int`,
      })
      .from(questionAttempts)
      .where(eq(questionAttempts.userId, userId))
      .groupBy(questionAttempts.answeredHour),

    db
      .select({
        planTopicId: topicStates.planTopicId,
        coverageStatus: topicStates.coverageStatus,
        weight: studyPlanTopics.weight,
        topicName: studyPlanTopics.displayName,
        subjectName: studyPlanSubjects.displayName,
        questionsAnswered: topicStates.questionsAnswered,
        questionsCorrect: topicStates.questionsCorrect,
      })
      .from(topicStates)
      .innerJoin(studyPlanTopics, eq(studyPlanTopics.id, topicStates.planTopicId))
      .innerJoin(studyPlanSubjects, eq(studyPlanSubjects.id, studyPlanTopics.planSubjectId))
      .where(
        and(
          eq(topicStates.preparationId, preparationId),
          eq(studyPlanTopics.isActive, true),
        ),
      ),
  ]);

  return {
    goldenHour: computeGoldenHour(
      horas.map((h) => ({ hour: h.hour ?? 0, answered: h.answered, correct: h.correct })),
    ),
    coverage: computeCoverage(
      assuntos.map((a) => ({
        planTopicId: a.planTopicId,
        coverageStatus: a.coverageStatus,
        weight: a.weight,
      })),
    ),
    gaps: findGaps(
      assuntos.map((a) => ({
        planTopicId: a.planTopicId,
        topicName: a.topicName,
        subjectName: a.subjectName,
        questionsAnswered: a.questionsAnswered,
        questionsCorrect: a.questionsCorrect,
      })),
    ),
  };
}

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
/**
 * O Índice de Preparação, calculado AGORA.
 *
 * ⚠️ NÃO LÊ MAIS `preparation_metrics`.
 *
 * Aquela tabela é preenchida por um job diário que não existe, então o card
 * ficava permanentemente vazio: a cliente fez o diagnóstico, respondeu questões
 * e continuou vendo "o índice aparece depois dos seus primeiros dias".
 *
 * ⚠️ E COMEÇA PELO DIAGNÓSTICO (pedido dela em 27/08/2026).
 *
 * Antes de existir questão respondida, `current_mastery_score` É o diagnóstico:
 * o motor o inicializa com a percepção do aluno e migra para o desempenho real
 * conforme ele pratica. Usar essa média como sinal de acerto no começo dá ao
 * card um valor honesto desde o primeiro dia — e ele se corrige sozinho, sem
 * nenhum tratamento especial, porque é a mesma coluna que o desempenho depois
 * sobrescreve.
 *
 * Continua devolvendo `null` quando não há nem diagnóstico: aí não existe
 * estado de preparação nenhum para medir.
 */
async function loadPreparationIndex(
  preparationId: string,
): Promise<{ value: number; label: string } | null> {
  const [estado, tarefas, config] = await Promise.all([
    db
      .select({
        assuntos: count(),
        iniciados: sql<number>`count(*) filter (where ${topicStates.coverageStatus} <> 'not_started')::int`,
        respondidas: sql<number>`coalesce(sum(${topicStates.questionsAnswered}), 0)::int`,
        corretas: sql<number>`coalesce(sum(${topicStates.questionsCorrect}), 0)::int`,
        dominioMedio: sql<number>`coalesce(avg(${topicStates.currentMasteryScore}), 0)::float`,
        comDiagnostico: sql<number>`count(*) filter (where ${topicStates.initialMastery} is not null)::int`,
      })
      .from(topicStates)
      .where(eq(topicStates.preparationId, preparationId)),

    db
      .select({
        total: count(),
        concluidos: sql<number>`count(*) filter (where ${dailyTaskItems.status} = 'completed')::int`,
      })
      .from(dailyTaskItems)
      .innerJoin(dailyTasks, eq(dailyTasks.id, dailyTaskItems.dailyTaskId))
      .where(eq(dailyTasks.preparationId, preparationId)),

    getActiveConfig("preparation_index"),
  ]);

  const e = estado[0];
  if (!e || e.assuntos === 0) return null;

  // Sem diagnóstico e sem prática, não há o que medir.
  if (e.comDiagnostico === 0 && e.respondidas === 0) return null;

  const pct = (parte: number, total: number) => (total === 0 ? 0 : (parte / total) * 100);

  const index = computePreparationIndex({
    coveragePercent: pct(e.iniciados, e.assuntos),
    // Com prática, o acerto real manda. Sem, vale o domínio informado.
    accuracyPercent:
      e.respondidas > 0 ? pct(e.corretas, e.respondidas) : e.dominioMedio * 100,
    reviewAdherencePercent: await loadReviewAdherence(preparationId),
    taskCompletionPercent: pct(tarefas[0]?.concluidos ?? 0, tarefas[0]?.total ?? 0),
    config: config.value,
  });

  return { value: index.value, label: index.label };
}

/**
 * Quanto das revisões vencidas o aluno cumpriu.
 *
 * O QUE ENTRA NA CONTA
 * ----------------------------------------------------------------------------
 * Denominador: tudo que JÁ VENCEU (`due_date <= hoje`) e não foi cancelado.
 * Numerador: o que ele concluiu. Pulada conta contra, e agendada que passou da
 * data também — é exatamente a revisão atrasada, o caso que o índice existe
 * para capturar.
 *
 * `canceled` fica de fora dos dois lados: a revisão foi embora porque o assunto
 * saiu do plano ou a preparação encerrou, e cobrar do aluno uma revisão que o
 * próprio sistema retirou seria medir dívida que não existe.
 *
 * ⚠️ NÃO EXISTE ESTADO `missed`. O enum tem quatro valores — `scheduled`,
 * `completed`, `skipped`, `canceled` (`db/schema/enums.ts`). A primeira versão
 * desta consulta filtrava por `in ('completed', 'missed')` dentro de um
 * template `sql`, que passa por fora do TypeScript: compilou, passou no lint e
 * derrubou a Home inteira com 500 em produção — `invalid input value for enum
 * review_occurrence_status`. Comparar enum aqui é com a coluna tipada, nunca
 * com string solta.
 *
 * Sem revisão vencida ainda, devolve 100: um aluno que nunca teve revisão não
 * está devendo nenhuma, e começar com zero puxaria o índice para baixo por uma
 * dívida que não existe.
 */
async function loadReviewAdherence(preparationId: string): Promise<number> {
  const [row] = await db
    .select({
      total: count(),
      concluidas: sql<number>`count(*) filter (where ${reviewOccurrences.status} = 'completed')::int`,
    })
    .from(reviewOccurrences)
    .where(
      and(
        eq(reviewOccurrences.preparationId, preparationId),
        ne(reviewOccurrences.status, "canceled"),
        lte(reviewOccurrences.dueDate, sql`current_date`),
      ),
    );

  if (!row || row.total === 0) return 100;
  return (row.concluidas / row.total) * 100;
}

/** A série do gráfico "Evolução": os últimos 30 dias com questões respondidas. */
/**
 * A série do gráfico "Evolução": acerto por dia, nos últimos 30 dias.
 *
 * ⚠️ AGREGA `question_attempts`, NÃO O ROLLUP DIÁRIO.
 *
 * Antes lia `daily_user_rollups`, preenchido por um job noturno que não
 * existe. Em produção a tabela fica vazia, então o gráfico nunca aparecia por
 * mais que o aluno respondesse — a cliente respondeu questões no primeiro dia
 * e viu "com alguns dias de prática, seu percentual aparece aqui".
 *
 * Agrupar por dia direto na origem custa mais que ler um rollup pronto, e é o
 * preço de mostrar o gráfico desde a primeira questão.
 */
async function loadEvolution(userId: string): Promise<EvolutionPoint[]> {
  const rows = await db
    .select({
      date: questionAttempts.answeredDate,
      questionsAnswered: count(),
      questionsCorrect: sql<number>`count(*) filter (where ${questionAttempts.isCorrect})::int`,
    })
    .from(questionAttempts)
    .where(eq(questionAttempts.userId, userId))
    .groupBy(questionAttempts.answeredDate)
    .orderBy(desc(questionAttempts.answeredDate))
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
