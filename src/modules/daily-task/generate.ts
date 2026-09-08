import { spreadAcrossSubjects } from "@/modules/shared/spread-subjects";
import type {
  DailyTaskWeights,
  ScheduleParams,
  StudyTechniquesConfig,
} from "@/modules/engine-config/schemas";
import { toCivilDate, type CivilDate } from "@/modules/shared/dates";

import {
  clamp01,
  computePriority,
  editalWeightSignal,
  explainPriority,
  knowledgeGapSignal,
  hardReviewsSignal,
  recencySignal,
  urgencySignal,
  type PriorityResult,
  type Signals,
} from "./signals";

/**
 * MOTOR 1 — MONTAGEM DA TAREFA DO DIA
 * ============================================================================
 *
 * Recebe o retrato dos assuntos da preparação e devolve a tarefa do dia em
 * BLOCOS, no formato que a cliente definiu:
 *
 *     🧠 Estude: Mapa Mental — Crase
 *     🎯 Pratique: Questões — Crase
 *
 * ⚠️ Independente do Motor 2. Não recebe revisões, não as agenda e não as
 * suprime. O que chega daqui é `reservedReviewMinutes` — um número de minutos
 * já descontado do dia — e nem isso o motor sabe de onde veio.
 */

export type StudyTechnique = StudyTechniquesConfig["enabled"][number];

/** O que o motor precisa saber sobre um assunto do edital do aluno. */
export type TopicSnapshot = {
  planTopicId: string;
  planSubjectId: string;
  subjectName: string;
  topicName: string;

  /* --- edital --- */
  weight: number | null;
  weightSource: "edital" | "student" | "default" | "admin";

  /* --- a ponte com o catálogo --- */
  /** Falso quando o assunto não casou: não há questão para ofertar. */
  isMapped: boolean;
  availableQuestionCount: number;

  /* --- estado do aluno --- */
  initialMastery: "high" | "medium" | "low" | null;
  currentMasteryScore: number;
  masteryConfidence: number;
  questionsAnswered: number;
  questionsCorrect: number;
  recentAccuracy: number | null;
  /** Revisões concluídas deste assunto em que o aluno deu uma nota. */
  reviewsRated: number;
  /** Quantas dessas ele marcou como "Difícil". Ver `hardReviewsSignal`. */
  reviewsRatedHard: number;
  coverageProgress: number;
  lastTouchedOn: CivilDate | null;

  /** Técnicas usadas nas últimas sessões deste assunto, da mais recente. */
  recentTechniques: StudyTechnique[];
  /** Técnicas com material disponível para este assunto. */
  availableTechniques: StudyTechnique[];
  /** Material específico por técnica, quando existe. */
  contentByTechnique?: Partial<Record<StudyTechnique, string>>;
};

export type GenerateDailyTaskInput = {
  now: Date;
  timeZone: string;
  today?: CivilDate;

  examDate: CivilDate | null;
  examDateIsEstimated: boolean;

  /** Minutos que o aluno tem hoje, já divididos entre as preparações ativas. */
  availableMinutes: number;
  /** Minutos já comprometidos com revisões vencendo hoje. */
  reservedReviewMinutes: number;

  topics: TopicSnapshot[];

  /**
   * Os assuntos que o CRONOGRAMA marcou para hoje. Eles abrem a missão.
   *
   * ⚠️ PEDIDO DA CLIENTE EM 08/09/2026, e ele reposiciona o Motor 1.
   *
   * Palavras dela: "a missão do dia precisa conter o assunto do cronograma para
   * aquele dia e mais um ou dois assuntos escolhidos pelo motor"; "o motor com
   * 5 sinais só gera 1 ou 2 assuntos na missão do dia, não influencia o
   * cronograma inteiro".
   *
   * Antes as duas telas ordenavam o mesmo conjunto por conta própria, e
   * concordavam por coincidência de fórmulas parecidas. Agora o cronograma é a
   * espinha do dia e o motor entra por cima, com o que o desempenho de ontem
   * pede. Vazio, o motor monta o dia sozinho — é o que acontece antes da
   * primeira projeção existir.
   */
  scheduledTopicIds?: string[];

  weights: DailyTaskWeights;
  scheduleParams: ScheduleParams;
  techniques: StudyTechniquesConfig;
};

export type DailyTaskBlock = {
  blockIndex: number;
  planTopicId: string;
  topicName: string;
  subjectName: string;

  /** Nula quando não há material: o bloco vira estudo neutro. */
  technique: StudyTechnique | null;
  contentItemId: string | null;

  studyMinutes: number;
  practiceMinutes: number;
  /** ⚠️ Meta interna. NÃO é exibida ao aluno. */
  targetQuestionCount: number | null;

  priority: PriorityResult;
  reasonLabel: string;
};

export type DailyTaskPlan = {
  taskDate: CivilDate;
  blocks: DailyTaskBlock[];
  plannedMinutes: number;
  /** Diagnóstico da geração — vai para log, não para a tela do aluno. */
  diagnostics: {
    topicsConsidered: number;
    topicsUnmapped: number;
    minutesAvailableForStudy: number;
    truncatedByMinutes: boolean;
    truncatedByItemCap: boolean;
  };
};

/** Minutos estimados por questão, usado para dimensionar a prática. */
const MINUTES_PER_QUESTION = 2;

/**
 * Quantos assuntos o Motor 1 acrescenta ao que o cronograma já marcou.
 *
 * "Mais um ou dois assuntos escolhidos pelo motor", nas palavras da cliente.
 * Dois é o teto: o motor deixou de desenhar o dia e passou a temperá-lo.
 */
export const EXTRAS_DO_MOTOR = 2;

/** Quanto de prática acompanha cada bloco de estudo, como fração dele. */
const PROPORCAO_DE_PRATICA = 0.6;

/**
 * Quanto um bloco da missão custa no pior caso: estudo mais a prática que vem
 * junto.
 *
 * ⚠️ EXISTE PARA O SERVIDOR DIMENSIONAR O DIA, e a falta dele custou uma missão
 * incompleta em produção.
 *
 * O cronograma reserva só o tempo de ESTUDO de cada assunto. Quem monta a
 * missão precisa saber que o par de questões vem junto — senão o orçamento
 * acaba antes do último assunto que o cronograma prometeu, e a cliente vê uma
 * missão menor que o próprio plano dela. Conferido em produção em 08/09/2026:
 * a missão trazia os assuntos da agenda e nenhum acréscimo do motor.
 *
 * A conta mora aqui, ao lado da que ela precisa espelhar. Repetir "0,6" no
 * servidor criaria duas fórmulas que um dia discordariam em silêncio.
 */
export function custoDoBloco(scheduleParams: ScheduleParams): number {
  return Math.round(
    scheduleParams.defaultStudyBlockMinutes * (1 + PROPORCAO_DE_PRATICA),
  );
}

export function generateDailyTask(input: GenerateDailyTaskInput): DailyTaskPlan {
  const today = input.today ?? toCivilDate(input.now, input.timeZone);

  const eligible = input.topics.filter((topic) => topic.coverageProgress < 1);
  const pool = eligible.length > 0 ? eligible : input.topics;

  const maxWeight = Math.max(
    0,
    ...pool.map((t) => (t.weightSource === "default" ? 0 : (t.weight ?? 0))),
  );

  const scored = pool
    .map((topic) => {
      const signals: Signals = {
        hardReviews: hardReviewsSignal(topic),
        editalWeight: editalWeightSignal({
          weight: topic.weight,
          weightSource: topic.weightSource,
          maxWeightInPreparation: maxWeight,
        }),
        urgency: urgencySignal({
          today,
          examDate: input.examDate,
          examDateIsEstimated: input.examDateIsEstimated,
          coverageProgress: topic.coverageProgress,
        }),
        recency: recencySignal({ today, lastTouchedOn: topic.lastTouchedOn }),
        knowledgeGap: knowledgeGapSignal(topic),
      };

      const priority = computePriority(signals, input.weights);
      return { topic, priority };
    })
    .sort((a, b) => {
      /*
       * ⚠️ O ACERVO É CRITÉRIO DE DESEMPATE, NÃO UM SEXTO SINAL.
       *
       * A cliente pediu que o motor "priorize também o que tem no acervo",
       * para o aluno não esbarrar em assunto sem questão enquanto o conteúdo
       * ainda está sendo produzido.
       *
       * Só que os cinco sinais e seus pesos são a especificação do motor, e
       * estão no README com percentuais fechados. Transformar disponibilidade
       * de material em sinal ponderado mudaria o que o produto promete: o
       * assunto que mais cai no edital passaria atrás de um assunto secundário
       * só porque produzimos questão dele antes. Isso é organizar o estudo do
       * aluno pela nossa conveniência.
       *
       * Como DESEMPATE, o efeito é o desejado sem esse custo: entre assuntos
       * que o algoritmo considera igualmente prioritários, vence o que o aluno
       * consegue praticar hoje. Quem manda continua sendo o edital.
       *
       * A comparação usa uma folga de 0,01 no score porque ele é float: dois
       * assuntos "empatados" costumam diferir na décima casa, e uma igualdade
       * exata quase nunca acontece.
       */
      const diferenca = b.priority.score - a.priority.score;
      if (Math.abs(diferenca) > 0.01) return diferenca;

      const acervoA = a.topic.isMapped ? a.topic.availableQuestionCount : 0;
      const acervoB = b.topic.isMapped ? b.topic.availableQuestionCount : 0;
      if (acervoA !== acervoB) return acervoB - acervoA;

      // Desempate estável: sem isso, dois assuntos empatados alternariam de
      // posição entre execuções e a tarefa pareceria mudar sozinha.
      return a.topic.planTopicId < b.topic.planTopicId ? -1 : 1;
    });

  const minutesForStudy = Math.max(
    0,
    input.availableMinutes - Math.max(0, input.reservedReviewMinutes),
  );

  const blocks: DailyTaskBlock[] = [];
  let usedMinutes = 0;
  let truncatedByMinutes = false;

  const ordered = spreadAcrossSubjects(scored, (item) => item.topic.planSubjectId);

  /*
    ⚠️ O CRONOGRAMA ABRE A MISSÃO; o motor completa com um ou dois.

    A ordem importa duas vezes. Na tela, porque o aluno lê de cima para baixo e
    o que o plano dele mandou estudar hoje precisa ser a primeira linha. E no
    corte: quando os minutos acabam, quem fica de fora é o acréscimo do motor,
    nunca o assunto que o cronograma prometeu.
  */
  const doCronograma = new Set(input.scheduledTopicIds ?? []);

  const daAgenda = ordered.filter((item) => doCronograma.has(item.topic.planTopicId));
  const doMotor = ordered.filter((item) => !doCronograma.has(item.topic.planTopicId));

  const fila =
    daAgenda.length === 0
      ? ordered
      : [...daAgenda, ...doMotor.slice(0, EXTRAS_DO_MOTOR)];

  for (const { topic, priority } of fila) {
    if (blocks.length >= input.scheduleParams.maxDailyTaskItems) break;

    const block = buildBlock({
      blockIndex: blocks.length,
      topic,
      priority,
      remainingMinutes: minutesForStudy - usedMinutes,
      scheduleParams: input.scheduleParams,
      techniques: input.techniques,
    });

    if (block === null) {
      truncatedByMinutes = true;
      break;
    }

    blocks.push(block);
    usedMinutes += block.studyMinutes + block.practiceMinutes;
  }

  return {
    taskDate: today,
    blocks,
    plannedMinutes: usedMinutes,
    diagnostics: {
      topicsConsidered: pool.length,
      topicsUnmapped: pool.filter((t) => !t.isMapped).length,
      minutesAvailableForStudy: minutesForStudy,
      truncatedByMinutes,
      truncatedByItemCap: blocks.length >= input.scheduleParams.maxDailyTaskItems,
    },
  };
}

/* ========================================================================== *
 * MONTAGEM DE UM BLOCO
 * ========================================================================== */

function buildBlock(args: {
  blockIndex: number;
  topic: TopicSnapshot;
  priority: PriorityResult;
  remainingMinutes: number;
  scheduleParams: ScheduleParams;
  techniques: StudyTechniquesConfig;
}): DailyTaskBlock | null {
  const { topic, scheduleParams, techniques } = args;

  const studyMinutes = scheduleParams.defaultStudyBlockMinutes;

  // Só oferece prática quando o assunto casou com o catálogo E existe questão.
  // Um assunto não mapeado continua estudável — ele não some da tarefa, só não
  // recebe o par de questões. É o que impede a tarefa de ficar vazia por causa
  // de uma falha de casamento que o aluno não causou nem enxerga.
  const canPractice =
    techniques.alwaysPairWithQuestions && topic.isMapped && topic.availableQuestionCount > 0;

  const practiceMinutes = canPractice ? Math.round(studyMinutes * PROPORCAO_DE_PRATICA) : 0;
  const blockMinutes = studyMinutes + practiceMinutes;

  // Não cabe. O primeiro bloco entra de qualquer forma: um dia com 10 minutos
  // disponíveis precisa render alguma tarefa, nem que seja menor que o padrão.
  if (blockMinutes > args.remainingMinutes && args.blockIndex > 0) return null;

  const technique = chooseTechnique(topic, techniques);

  const targetQuestionCount = canPractice
    ? Math.max(
        1,
        Math.min(
          Math.floor(practiceMinutes / MINUTES_PER_QUESTION),
          topic.availableQuestionCount,
        ),
      )
    : null;

  return {
    blockIndex: args.blockIndex,
    planTopicId: topic.planTopicId,
    topicName: topic.topicName,
    subjectName: topic.subjectName,
    technique,
    contentItemId: technique ? (topic.contentByTechnique?.[technique] ?? null) : null,
    studyMinutes,
    practiceMinutes,
    targetQuestionCount,
    priority: args.priority,
    reasonLabel: explainPriority(args.priority),
  };
}

/**
 * Escolhe a técnica de estudo prescrita para este assunto hoje.
 *
 * A ROTAÇÃO É O QUE TORNA A MÉTRICA POSSÍVEL
 * ----------------------------------------------------------------------------
 * O objetivo declarado da cliente é medir a melhor técnica de estudo. Se o
 * mesmo assunto usasse sempre a mesma técnica, a comparação entre técnicas
 * seria uma comparação entre ASSUNTOS — e diria que mapa mental funciona melhor
 * só porque calhou de cair nos assuntos fáceis.
 *
 * Alternando dentro do mesmo assunto, a comparação passa a ser feita com o
 * conteúdo controlado, que é o que dá sentido ao número.
 *
 * ⚠️ SEM MATERIAL, CAI NO PADRÃO — mas só se o padrão não depender do acervo.
 *
 * A cliente relatou duas coisas em 08/09/2026 que são a MESMA: "a Melhor
 * Técnica não está medindo" e "cada tarefa deveria dizer o modo de estudo".
 * Ambas vinham daqui. De 169 itens gerados, 137 saíram sem técnica nenhuma:
 * a linha aparecia como "Estude: Crase", sem modo, e a métrica ficava sem o
 * dado que ela existe para comparar.
 *
 * A causa era este trecho. Ele só usava o padrão quando o PADRÃO tinha material
 * — e um padrão que exige material não é padrão, é mais uma opção. Leitura não
 * depende do nosso acervo: o aluno lê a apostila dele, a lei seca, o edital. É
 * uma instrução de COMO estudar, não a promessa de um arquivo nosso.
 *
 * Prometer mapa mental que não existe continua proibido, e é por isso que a
 * checagem é sobre a natureza do padrão, e não sobre haver um padrão.
 */

/**
 * Técnicas que o aluno consegue executar com o material DELE.
 *
 * As outras (mapa mental, flashcard, resumo, videoaula, áudio) são conteúdo que
 * nós publicamos: prescrevê-las sem ter o arquivo manda o aluno para uma tela
 * vazia com o nosso nome em cima.
 */
const TECNICAS_SEM_ACERVO: StudyTechnique[] = ["reading", "other"];

export function chooseTechnique(
  topic: TopicSnapshot,
  config: StudyTechniquesConfig,
): StudyTechnique | null {
  const usable = config.enabled.filter((technique) =>
    topic.availableTechniques.includes(technique),
  );

  if (usable.length === 0) {
    if (topic.availableTechniques.includes(config.fallback)) return config.fallback;
    return TECNICAS_SEM_ACERVO.includes(config.fallback) ? config.fallback : null;
  }

  const recent = topic.recentTechniques.slice(0, config.minSessionsBeforeRepeat);
  const fresh = usable.filter((technique) => !recent.includes(technique));

  // Todas já foram usadas recentemente: pega a menos recente das disponíveis.
  if (fresh.length === 0) {
    let oldest = usable[0];
    let oldestPosition = -1;
    for (const technique of usable) {
      const position = topic.recentTechniques.indexOf(technique);
      const effective = position === -1 ? Number.MAX_SAFE_INTEGER : position;
      if (effective > oldestPosition) {
        oldestPosition = effective;
        oldest = technique;
      }
    }
    return oldest;
  }

  return fresh[0];
}


/* ========================================================================== *
 * DIVISÃO DO DIA ENTRE PREPARAÇÕES
 * ========================================================================== */

export type PreparationBudgetInput = {
  today: CivilDate;
  totalMinutes: number;
  preparations: Array<{ preparationId: string; examDate: CivilDate | null }>;
  urgencyExponent: number;
};

/**
 * Divide o tempo diário do aluno entre as preparações ativas.
 *
 * Um aluno Premium com dois editais NÃO tem duas horas para cada um; ele tem
 * duas horas. A disponibilidade é da pessoa (`user_availability`), e é aqui que
 * ela vira orçamento por preparação — com mais peso para a prova mais próxima.
 *
 * Preparação sem data de prova recebe peso base: não dá para dizer que é
 * urgente, mas também não dá para zerá-la.
 */
export function splitBudgetAcrossPreparations(
  input: PreparationBudgetInput,
): Map<string, number> {
  const { preparations, totalMinutes } = input;
  const result = new Map<string, number>();

  if (preparations.length === 0 || totalMinutes <= 0) return result;
  if (preparations.length === 1) {
    result.set(preparations[0].preparationId, totalMinutes);
    return result;
  }

  const weights = preparations.map((preparation) => {
    if (preparation.examDate === null) return 1;
    const daysLeft = Math.max(
      1,
      daysUntil(input.today, preparation.examDate),
    );
    // Quanto menos dias, maior o peso.
    return Math.pow(365 / daysLeft, input.urgencyExponent);
  });

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) return result;

  let distributed = 0;
  preparations.forEach((preparation, index) => {
    const isLast = index === preparations.length - 1;
    // O último recebe o resto, para a soma bater exatamente com o total.
    const minutes = isLast
      ? totalMinutes - distributed
      : Math.floor((weights[index] / totalWeight) * totalMinutes);
    result.set(preparation.preparationId, Math.max(0, minutes));
    distributed += minutes;
  });

  return result;
}

function daysUntil(from: CivilDate, to: CivilDate): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  );
}

export { clamp01 };
