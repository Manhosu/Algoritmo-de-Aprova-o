import type { DailyTaskWeights } from "@/modules/engine-config/schemas";
import { daysBetween, type CivilDate } from "@/modules/shared/dates";

/**
 * MOTOR 1 — OS CINCO SINAIS
 * ============================================================================
 *
 * README 1.6: a priorização é "regra de negócio explícita, não delegar à IA —
 * precisa ser previsível e explicável".
 *
 * Cada sinal é uma função pura que devolve um número de 0 a 1, onde **1
 * significa "estude isto hoje"**. Todos apontam para o mesmo lado de propósito:
 * assim o score final é uma média ponderada simples, e a contribuição de cada
 * sinal é legível sem precisar lembrar qual deles era invertido.
 *
 * Estão em funções separadas para poderem ser testados um a um. Calibrar o
 * motor é mexer nestas cinco funções e nos pesos — e é para isso que existe a
 * suíte de testes ao lado.
 *
 * NENHUM SINAL PODE DEVOLVER NaN. Um NaN se propaga silenciosamente pela soma,
 * some na ordenação e produz uma Tarefa do Dia vazia sem erro nenhum. Todas as
 * divisões abaixo têm denominador protegido, e `clamp01` fecha a conta.
 */

export type SignalName =
  | "performance"
  | "editalWeight"
  | "urgency"
  | "recency"
  | "knowledgeGap";

export type Signals = Record<SignalName, number>;

/** Prende o valor entre 0 e 1 e neutraliza NaN. */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Valor de um sinal quando não há informação suficiente para opinar. */
export const NEUTRAL = 0.5;

/* ========================================================================== *
 * 1. DESEMPENHO (peso padrão 30%)
 * ========================================================================== */

export type PerformanceInput = {
  /** Percepção do aluno no diagnóstico. Nunca muda. */
  initialMastery: "high" | "medium" | "low" | null;
  /** 0..1 — o que o desempenho real diz. Evolui. */
  currentMasteryScore: number;
  /** 0..1 — quanto o sistema confia no score, cresce com o volume de dados. */
  masteryConfidence: number;
};

const MASTERY_FROM_DIAGNOSIS: Record<"high" | "medium" | "low", number> = {
  high: 0.8,
  medium: 0.5,
  low: 0.2,
};

/**
 * Quanto o aluno precisa de atenção neste assunto.
 *
 * A PERCEPÇÃO INICIAL PERDE PESO CONFORME O DADO REAL CHEGA
 * ----------------------------------------------------------------------------
 * É exatamente o que o aviso obrigatório da tela de diagnóstico promete: "o
 * nível informado é uma percepção inicial... será continuamente validado e
 * atualizado pelo Algoritmo conforme você resolver questões".
 *
 * Com confiança 0 (nenhuma questão respondida), vale só o diagnóstico. Com
 * confiança 1, o diagnóstico não pesa mais nada. É o que impede um erro de
 * clique no diagnóstico de acompanhar o aluno para sempre — e é o que torna
 * seguro o diagnóstico ser irreversível.
 */
export function performanceSignal(input: PerformanceInput): number {
  const confidence = clamp01(input.masteryConfidence);
  const observed = clamp01(input.currentMasteryScore);

  const declared =
    input.initialMastery === null
      ? NEUTRAL
      : MASTERY_FROM_DIAGNOSIS[input.initialMastery];

  const mastery = declared * (1 - confidence) + observed * confidence;

  // Invertido: quem domina menos precisa de mais atenção.
  return clamp01(1 - mastery);
}

/* ========================================================================== *
 * 2. PESO NO EDITAL (peso padrão 20%)
 * ========================================================================== */

export type EditalWeightInput = {
  weight: number | null;
  weightSource: "edital" | "student" | "default" | "admin";
  /** Maior peso entre os assuntos da mesma preparação. */
  maxWeightInPreparation: number;
};

/**
 * O quanto este assunto vale na prova, relativo aos outros do mesmo edital.
 *
 * Quando ninguém informou o peso (`weightSource === "default"`), o sinal é
 * NEUTRO em vez de zero. Zero afundaria o assunto na ordenação por uma
 * informação que não temos — o edital não disse que ele é irrelevante, ele
 * apenas não disse nada. Punir a ausência de informação faria o motor esconder
 * justamente os assuntos que o aluno esqueceu de preencher.
 */
export function editalWeightSignal(input: EditalWeightInput): number {
  if (input.weightSource === "default" || input.weight === null) return NEUTRAL;
  if (input.maxWeightInPreparation <= 0) return NEUTRAL;

  return clamp01(input.weight / input.maxWeightInPreparation);
}

/* ========================================================================== *
 * 3. URGÊNCIA (peso padrão 20%)
 * ========================================================================== */

export type UrgencyInput = {
  today: CivilDate;
  examDate: CivilDate | null;
  /** Data-alvo chutada pelo aluno porque o edital não marcou data. */
  examDateIsEstimated: boolean;
  /** 0..1 — o quanto deste assunto já foi coberto. */
  coverageProgress: number;
};

/** A partir daqui a prova é "longe" e a urgência satura no mínimo. */
const URGENCY_HORIZON_DAYS = 180;

/**
 * A pressão do calendário sobre este assunto.
 *
 * DUAS DECISÕES DELIBERADAS
 * ----------------------------------------------------------------------------
 * 1. Sem data de prova — ou com data apenas ESTIMADA pelo aluno — a urgência é
 *    neutra. Acelerar em cima de uma data inventada faria o motor sacrificar
 *    profundidade por velocidade com base em nada.
 *
 * 2. A urgência é modulada pela cobertura: com a prova chegando, o que ainda
 *    não foi visto é mais urgente do que o que já foi. Sem essa modulação, a
 *    urgência seria idêntica para todos os assuntos e não separaria nada — um
 *    sinal que dá o mesmo valor para tudo tem peso 20% e informação zero.
 *
 * A curva é quadrática: a urgência cresce devagar no começo e dispara no mês
 * final, que é como a pressão de uma prova realmente se comporta.
 */
export function urgencySignal(input: UrgencyInput): number {
  if (input.examDate === null || input.examDateIsEstimated) return NEUTRAL;

  const daysLeft = daysBetween(input.today, input.examDate);

  // Prova hoje ou já passada: urgência máxima. A preparação vencida é tratada
  // fora daqui (encerramento), mas o motor não pode devolver valor negativo.
  if (daysLeft <= 0) return 1;

  const proximity = clamp01(1 - daysLeft / URGENCY_HORIZON_DAYS);
  const globalUrgency = proximity * proximity;

  // O que já foi coberto pressiona menos.
  const uncovered = clamp01(1 - input.coverageProgress);

  // Piso de 30% da urgência global: mesmo o assunto já coberto continua
  // sentindo o calendário, porque revisar também compete por tempo.
  return clamp01(globalUrgency * (0.3 + 0.7 * uncovered));
}

/* ========================================================================== *
 * 4. RECÊNCIA (peso padrão 15%)
 * ========================================================================== */

export type RecencyInput = {
  today: CivilDate;
  /** Data civil do último contato com o assunto — estudo, questão ou revisão. */
  lastTouchedOn: CivilDate | null;
};

/** Em quantos dias sem contato a recência satura. */
const RECENCY_SATURATION_DAYS = 21;

/**
 * Há quanto tempo o aluno não encosta neste assunto.
 *
 * Nunca tocado devolve 1 — o máximo. Um assunto do edital que o aluno nunca
 * abriu é o caso mais extremo de "faz tempo", e tratá-lo como neutro faria o
 * motor preferir revisitar o conhecido a avançar no desconhecido.
 *
 * Este é o sinal que a revisão movimenta: concluir uma revisão atualiza o
 * último contato e rebaixa o assunto na Tarefa do Dia de amanhã. É o único
 * ponto em que o Motor 2 influencia o Motor 1 — e é uma leitura, num sentido
 * só, valendo 15% da decisão.
 */
export function recencySignal(input: RecencyInput): number {
  if (input.lastTouchedOn === null) return 1;

  const daysSince = daysBetween(input.lastTouchedOn, input.today);
  if (daysSince <= 0) return 0; // tocado hoje

  return clamp01(daysSince / RECENCY_SATURATION_DAYS);
}

/* ========================================================================== *
 * 5. LACUNAS DE CONHECIMENTO (peso padrão 15%)
 * ========================================================================== */

export type KnowledgeGapInput = {
  questionsAnswered: number;
  questionsCorrect: number;
  /** Acerto nas últimas ~20 respostas. Nulo quando não há histórico recente. */
  recentAccuracy: number | null;
};

/** Abaixo disto a amostra é pequena demais para o erro significar algo. */
const MIN_ATTEMPTS_FOR_FULL_CONFIDENCE = 15;

/**
 * O quanto o aluno erra aqui.
 *
 * Diferente do sinal de desempenho, que mistura percepção e histórico completo,
 * este olha para o ERRO OBSERVADO e dá preferência ao desempenho RECENTE. Um
 * aluno que errava muito há dois meses e vem acertando agora não tem mais uma
 * lacuna — tem uma lacuna resolvida, e insistir nela desperdiça o dia dele.
 *
 * O resultado é atenuado pelo tamanho da amostra: com 2 questões respondidas e
 * 2 erros, a taxa de erro é 100%, mas isso não é uma lacuna, é ruído. O sinal
 * caminha do neutro para a taxa real conforme as respostas se acumulam.
 */
export function knowledgeGapSignal(input: KnowledgeGapInput): number {
  const answered = Math.max(0, input.questionsAnswered);
  if (answered === 0) return NEUTRAL;

  const historicalAccuracy = clamp01(input.questionsCorrect / answered);

  // O recente vale mais: é ele que diz se a lacuna ainda existe.
  const accuracy =
    input.recentAccuracy === null
      ? historicalAccuracy
      : clamp01(input.recentAccuracy) * 0.7 + historicalAccuracy * 0.3;

  const errorRate = 1 - accuracy;
  const sampleConfidence = clamp01(answered / MIN_ATTEMPTS_FOR_FULL_CONFIDENCE);

  return clamp01(NEUTRAL * (1 - sampleConfidence) + errorRate * sampleConfidence);
}

/* ========================================================================== *
 * COMPOSIÇÃO
 * ========================================================================== */

export type PriorityBreakdown = {
  signals: Signals;
  contributions: Signals;
};

export type PriorityResult = PriorityBreakdown & { score: number };

/**
 * Combina os cinco sinais com os pesos vigentes.
 *
 * A INVARIANTE: a soma das contribuições é EXATAMENTE o score.
 *
 * É o que torna a linha de `daily_task_items` auto-verificável — se não somar,
 * o registro está corrompido e o teste denuncia. E é o que permite a tela
 * "Entenda o Algoritmo" explicar a decisão sem recalcular nada.
 *
 * `signals` guarda o valor CRU de cada sinal, antes do peso. É o que permite
 * responder meses depois "e se a urgência valesse 40%?" recalculando sobre o
 * que ficou gravado, em vez de reprocessar o histórico inteiro. Calibração
 * vira simulação.
 */
export function computePriority(signals: Signals, weights: DailyTaskWeights): PriorityResult {
  const contributions: Signals = {
    performance: signals.performance * (weights.performance / 100),
    editalWeight: signals.editalWeight * (weights.editalWeight / 100),
    urgency: signals.urgency * (weights.urgency / 100),
    recency: signals.recency * (weights.recency / 100),
    knowledgeGap: signals.knowledgeGap * (weights.knowledgeGap / 100),
  };

  const score =
    contributions.performance +
    contributions.editalWeight +
    contributions.urgency +
    contributions.recency +
    contributions.knowledgeGap;

  return { signals, contributions, score };
}

/**
 * Frase curta explicando por que o assunto caiu hoje.
 *
 * Escolhe o sinal que MAIS contribuiu — não o maior sinal cru. O que interessa
 * ao aluno é o que de fato empurrou a decisão, e um sinal alto com peso baixo
 * não empurrou.
 */
export function explainPriority(result: PriorityResult): string {
  const [dominant] = (Object.entries(result.contributions) as Array<[SignalName, number]>).sort(
    (a, b) => b[1] - a[1],
  );

  const reasons: Record<SignalName, string> = {
    performance: "você ainda não domina este assunto",
    editalWeight: "este assunto pesa muito no seu edital",
    urgency: "a prova está chegando e falta cobrir isto",
    recency: "faz tempo que você não estuda isto",
    knowledgeGap: "seus erros se concentram aqui",
  };

  return reasons[dominant[0]];
}
