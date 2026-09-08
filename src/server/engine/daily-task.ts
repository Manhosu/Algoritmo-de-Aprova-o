import "server-only";

import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";

import { APP_TIMEZONE } from "@/config/app";
import {
  generateDailyTask,
  splitBudgetAcrossPreparations,
  type StudyTechnique,
  type TopicSnapshot,
} from "@/modules/daily-task/generate";
import { toCivilDate, type CivilDate } from "@/modules/shared/dates";
import { db } from "@/server/db";
import {
  canonicalTopics,
  contentItems,
  dailyTaskItems,
  dailyTasks,
  preparations,
  questions,
  reviewOccurrences,
  studyLogs,
  studyPlanSubjects,
  studyPlanTopics,
  topicStates,
  userAvailability,
} from "@/server/db/schema";
import { markFunnelStage } from "@/server/preparations/service";

import { getActiveConfig, requireConfigId } from "./config";
import { custoDoBloco, EXTRAS_DO_MOTOR } from "@/modules/daily-task/generate";
import { getSchedule } from "./schedule";

/**
 * MOTOR 1 LIGADO AO BANCO.
 * ============================================================================
 *
 * Este arquivo NÃO decide nada. Ele monta o retrato (`TopicSnapshot[]`), chama
 * `generateDailyTask` — que é puro e testado sem banco — e grava a saída.
 *
 * A separação é o que torna a priorização verificável: as 5 regras do README
 * 1.6 vivem num módulo que roda em milissegundos num teste de unidade, e o
 * lint impede que ele importe qualquer coisa daqui.
 *
 * ⚠️ SEPARAÇÃO DOS MOTORES (README 1.6/1.7)
 * ----------------------------------------------------------------------------
 * A única coisa que este motor sabe sobre revisões é um NÚMERO de minutos já
 * reservados. Ele não lê a agenda de revisão, não a altera e não a suprime. Se
 * um dia essa linha for cruzada, a métrica de aderência a revisões deixa de
 * significar o que diz.
 */

/** Um bloco leva estudo + prática; sem isso a estimativa do dia fica curta. */
const REVIEW_MINUTES_EACH = 10;

export type GenerateResult =
  | { status: "generated"; taskId: string; blocks: number; plannedMinutes: number }
  | { status: "existing"; taskId: string }
  | { status: "skipped"; reason: "no_availability" | "no_topics" | "not_active" };

/**
 * Gera (ou recupera) a Tarefa do Dia de hoje para uma preparação.
 *
 * IDEMPOTENTE POR DIA. O índice único `(preparation_id, task_date)` é a
 * garantia: duas abas abertas ao mesmo tempo não produzem duas tarefas, e o
 * segundo pedido recebe a que já existe. Sem isso, o aluno que atualiza a
 * página veria a tarefa mudar debaixo dele — e um dia de estudo já começado
 * seria descartado.
 */
export async function ensureDailyTask(input: {
  userId: string;
  preparationId: string;
  now?: Date;
}): Promise<GenerateResult> {
  const now = input.now ?? new Date();
  const today = toCivilDate(now, APP_TIMEZONE);

  const existing = await db.query.dailyTasks.findFirst({
    where: (t, { and: a, eq: e }) =>
      a(e(t.preparationId, input.preparationId), e(t.taskDate, today)),
    columns: { id: true },
  });

  if (existing) return { status: "existing", taskId: existing.id };

  const preparation = await db.query.preparations.findFirst({
    where: (t, { and: a, eq: e }) =>
      a(e(t.id, input.preparationId), e(t.userId, input.userId)),
    columns: {
      id: true,
      status: true,
      examDate: true,
      examDateIsEstimated: true,
      lockedByPlanAt: true,
    },
  });

  if (!preparation || preparation.status !== "active" || preparation.lockedByPlanAt) {
    return { status: "skipped", reason: "not_active" };
  }

  const [weights, scheduleParams, techniques] = await Promise.all([
    getActiveConfig("daily_task_weights"),
    getActiveConfig("schedule_params"),
    getActiveConfig("study_techniques"),
  ]);

  const availableMinutes = await minutesAvailableToday(input.userId, today);
  if (availableMinutes <= 0) return { status: "skipped", reason: "no_availability" };

  const topics = await loadTopicSnapshots(input.preparationId, techniques.value.enabled);
  if (topics.length === 0) return { status: "skipped", reason: "no_topics" };

  /**
   * Minutos já comprometidos com revisões que vencem hoje.
   *
   * É a ÚNICA informação que atravessa do Motor 2 para cá, e ela atravessa como
   * um número — não como a lista de revisões. O Motor 1 desconta o tempo e segue
   * sem saber o que foi descontado.
   */
  const reservedReviewMinutes = await reservedForReviews(input.userId, today);

  const budget = splitBudgetAcrossPreparations({
    today,
    totalMinutes: availableMinutes,
    preparations: await activePreparations(input.userId),
    urgencyExponent: scheduleParams.value.urgencyAllocationExponent,
  });

  const minutosDaPreparacao = budget.get(input.preparationId) ?? availableMinutes;

  /**
   * ⚠️ O ORÇAMENTO DE HOJE VEM DO CRONOGRAMA, e não da disponibilidade crua.
   *
   * Este era o segundo relato da cliente sobre o mesmo assunto: "na dashboard
   * apareceram 6 tarefas para o dia, enquanto no cronograma não aparece nenhum
   * assunto para hoje. Essa prova será em dezembro, então está com no máximo 2
   * assuntos para cada dia".
   *
   * Ela estava certa, e a causa não era ordem — essa eu já tinha corrigido.
   * Era RITMO. O Cronograma calcula `necessário ÷ disponível até a prova` e
   * distribui o conteúdo por todo o período, para o plano terminar na data da
   * prova. A Tarefa do Dia não conhecia esse número: ela enchia os minutos
   * livres do dia até o teto de blocos. Com prova em dezembro, um dizia 1
   * assunto e o outro dizia 6.
   *
   * Agora a Tarefa do Dia recebe os minutos que o Cronograma reservou para
   * HOJE. Os dois passam a contar a mesma história por construção, e não por
   * coincidência de fórmulas parecidas mantidas em dois lugares.
   *
   * ⚠️ FALHA PARA O COMPORTAMENTO ANTIGO se a projeção não vier.
   *
   * Sem data de prova, ou com preparação recém-criada, `getSchedule` pode
   * devolver nulo. Aí o certo é oferecer o dia inteiro: um aluno sem tarefa
   * nenhuma é pior que um aluno com tarefa generosa.
   */
  const projecao = await getSchedule({
    userId: input.userId,
    preparationId: input.preparationId,
    now,
  });

  const hojeNoCronograma = projecao?.weeks[0]?.days.find((dia) => dia.date === today);

  const reservadoHoje =
    hojeNoCronograma?.topics.reduce((soma, t) => soma + t.minutes, 0) ?? null;

  /**
   * ⚠️ DIA VAZIO NO CRONOGRAMA VIRA UM BLOCO, e não tarefa nenhuma.
   *
   * O ritmo produz dias sem conteúdo de propósito: com poucos assuntos e muito
   * tempo até a prova, o acumulado leva dias para juntar um bloco de verdade.
   * O Cronograma mostra isso como folga, e está certo.
   *
   * Minha primeira versão fez a Tarefa do Dia sumir nesses dias. É agreement
   * demais: a cliente pediu que os dois números CONCORDASSEM, não que existissem
   * dias em que o aluno abre o aplicativo e não tem o que fazer. Num produto de
   * estudo, dia em branco é o convite a fechar o aplicativo e não voltar.
   *
   * O piso de um bloco resolve os dois lados. O número que ela viu cai de 6
   * para 1 ou 2, na escala do Cronograma, e ninguém fica sem tarefa.
   */
  /**
   * ⚠️ O DIA RESERVA ESPAÇO PARA O ACRÉSCIMO DO MOTOR, e não só para o
   * cronograma.
   *
   * A cliente pediu: "a missão do dia precisa conter o assunto do cronograma
   * para aquele dia E MAIS um ou dois assuntos escolhidos pelo motor".
   *
   * Passando ao motor exatamente os minutos que o cronograma reservou, os
   * extras nasciam e morriam no mesmo passo: o orçamento acabava no último
   * assunto da agenda e o corte por minutos comia os dois acréscimos. Conferi
   * em produção — a missão vinha com os 3 do cronograma e nada além.
   *
   * O espaço extra é limitado pela disponibilidade REAL do dia. Sem esse teto,
   * quem informou uma hora por dia receberia uma missão de duas.
   */
  const assuntosDeHoje = hojeNoCronograma?.topics.length ?? 0;

  const minutosDeEstudo =
    reservadoHoje === null
      ? minutosDaPreparacao
      : Math.min(
          /* Nunca passa do que o aluno informou que tem. */
          minutosDaPreparacao,
          Math.max(
            (assuntosDeHoje + EXTRAS_DO_MOTOR) * custoDoBloco(scheduleParams.value),
            /* Dia sem nada no cronograma ainda rende uma tarefa. */
            custoDoBloco(scheduleParams.value),
          ),
        );

  const plan = generateDailyTask({
    now,
    timeZone: APP_TIMEZONE,
    today,
    examDate: preparation.examDate as CivilDate | null,
    examDateIsEstimated: preparation.examDateIsEstimated,
    /*
      Os minutos do cronograma já são LÍQUIDOS: `buildWeeks` desconta a reserva
      de revisão antes de distribuir. Somá-la de volta aqui faria o desconto
      acontecer duas vezes e o dia encolher sem motivo.
    */
    availableMinutes: minutosDeEstudo + reservedReviewMinutes,
    reservedReviewMinutes,
    topics,
    /*
      Os assuntos que o cronograma marcou para hoje. Eles abrem a missão, e o
      Motor 1 acrescenta um ou dois por cima — ver a nota em
      `GenerateDailyTaskInput.scheduledTopicIds`.
    */
    scheduledTopicIds: hojeNoCronograma?.topics.map((t) => t.planTopicId) ?? [],
    weights: weights.value,
    scheduleParams: scheduleParams.value,
    techniques: techniques.value,
  });

  if (plan.blocks.length === 0) return { status: "skipped", reason: "no_topics" };

  const engineConfigId = requireConfigId(weights, "daily_task_weights");

  const taskId = await db.transaction(async (tx) => {
    const [task] = await tx
      .insert(dailyTasks)
      .values({
        preparationId: input.preparationId,
        userId: input.userId,
        taskDate: today,
        status: "generated",
        engineConfigId,
        plannedMinutes: plan.plannedMinutes,
        generatedAt: now,
        itemsTotal: 0,
      })
      /**
       * Corrida entre duas requisições simultâneas: a segunda não falha, ela
       * simplesmente não insere. Quem perdeu lê a tarefa da vencedora logo
       * abaixo, e o aluno vê uma tarefa só — que é o comportamento correto.
       */
      .onConflictDoNothing({
        target: [dailyTasks.preparationId, dailyTasks.taskDate],
      })
      .returning({ id: dailyTasks.id });

    if (!task) {
      const [winner] = await tx
        .select({ id: dailyTasks.id })
        .from(dailyTasks)
        .where(
          and(
            eq(dailyTasks.preparationId, input.preparationId),
            eq(dailyTasks.taskDate, today),
          ),
        )
        .limit(1);
      return winner.id;
    }

    const items = plan.blocks.flatMap((block) => {
      const shared = {
        dailyTaskId: task.id,
        preparationId: input.preparationId,
        planTopicId: block.planTopicId,
        blockIndex: block.blockIndex,
        priorityScore: block.priority.score,
        priorityBreakdown: {
          signals: block.priority.signals,
          contributions: block.priority.contributions,
        },
        reasonLabel: block.reasonLabel,
      };

      const rows: Array<typeof dailyTaskItems.$inferInsert> = [
        {
          ...shared,
          kind: "study",
          technique: block.technique,
          contentItemId: block.contentItemId,
          targetMinutes: block.studyMinutes,
          targetQuestionCount: null,
        },
      ];

      // O par de prática só existe quando há questão para oferecer. Um item
      // "Pratique" que abre uma lista vazia é uma promessa quebrada por dia.
      if (block.practiceMinutes > 0 && block.targetQuestionCount !== null) {
        rows.push({
          ...shared,
          kind: "questions",
          technique: null,
          contentItemId: null,
          targetMinutes: block.practiceMinutes,
          targetQuestionCount: block.targetQuestionCount,
        });
      }

      return rows;
    });

    await tx.insert(dailyTaskItems).values(items);

    await tx
      .update(dailyTasks)
      .set({ itemsTotal: items.length })
      .where(eq(dailyTasks.id, task.id));

    return task.id;
  });

  /*
    O degrau do funil só é carimbado no caminho "generated". No "existing" a
    tarefa é de hoje e já foi carimbada quando nasceu; carimbar de novo não
    mudaria nada (o `markFunnelStage` só grava se estiver nulo), mas gastaria um
    UPDATE em toda abertura da Home.
  */
  await markFunnelStage(input.userId, "first_task_generated", now).catch(() => {});

  return {
    status: "generated",
    taskId,
    blocks: plan.blocks.length,
    plannedMinutes: plan.plannedMinutes,
  };
}

/* ========================================================================== *
 * MONTAGEM DO RETRATO
 * ========================================================================== */

/**
 * Lê tudo que o motor precisa saber sobre os assuntos, em consultas agregadas.
 *
 * Um edital tem 150 a 300 assuntos. Cada consulta aqui é UMA ida ao banco para
 * todos eles — a alternativa (uma consulta por assunto) seria trezentas
 * viagens para desenhar uma tela, no celular, todo dia.
 */
async function loadTopicSnapshots(
  preparationId: string,
  enabledTechniques: readonly StudyTechnique[],
): Promise<TopicSnapshot[]> {
  const rows = await db
    .select({
      planTopicId: studyPlanTopics.id,
      planSubjectId: studyPlanTopics.planSubjectId,
      subjectName: studyPlanSubjects.displayName,
      topicName: studyPlanTopics.displayName,
      weight: studyPlanTopics.weight,
      weightSource: studyPlanTopics.weightSource,
      canonicalTopicId: studyPlanTopics.canonicalTopicId,
      mappingStatus: studyPlanTopics.mappingStatus,
      initialMastery: topicStates.initialMastery,
      currentMasteryScore: topicStates.currentMasteryScore,
      masteryConfidence: topicStates.masteryConfidence,
      questionsAnswered: topicStates.questionsAnswered,
      questionsCorrect: topicStates.questionsCorrect,
      recentAccuracy: topicStates.recentAccuracy,
      coverageStatus: topicStates.coverageStatus,
      lastStudiedAt: topicStates.lastStudiedAt,
      lastAnsweredAt: topicStates.lastAnsweredAt,
    })
    .from(studyPlanTopics)
    .innerJoin(studyPlanSubjects, eq(studyPlanTopics.planSubjectId, studyPlanSubjects.id))
    .leftJoin(topicStates, eq(topicStates.planTopicId, studyPlanTopics.id))
    .where(
      and(
        eq(studyPlanTopics.preparationId, preparationId),
        eq(studyPlanTopics.isActive, true),
        isNull(studyPlanTopics.deletedAt),
      ),
    );

  if (rows.length === 0) return [];

  const canonicalIds = [
    ...new Set(rows.map((r) => r.canonicalTopicId).filter((id): id is string => id !== null)),
  ];

  const [questionCounts, materials, recentTechniques, notasDeRevisao] = await Promise.all([
    countQuestionsByTopic(canonicalIds),
    materialsByTopic(canonicalIds),
    recentTechniquesByTopic(rows.map((r) => r.planTopicId)),
    reviewRatingsByTopic(rows.map((r) => r.planTopicId)),
  ]);

  return rows.map((row) => {
    const canonicalId = row.canonicalTopicId;
    const mapped =
      row.mappingStatus === "mapped" || row.mappingStatus === "manually_mapped";

    const available = canonicalId ? (materials.get(canonicalId) ?? new Map()) : new Map();
    const availableTechniques = enabledTechniques.filter((technique) =>
      available.has(technique),
    );

    return {
      planTopicId: row.planTopicId,
      planSubjectId: row.planSubjectId,
      subjectName: row.subjectName,
      topicName: row.topicName,

      weight: row.weight,
      weightSource: row.weightSource,

      isMapped: mapped && canonicalId !== null,
      availableQuestionCount: canonicalId ? (questionCounts.get(canonicalId) ?? 0) : 0,

      initialMastery: row.initialMastery,
      currentMasteryScore: row.currentMasteryScore ?? 0.5,
      masteryConfidence: row.masteryConfidence ?? 0,
      questionsAnswered: row.questionsAnswered ?? 0,
      questionsCorrect: row.questionsCorrect ?? 0,
      recentAccuracy: row.recentAccuracy,
      /* O sinal que substituiu "desempenho" — ver `hardReviewsSignal`. */
      reviewsRated: notasDeRevisao.get(row.planTopicId)?.total ?? 0,
      reviewsRatedHard: notasDeRevisao.get(row.planTopicId)?.dificeis ?? 0,
      coverageProgress: coverageToProgress(row.coverageStatus),
      lastTouchedOn: lastTouched(row.lastStudiedAt, row.lastAnsweredAt),

      recentTechniques: recentTechniques.get(row.planTopicId) ?? [],
      availableTechniques,
      contentByTechnique: Object.fromEntries(available) as Partial<
        Record<StudyTechnique, string>
      >,
    };
  });
}

/**
 * `coverage_status` é um enum de quatro degraus; o motor quer um número de 0 a
 * 1. A conversão fica aqui, e não no módulo puro, porque é uma característica
 * do armazenamento — o motor não precisa saber que existe um enum.
 */
function coverageToProgress(
  status: "not_started" | "in_progress" | "studied" | "mastered" | null,
): number {
  switch (status) {
    case "mastered":
      return 1;
    case "studied":
      return 0.75;
    case "in_progress":
      return 0.4;
    default:
      return 0;
  }
}

function lastTouched(studied: Date | null, answered: Date | null): CivilDate | null {
  const dates = [studied, answered].filter((date): date is Date => date !== null);
  if (dates.length === 0) return null;
  const latest = dates.reduce((a, b) => (a > b ? a : b));
  return toCivilDate(latest, APP_TIMEZONE);
}

async function countQuestionsByTopic(
  canonicalIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (canonicalIds.length === 0) return result;

  const rows = await db
    .select({ topicId: questions.canonicalTopicId, total: count() })
    .from(questions)
    .where(
      and(
        inArray(questions.canonicalTopicId, canonicalIds),
        eq(questions.status, "published"),
      ),
    )
    .groupBy(questions.canonicalTopicId);

  for (const row of rows) {
    if (row.topicId) result.set(row.topicId, row.total);
  }
  return result;
}

/** Do tipo de material do acervo para a técnica de estudo que ele representa. */
const CONTENT_TYPE_TO_TECHNIQUE: Record<string, StudyTechnique> = {
  flashcard_deck: "flashcard",
  mind_map: "mind_map",
  video: "video",
  study_text: "reading",
  pdf: "summary",
  audio: "audio",
};

/**
 * Um material por técnica e por assunto — o mais recente publicado.
 *
 * O motor precisa saber QUE existe material da técnica, e de UM id para
 * prescrever. Quantos existem é problema do link, que decide entre abrir o
 * item ou a lista (ver `src/lib/deep-links.ts`).
 */
async function materialsByTopic(
  canonicalIds: string[],
): Promise<Map<string, Map<StudyTechnique, string>>> {
  const result = new Map<string, Map<StudyTechnique, string>>();
  if (canonicalIds.length === 0) return result;

  const rows = await db
    .select({
      id: contentItems.id,
      topicId: contentItems.canonicalTopicId,
      type: contentItems.type,
    })
    .from(contentItems)
    .where(
      and(
        inArray(contentItems.canonicalTopicId, canonicalIds),
        eq(contentItems.status, "published"),
        isNull(contentItems.deletedAt),
      ),
    )
    .orderBy(contentItems.sortOrder);

  for (const row of rows) {
    if (!row.topicId) continue;
    const technique = CONTENT_TYPE_TO_TECHNIQUE[row.type];
    if (!technique) continue;

    const byTechnique = result.get(row.topicId) ?? new Map<StudyTechnique, string>();
    if (!byTechnique.has(technique)) byTechnique.set(technique, row.id);
    result.set(row.topicId, byTechnique);
  }

  return result;
}

/**
 * As técnicas usadas nas últimas sessões de cada assunto, da mais recente.
 *
 * É o que alimenta a ROTAÇÃO: sem esta lista, o motor prescreveria a mesma
 * técnica todo dia e a métrica "melhor técnica de estudo" compararia assuntos
 * em vez de técnicas.
 */
/**
 * Quantas revisões de cada assunto o aluno avaliou, e quantas marcou Difícil.
 *
 * ⚠️ UMA CONSULTA PARA O EDITAL INTEIRO. Um edital tem 150 a 300 assuntos, e
 * uma consulta por assunto seriam trezentas viagens para montar a tarefa de um
 * dia, no celular.
 *
 * Só conta ocorrência CONCLUÍDA e com nota: revisão pulada ou sem avaliação não
 * diz nada sobre a dificuldade do assunto, e contá-la como "não foi difícil"
 * inventaria uma opinião que o aluno não deu.
 */
async function reviewRatingsByTopic(
  planTopicIds: string[],
): Promise<Map<string, { total: number; dificeis: number }>> {
  if (planTopicIds.length === 0) return new Map();

  const linhas = await db
    .select({
      planTopicId: reviewOccurrences.planTopicId,
      total: sql<number>`count(*)::int`,
      dificeis: sql<number>`count(*) filter (where ${reviewOccurrences.performanceRating} = 'hard')::int`,
    })
    .from(reviewOccurrences)
    .where(
      and(
        inArray(reviewOccurrences.planTopicId, planTopicIds),
        eq(reviewOccurrences.status, "completed"),
        sql`${reviewOccurrences.performanceRating} is not null`,
      ),
    )
    .groupBy(reviewOccurrences.planTopicId);

  return new Map(
    linhas.map((linha) => [
      linha.planTopicId,
      { total: linha.total, dificeis: linha.dificeis },
    ]),
  );
}

async function recentTechniquesByTopic(
  planTopicIds: string[],
): Promise<Map<string, StudyTechnique[]>> {
  const result = new Map<string, StudyTechnique[]>();
  if (planTopicIds.length === 0) return result;

  const rows = await db
    .select({
      planTopicId: studyLogs.planTopicId,
      technique: studyLogs.technique,
      completedAt: studyLogs.completedAt,
    })
    .from(studyLogs)
    .where(inArray(studyLogs.planTopicId, planTopicIds))
    .orderBy(sql`${studyLogs.completedAt} desc`)
    .limit(planTopicIds.length * 5);

  for (const row of rows) {
    if (!row.planTopicId || !row.technique) continue;
    const list = result.get(row.planTopicId) ?? [];
    if (list.length < 5) list.push(row.technique as StudyTechnique);
    result.set(row.planTopicId, list);
  }

  return result;
}

/* ========================================================================== *
 * ORÇAMENTO DO DIA
 * ========================================================================== */

/**
 * Minutos que o aluno declarou ter no dia da semana de hoje.
 *
 * A disponibilidade é do ALUNO, não da preparação: quem tem dois editais não
 * tem duas horas para cada um, tem duas horas. `splitBudgetAcrossPreparations`
 * é quem reparte.
 */
async function minutesAvailableToday(
  userId: string,
  today: CivilDate,
): Promise<number> {
  // O dia da semana sai da data civil já resolvida no fuso do aluno, ao meio-dia
  // UTC. Usar `new Date()` aqui pegaria o dia do SERVIDOR: em UTC, a segunda
  // -feira começa três horas antes da do aluno, e a tarefa de domingo à noite
  // seria montada com a disponibilidade de segunda.
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();

  const [row] = await db
    .select({ minutes: userAvailability.minutesAvailable })
    .from(userAvailability)
    .where(and(eq(userAvailability.userId, userId), eq(userAvailability.weekday, weekday)))
    .limit(1);

  return row?.minutes ?? 0;
}

async function activePreparations(
  userId: string,
): Promise<Array<{ preparationId: string; examDate: CivilDate | null }>> {
  const rows = await db
    .select({ id: preparations.id, examDate: preparations.examDate })
    .from(preparations)
    .where(
      and(
        eq(preparations.userId, userId),
        eq(preparations.status, "active"),
        isNull(preparations.lockedByPlanAt),
        isNull(preparations.deletedAt),
      ),
    );

  return rows.map((row) => ({
    preparationId: row.id,
    examDate: row.examDate as CivilDate | null,
  }));
}

/**
 * Quantos minutos as revisões de hoje ocupam.
 *
 * ⚠️ É o ÚNICO ponto de contato entre os dois motores, e ele é de mão única: um
 * número sai do Motor 2 e entra no Motor 1. Nada volta.
 */
async function reservedForReviews(userId: string, today: CivilDate): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(reviewOccurrences)
    .where(
      and(
        eq(reviewOccurrences.userId, userId),
        eq(reviewOccurrences.status, "scheduled"),
        sql`${reviewOccurrences.dueDate} <= ${today}`,
      ),
    );

  return (row?.total ?? 0) * REVIEW_MINUTES_EACH;
}

/* ========================================================================== *
 * LEITURA PARA A TELA
 * ========================================================================== */

export type MissionBlock = {
  blockIndex: number;
  topicName: string;
  subjectName: string;
  topicSlug: string | null;
  study: {
    itemId: string;
    technique: StudyTechnique | null;
    contentItemId: string | null;
    materialCount: number;
    done: boolean;
  };
  practice: { itemId: string; done: boolean } | null;
  reasonLabel: string;
};

export type DailyMissions = {
  taskId: string;
  taskDate: CivilDate;
  blocks: MissionBlock[];
  itemsTotal: number;
  itemsCompleted: number;
  plannedMinutes: number;
};

/**
 * A Tarefa do Dia como a Home precisa dela.
 *
 * Decisão da cliente em 21/08/2026: "Tarefas do Dia" e "Missões do Dia" são a
 * MESMA COISA — um card só, com as duplinhas de Estude e Pratique, tudo valendo
 * XP, tudo clicável, riscando conforme cumpre.
 *
 * ⚠️ `targetQuestionCount` NÃO sai daqui. É meta interna: no plano Free o teto
 * é de 10 questões por dia, e anunciar "responda 15" seria prometer o que o
 * plano não entrega.
 */
export async function getDailyMissions(
  preparationId: string,
  taskDate: CivilDate,
): Promise<DailyMissions | null> {
  const task = await db.query.dailyTasks.findFirst({
    where: (t, { and: a, eq: e }) =>
      a(e(t.preparationId, preparationId), e(t.taskDate, taskDate)),
    columns: {
      id: true,
      taskDate: true,
      itemsTotal: true,
      itemsCompleted: true,
      plannedMinutes: true,
    },
  });

  if (!task) return null;

  const rows = await db
    .select({
      itemId: dailyTaskItems.id,
      kind: dailyTaskItems.kind,
      status: dailyTaskItems.status,
      blockIndex: dailyTaskItems.blockIndex,
      technique: dailyTaskItems.technique,
      contentItemId: dailyTaskItems.contentItemId,
      reasonLabel: dailyTaskItems.reasonLabel,
      topicName: studyPlanTopics.displayName,
      subjectName: studyPlanSubjects.displayName,
      canonicalTopicId: studyPlanTopics.canonicalTopicId,
      topicSlug: canonicalTopics.slug,
    })
    .from(dailyTaskItems)
    .innerJoin(studyPlanTopics, eq(dailyTaskItems.planTopicId, studyPlanTopics.id))
    .innerJoin(studyPlanSubjects, eq(studyPlanTopics.planSubjectId, studyPlanSubjects.id))
    .leftJoin(canonicalTopics, eq(studyPlanTopics.canonicalTopicId, canonicalTopics.id))
    .where(eq(dailyTaskItems.dailyTaskId, task.id))
    .orderBy(dailyTaskItems.blockIndex);

  const materialCounts = await countMaterials(
    [...new Set(rows.map((r) => r.canonicalTopicId).filter((id): id is string => !!id))],
  );

  const byBlock = new Map<number, MissionBlock>();

  for (const row of rows) {
    const existing = byBlock.get(row.blockIndex);

    if (row.kind === "questions") {
      if (existing) {
        existing.practice = { itemId: row.itemId, done: row.status === "completed" };
      }
      continue;
    }

    byBlock.set(row.blockIndex, {
      blockIndex: row.blockIndex,
      topicName: row.topicName,
      subjectName: row.subjectName,
      topicSlug: row.topicSlug,
      study: {
        itemId: row.itemId,
        technique: row.technique as StudyTechnique | null,
        contentItemId: row.contentItemId,
        materialCount: row.canonicalTopicId
          ? (materialCounts.get(row.canonicalTopicId)?.get(row.technique ?? "") ?? 0)
          : 0,
        done: row.status === "completed",
      },
      practice: existing?.practice ?? null,
      reasonLabel: row.reasonLabel ?? "",
    });
  }

  // Segunda passada: itens de prática que chegaram antes do estudo do bloco.
  for (const row of rows) {
    if (row.kind !== "questions") continue;
    const block = byBlock.get(row.blockIndex);
    if (block && block.practice === null) {
      block.practice = { itemId: row.itemId, done: row.status === "completed" };
    }
  }

  return {
    taskId: task.id,
    taskDate: task.taskDate as CivilDate,
    blocks: [...byBlock.values()].sort((a, b) => a.blockIndex - b.blockIndex),
    itemsTotal: task.itemsTotal,
    itemsCompleted: task.itemsCompleted,
    plannedMinutes: task.plannedMinutes,
  };
}

/** Quantos materiais de cada técnica existem por assunto — decide o destino do link. */
async function countMaterials(
  canonicalIds: string[],
): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>();
  if (canonicalIds.length === 0) return result;

  const rows = await db
    .select({
      topicId: contentItems.canonicalTopicId,
      type: contentItems.type,
      total: count(),
    })
    .from(contentItems)
    .where(
      and(
        inArray(contentItems.canonicalTopicId, canonicalIds),
        eq(contentItems.status, "published"),
        isNull(contentItems.deletedAt),
      ),
    )
    .groupBy(contentItems.canonicalTopicId, contentItems.type);

  for (const row of rows) {
    if (!row.topicId) continue;
    const technique = CONTENT_TYPE_TO_TECHNIQUE[row.type];
    if (!technique) continue;
    const byTechnique = result.get(row.topicId) ?? new Map<string, number>();
    byTechnique.set(technique, row.total);
    result.set(row.topicId, byTechnique);
  }

  return result;
}
