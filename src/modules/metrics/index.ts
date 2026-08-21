import type { PreparationIndexConfig } from "@/modules/engine-config/schemas";
import { daysBetween, type CivilDate } from "@/modules/shared/dates";

/**
 * MÉTRICAS DO DASHBOARD
 * ============================================================================
 *
 * Tudo aqui é função pura sobre dados já agregados. As consultas ficam no
 * servidor; as REGRAS ficam aqui, onde podem ser testadas.
 *
 * A separação importa porque várias destas métricas têm regras que são fáceis
 * de implementar errado de um jeito que ninguém percebe — um gráfico que cai
 * quando não devia, uma média que mente com amostra pequena, um índice que
 * começa em zero e desanima o aluno no primeiro dia.
 */

/* ========================================================================== *
 * GRÁFICO DE EVOLUÇÃO — a regra crítica do README
 * ========================================================================== */

export type DailyRollup = {
  rollupDate: CivilDate;
  questionsAnswered: number;
  questionsCorrect: number;
};

export type EvolutionPoint = { date: CivilDate; accuracyPercent: number; answered: number };

/**
 * Série do gráfico de evolução (README 2.1).
 *
 * ⚠️ REGRA CRÍTICA: "no dia em que o aluno não responder questões, o gráfico
 * NÃO cai — simplesmente NÃO EXISTE PONTO naquele dia. Não plotar zero."
 *
 * O modelo já ajuda: `daily_user_rollups` só tem linha em dia com atividade.
 * Mas dias com atividade que NÃO é questão (só estudo, só revisão) geram linha
 * com `questionsAnswered = 0` — e é exatamente aí que o zero entraria no
 * gráfico sem ninguém notar.
 *
 * Este filtro é a segunda trava. O front consome esta função e não os rollups
 * crus, para a regra não depender de alguém lembrar dela.
 */
export function buildEvolutionSeries(rollups: DailyRollup[]): EvolutionPoint[] {
  return rollups
    .filter((rollup) => rollup.questionsAnswered > 0)
    .map((rollup) => ({
      date: rollup.rollupDate,
      accuracyPercent: Math.round((rollup.questionsCorrect / rollup.questionsAnswered) * 100),
      answered: rollup.questionsAnswered,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/* ========================================================================== *
 * HORÁRIO DE OURO
 * ========================================================================== */

export type HourBucket = { hour: number; answered: number; correct: number };

export type GoldenHour = {
  /** Faixa de 3 horas com melhor rendimento. Nulo sem dados suficientes. */
  startHour: number | null;
  endHour: number | null;
  accuracyPercent: number | null;
  /** Quantas respostas sustentam a conclusão. */
  sampleSize: number;
  /** Falso quando ainda não há dados para afirmar nada. */
  isReliable: boolean;
};

/** Abaixo disto, apontar um "horário de ouro" é chute com cara de dado. */
const GOLDEN_HOUR_MIN_SAMPLE = 30;
const GOLDEN_HOUR_MIN_PER_WINDOW = 10;
const GOLDEN_HOUR_WINDOW = 3;

/**
 * Identifica a faixa de horário de maior rendimento do aluno (README 2.1).
 *
 * DUAS DECISÕES QUE EVITAM UMA MÉTRICA MENTIROSA
 * ----------------------------------------------------------------------------
 * 1. Usa uma JANELA DE 3 HORAS, não uma hora isolada. Com hora isolada, um
 *    aluno que respondeu 2 questões às 5h da manhã e acertou as duas teria
 *    "5h" como horário de ouro para sempre.
 *
 * 2. Exige amostra mínima e devolve `isReliable: false` quando não tem.
 *    A tela mostra "ainda calculando" em vez de um número inventado — porque
 *    um horário de ouro errado faz o aluno reorganizar a vida à toa.
 */
export function computeGoldenHour(buckets: HourBucket[]): GoldenHour {
  const total = buckets.reduce((sum, b) => sum + b.answered, 0);

  const insufficient: GoldenHour = {
    startHour: null,
    endHour: null,
    accuracyPercent: null,
    sampleSize: total,
    isReliable: false,
  };

  if (total < GOLDEN_HOUR_MIN_SAMPLE) return insufficient;

  const byHour = new Map(buckets.map((b) => [b.hour, b]));
  let best: { start: number; accuracy: number; answered: number } | null = null;

  for (let start = 0; start < 24; start++) {
    /**
     * A janela precisa COMEÇAR numa hora em que o aluno de fato respondeu.
     *
     * Sem esta checagem, a janela 5h–8h vence a 6h–9h quando o aluno só
     * estudou às 6h e 7h: a média das duas horas é maior, e o resultado
     * anuncia "seu horário de ouro começa às 5h" para alguém que nunca abriu
     * o app às 5h. É uma afirmação falsa sobre a rotina da pessoa.
     */
    const startBucket = byHour.get(start);
    if (!startBucket || startBucket.answered === 0) continue;

    let answered = 0;
    let correct = 0;
    for (let offset = 0; offset < GOLDEN_HOUR_WINDOW; offset++) {
      const bucket = byHour.get((start + offset) % 24);
      if (bucket) {
        answered += bucket.answered;
        correct += bucket.correct;
      }
    }

    if (answered < GOLDEN_HOUR_MIN_PER_WINDOW) continue;

    const accuracy = correct / answered;
    // Empate resolvido pela amostra maior: a faixa mais praticada é a
    // conclusão mais confiável.
    if (
      best === null ||
      accuracy > best.accuracy ||
      (accuracy === best.accuracy && answered > best.answered)
    ) {
      best = { start, accuracy, answered };
    }
  }

  if (best === null) return insufficient;

  return {
    startHour: best.start,
    endHour: (best.start + GOLDEN_HOUR_WINDOW) % 24,
    accuracyPercent: Math.round(best.accuracy * 100),
    sampleSize: total,
    isReliable: true,
  };
}

/* ========================================================================== *
 * COBERTURA DO EDITAL
 * ========================================================================== */

export type TopicCoverage = {
  planTopicId: string;
  coverageStatus: "not_started" | "in_progress" | "studied" | "mastered";
  weight: number | null;
};

export type Coverage = {
  totalTopics: number;
  startedTopics: number;
  studiedTopics: number;
  /** Simples: proporção de assuntos. */
  percent: number;
  /** Ponderada pelo peso no edital — o que de fato importa para a prova. */
  weightedPercent: number;
};

/**
 * Cobertura do edital, para o gráfico circular da Home.
 *
 * Devolve as DUAS leituras de propósito. A simples é a que o aluno entende
 * ("cobri 40% dos assuntos"); a ponderada é a honesta ("mas eles valem 15% da
 * prova"). Mostrar só a simples faria um aluno que varreu os assuntos leves
 * achar que está adiantado.
 *
 * O denominador são TODOS os assuntos ativos do edital, mapeados ou não. Contar
 * só os mapeados faria a cobertura subir quando o casamento falhasse — a
 * métrica melhoraria justamente quando o produto piora.
 */
export function computeCoverage(topics: TopicCoverage[]): Coverage {
  const total = topics.length;
  if (total === 0) {
    return { totalTopics: 0, startedTopics: 0, studiedTopics: 0, percent: 0, weightedPercent: 0 };
  }

  const progressOf = (status: TopicCoverage["coverageStatus"]) =>
    status === "mastered" ? 1 : status === "studied" ? 1 : status === "in_progress" ? 0.5 : 0;

  const started = topics.filter((t) => t.coverageStatus !== "not_started").length;
  const studied = topics.filter(
    (t) => t.coverageStatus === "studied" || t.coverageStatus === "mastered",
  ).length;

  const simpleProgress = topics.reduce((sum, t) => sum + progressOf(t.coverageStatus), 0);

  const totalWeight = topics.reduce((sum, t) => sum + (t.weight ?? 1), 0);
  const coveredWeight = topics.reduce(
    (sum, t) => sum + progressOf(t.coverageStatus) * (t.weight ?? 1),
    0,
  );

  return {
    totalTopics: total,
    startedTopics: started,
    studiedTopics: studied,
    percent: Math.round((simpleProgress / total) * 100),
    weightedPercent: totalWeight === 0 ? 0 : Math.round((coveredWeight / totalWeight) * 100),
  };
}

/* ========================================================================== *
 * COBERTURA DO ACERVO
 * ========================================================================== */

export type TopicMaterialStatus = {
  planTopicId: string;
  /** Falso quando o assunto não casou com o catálogo — não há como ter material. */
  isMapped: boolean;
  questionCount: number;
  contentCount: number;
};

export type CatalogCoverage = {
  totalTopics: number;
  /** Assuntos com pelo menos uma questão OU um material publicado. */
  readyTopics: number;
  inProductionTopics: number;
  readyPercent: number;
  inProductionPercent: number;
  /** Quantos ainda não casaram com o catálogo — subconjunto de "em produção". */
  unmappedTopics: number;
};

/**
 * Quanto do edital do aluno já tem material disponível (ideia da cliente,
 * 21/08/2026).
 *
 * A intenção é de retenção: o aluno vê que 80% do edital dele já tem material e
 * que os 20% restantes estão sendo produzidos, em vez de encontrar assuntos
 * vazios e concluir que a plataforma é incompleta.
 *
 * ⚠️ ISSO É UMA PROMESSA, NÃO SÓ UM NÚMERO.
 * Dizer "20% em produção" compromete a operação a produzir aqueles 20%. Se o
 * material nunca chega, o número deixa de ser expectativa e vira evidência de
 * abandono — pior do que não mostrar nada. Quem liga esta métrica assume o
 * compromisso de mover o ponteiro.
 *
 * "Tem material" é definido de forma deliberadamente generosa: basta UMA
 * questão ou UM item de conteúdo. Exigir o conjunto completo faria quase todo
 * assunto aparecer como vazio no começo da operação, que é justo quando o aluno
 * mais precisa de sinal positivo.
 *
 * Os percentuais são calculados para SOMAR 100 exatamente. Arredondar os dois
 * separadamente produz "80% + 21%", que é o tipo de detalhe que faz o aluno
 * desconfiar do resto dos números.
 */
export function computeCatalogCoverage(topics: TopicMaterialStatus[]): CatalogCoverage {
  const total = topics.length;

  if (total === 0) {
    return {
      totalTopics: 0,
      readyTopics: 0,
      inProductionTopics: 0,
      readyPercent: 0,
      inProductionPercent: 0,
      unmappedTopics: 0,
    };
  }

  const ready = topics.filter(
    (topic) => topic.isMapped && (topic.questionCount > 0 || topic.contentCount > 0),
  ).length;

  const readyPercent = Math.round((ready / total) * 100);

  return {
    totalTopics: total,
    readyTopics: ready,
    inProductionTopics: total - ready,
    readyPercent,
    // O complemento, não um segundo arredondamento: garante a soma em 100.
    inProductionPercent: 100 - readyPercent,
    unmappedTopics: topics.filter((topic) => !topic.isMapped).length,
  };
}

/* ========================================================================== *
 * LACUNAS
 * ========================================================================== */

export type TopicPerformance = {
  planTopicId: string;
  topicName: string;
  subjectName: string;
  questionsAnswered: number;
  questionsCorrect: number;
};

export type Gap = {
  planTopicId: string;
  topicName: string;
  subjectName: string;
  errorPercent: number;
  answered: number;
};

/** Amostra mínima para um assunto poder ser chamado de lacuna. */
const GAP_MIN_ATTEMPTS = 5;

/**
 * Assuntos com maior percentual de erro (README 2.1).
 *
 * O piso de amostra é o que separa lacuna de azar. Sem ele, o topo do card
 * seria sempre o assunto em que o aluno respondeu uma questão e errou — 100%
 * de erro, zero informação. O aluno reorganizaria o estudo em cima de ruído.
 */
export function findGaps(topics: TopicPerformance[], limit = 5): Gap[] {
  return topics
    .filter((topic) => topic.questionsAnswered >= GAP_MIN_ATTEMPTS)
    .map((topic) => ({
      planTopicId: topic.planTopicId,
      topicName: topic.topicName,
      subjectName: topic.subjectName,
      errorPercent: Math.round(
        ((topic.questionsAnswered - topic.questionsCorrect) / topic.questionsAnswered) * 100,
      ),
      answered: topic.questionsAnswered,
    }))
    .filter((gap) => gap.errorPercent > 0)
    .sort((a, b) => {
      if (b.errorPercent !== a.errorPercent) return b.errorPercent - a.errorPercent;
      // Empate: quem respondeu mais tem a conclusão mais sólida.
      return b.answered - a.answered;
    })
    .slice(0, limit);
}

/* ========================================================================== *
 * ÍNDICE DE PREPARAÇÃO
 * ========================================================================== */

export type PreparationIndexInput = {
  coveragePercent: number;
  accuracyPercent: number;
  reviewAdherencePercent: number;
  taskCompletionPercent: number;
  config: PreparationIndexConfig;
};

export type PreparationIndex = {
  value: number;
  label: string;
  breakdown: {
    coverage: number;
    accuracy: number;
    reviewAdherence: number;
    taskCompletion: number;
  };
};

/**
 * Índice de Preparação (README 2.1).
 *
 * ⚠️ "Índice de Preparação", nunca "Índice de Aprovação" — decisão fechada com
 * a cliente. Os rótulos descrevem ESTADO DA PREPARAÇÃO e nenhum sugere
 * probabilidade de passar. Prometer aprovação é promessa que não temos como
 * cumprir, e o card foi renomeado justamente por isso.
 *
 * A invariante é a mesma do motor: a soma do breakdown é o valor.
 */
export function computePreparationIndex(input: PreparationIndexInput): PreparationIndex {
  const { weights } = input.config;

  const breakdown = {
    coverage: clampPercent(input.coveragePercent) * (weights.coverage / 100),
    accuracy: clampPercent(input.accuracyPercent) * (weights.accuracy / 100),
    reviewAdherence:
      clampPercent(input.reviewAdherencePercent) * (weights.reviewAdherence / 100),
    taskCompletion: clampPercent(input.taskCompletionPercent) * (weights.taskCompletion / 100),
  };

  const raw =
    breakdown.coverage + breakdown.accuracy + breakdown.reviewAdherence + breakdown.taskCompletion;
  const value = Math.round(raw);

  return { value, label: labelFor(value, input.config), breakdown };
}

function labelFor(value: number, config: PreparationIndexConfig): string {
  const band = config.bands.find((b) => value >= b.min && value <= b.max);
  // As faixas cobrem 0–100 sem buraco (garantido pelo schema Zod), então isto
  // só acontece com configuração corrompida — melhor um rótulo neutro do que
  // um card vazio.
  return band?.label ?? config.bands[0].label;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 100 ? 100 : value;
}

/* ========================================================================== *
 * MELHOR TÉCNICA DE ESTUDO
 * ========================================================================== */

export type TechniqueSample = {
  technique: string;
  /** Questões respondidas na prática que veio logo depois deste estudo. */
  attempts: number;
  correct: number;
};

export type BestTechnique = {
  technique: string | null;
  accuracyPercent: number | null;
  sampleSize: number;
  isReliable: boolean;
  /** Todas as técnicas medidas, ordenadas — para o painel de calibração. */
  ranking: Array<{ technique: string; accuracyPercent: number; attempts: number }>;
};

/**
 * Melhor técnica de estudo (README 2.1).
 *
 * O DADO SÓ EXISTE PORQUE A TÉCNICA É PRESCRITA
 * ----------------------------------------------------------------------------
 * Esta métrica compara o desempenho na prática que veio logo depois de cada
 * estudo, dentro do mesmo bloco. Ela só significa alguma coisa porque o sistema
 * alterna as técnicas no mesmo assunto: se o aluno escolhesse, a comparação
 * mediria a dificuldade dos assuntos, não a eficácia das técnicas.
 *
 * `minAttempts` vem da configuração (`study_techniques`), porque quanto de
 * amostra basta é exatamente o tipo de coisa que a operação vai querer ajustar
 * sem deploy.
 */
export function findBestTechnique(
  samples: TechniqueSample[],
  minAttempts: number,
): BestTechnique {
  const totals = new Map<string, { attempts: number; correct: number }>();

  for (const sample of samples) {
    const current = totals.get(sample.technique) ?? { attempts: 0, correct: 0 };
    current.attempts += sample.attempts;
    current.correct += sample.correct;
    totals.set(sample.technique, current);
  }

  const ranking = [...totals.entries()]
    .filter(([, t]) => t.attempts >= minAttempts)
    .map(([technique, t]) => ({
      technique,
      accuracyPercent: Math.round((t.correct / t.attempts) * 100),
      attempts: t.attempts,
    }))
    .sort((a, b) => {
      if (b.accuracyPercent !== a.accuracyPercent) return b.accuracyPercent - a.accuracyPercent;
      return b.attempts - a.attempts;
    });

  const sampleSize = [...totals.values()].reduce((sum, t) => sum + t.attempts, 0);

  // Uma técnica só não é comparação: precisa de pelo menos duas para haver
  // uma "melhor".
  if (ranking.length < 2) {
    return { technique: null, accuracyPercent: null, sampleSize, isReliable: false, ranking };
  }

  return {
    technique: ranking[0].technique,
    accuracyPercent: ranking[0].accuracyPercent,
    sampleSize,
    isReliable: true,
    ranking,
  };
}

/* ========================================================================== *
 * CONTAGEM REGRESSIVA
 * ========================================================================== */

export type ExamCountdown = {
  daysLeft: number | null;
  label: string;
  isPast: boolean;
};

/** "Faltam X dias para a prova" (README 2.1). */
export function examCountdown(
  today: CivilDate,
  examDate: CivilDate | null,
  isEstimated: boolean,
): ExamCountdown {
  if (examDate === null) {
    return { daysLeft: null, label: "Data da prova ainda não definida", isPast: false };
  }

  const daysLeft = daysBetween(today, examDate);

  if (daysLeft < 0) return { daysLeft, label: "A prova já aconteceu", isPast: true };
  if (daysLeft === 0) return { daysLeft: 0, label: "A prova é hoje", isPast: false };

  const suffix = isEstimated ? " (data estimada)" : "";
  const label =
    daysLeft === 1 ? `Falta 1 dia para a prova${suffix}` : `Faltam ${daysLeft} dias para a prova${suffix}`;

  return { daysLeft, label, isPast: false };
}
