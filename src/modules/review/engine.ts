import type { ReviewIntervals } from "@/modules/engine-config/schemas";
import {
  addDays,
  daysBetween,
  startOfCivilDay,
  toCivilDate,
  type CivilDate,
} from "@/modules/shared/dates";

/**
 * MOTOR 2 — REVISÃO (CURVA DO ESQUECIMENTO)
 * ============================================================================
 *
 * ⚠️ Este motor é INDEPENDENTE do Motor 1 (README 1.7, decisão fechada com a
 * cliente). Ele não conhece prioridade, não conhece peso de edital, não conhece
 * a disponibilidade do dia e não disputa espaço com a Tarefa do Dia.
 *
 * A regra de lint em `eslint.config.mjs` impede que este módulo importe o
 * `daily-task`, e vice-versa. Se um import assim aparecer, o build quebra.
 *
 * A DIFERENÇA CONCEITUAL, que é o que justifica a separação:
 *
 *   A Tarefa do Dia é uma DECISÃO tomada hoje sobre o que vale mais a pena
 *   estudar hoje. Muda quando os sinais mudam.
 *
 *   A revisão é um COMPROMISSO assumido no passado, com data marcada. Ela vence
 *   no dia em que vence, independente de desempenho, de prioridade ou de o dia
 *   estar cheio. É exatamente isso que a curva do esquecimento exige: se a
 *   revisão pudesse ser adiada por "hoje tem coisa mais importante", ela seria
 *   sempre adiada.
 *
 * Tudo aqui é função pura: recebe dados, devolve dados. Sem banco, sem
 * framework, sem relógio implícito.
 */

export type ReviewStage = {
  /** 0 = 24h, 1 = 7 dias, 2 = 30, 3 = 60, 4 = 90 (com os intervalos padrão). */
  stageIndex: number;
  intervalDays: number;
  dueDate: CivilDate;
  dueAt: Date;
};

export type ReviewOccurrenceState = {
  stageIndex: number;
  intervalDays: number;
  dueDate: CivilDate;
  status: "scheduled" | "completed" | "skipped" | "canceled";
};

/* ========================================================================== *
 * NASCIMENTO DA SÉRIE
 * ========================================================================== */

export type StartReviewSeriesInput = {
  /** Instante em que o aluno marcou o conteúdo como estudado. */
  studyCompletedAt: Date;
  intervals: ReviewIntervals;
  timeZone: string;
};

export type ReviewSeries = {
  totalStages: number;
  /** Só a primeira ocorrência nasce agendada — ver nota abaixo. */
  firstStage: ReviewStage;
  /** As datas projetadas das demais etapas, para exibição no cronograma. */
  projectedStages: ReviewStage[];
};

/**
 * Cria a série de revisões a partir de um estudo concluído.
 *
 * POR QUE SÓ A PRIMEIRA ETAPA NASCE AGENDADA
 * ----------------------------------------------------------------------------
 * As datas das etapas 2 a 5 dependem de QUANDO a etapa anterior for realmente
 * feita, não de quando ela estava prevista (decisão do Eduardo). Materializar
 * as cinco de uma vez criaria quatro datas que estarão erradas assim que o
 * aluno atrasar uma revisão — e "corrigir" essas linhas depois seria reescrever
 * o compromisso, apagando o histórico de atraso que a métrica de aderência
 * precisa.
 *
 * `projectedStages` existe para o cronograma poder DESENHAR o futuro sem que
 * essas datas virem compromisso gravado.
 */
export function startReviewSeries(input: StartReviewSeriesInput): ReviewSeries {
  const { studyCompletedAt, intervals, timeZone } = input;
  const studiedOn = toCivilDate(studyCompletedAt, timeZone);

  const stages = intervals.intervalsInDays.map((intervalDays, stageIndex) =>
    buildStage(stageIndex, intervalDays, studiedOn, timeZone),
  );

  return {
    totalStages: intervals.intervalsInDays.length,
    firstStage: stages[0],
    projectedStages: stages.slice(1),
  };
}

function buildStage(
  stageIndex: number,
  intervalDays: number,
  from: CivilDate,
  timeZone: string,
): ReviewStage {
  const dueDate = addDays(from, intervalDays);
  return {
    stageIndex,
    intervalDays,
    dueDate,
    // A revisão vence à meia-noite do dia dela no fuso do aluno, não em UTC.
    dueAt: startOfCivilDay(dueDate, timeZone),
  };
}

/* ========================================================================== *
 * CONCLUSÃO DE UMA REVISÃO
 * ========================================================================== */

export type CompleteReviewInput = {
  occurrence: Pick<ReviewOccurrenceState, "stageIndex" | "dueDate">;
  completedAt: Date;
  intervals: ReviewIntervals;
  timeZone: string;
  /** Percepção do aluno. Registrada agora, sem efeito no ciclo (Marco 1). */
  performanceRating?: "easy" | "ok" | "hard";
};

export type CompleteReviewResult = {
  completedDate: CivilDate;
  isLate: boolean;
  daysLate: number;
  /** `null` quando a série terminou. */
  nextStage: ReviewStage | null;
  seriesCompleted: boolean;
};

/**
 * Conclui uma revisão e agenda a seguinte.
 *
 * A REGRA DO ATRASO (decisão do Eduardo, 20/08/2026)
 * ----------------------------------------------------------------------------
 * O próximo intervalo conta a partir da EXECUÇÃO REAL, não da data prevista.
 *
 * Sem isso, quem revisasse com 10 dias de atraso receberia a revisão seguinte
 * imediatamente — ou até no passado, já vencida. O aluno atrasado seria punido
 * com um acúmulo instantâneo, que é o oposto do que a curva do esquecimento
 * quer: ele acabou de revisar, o conteúdo está fresco, e o intervalo tem que
 * partir de agora.
 *
 * O atraso não é perdoado nem escondido: fica registrado em `daysLate` e é o
 * que alimenta a aderência às revisões no Índice de Preparação.
 */
export function completeReview(input: CompleteReviewInput): CompleteReviewResult {
  const { occurrence, completedAt, intervals, timeZone } = input;

  const completedDate = toCivilDate(completedAt, timeZone);
  const daysLate = Math.max(0, daysBetween(occurrence.dueDate, completedDate));

  const nextIndex = occurrence.stageIndex + 1;
  const hasNext = nextIndex < intervals.intervalsInDays.length;

  const anchor = intervals.countNextFromCompletion ? completedDate : occurrence.dueDate;

  return {
    completedDate,
    isLate: daysLate > 0,
    daysLate,
    nextStage: hasNext
      ? buildStage(nextIndex, intervals.intervalsInDays[nextIndex], anchor, timeZone)
      : null,
    seriesCompleted: !hasNext,
  };
}

/* ========================================================================== *
 * A TELA "REVISÕES PARA HOJE"
 * ========================================================================== */

export type DueReview<T extends { dueDate: CivilDate; status: string }> = {
  occurrence: T;
  daysLate: number;
  isLate: boolean;
};

/**
 * Seleciona o que aparece em "Revisões para Hoje" (README 1.7).
 *
 * Inclui as vencidas em dias anteriores — a revisão atrasada ACUMULA, não some
 * (decisão do Eduardo). Uma revisão que desaparece por não ter sido feita no
 * dia certo transformaria o esquecimento em silêncio, que é justamente o
 * problema que este motor existe para combater.
 *
 * Ordem: as mais atrasadas primeiro. Quem está devendo há duas semanas precisa
 * ver isso antes do que vence hoje.
 */
export function selectDueReviews<T extends { dueDate: CivilDate; status: string }>(
  occurrences: T[],
  today: CivilDate,
): Array<DueReview<T>> {
  return occurrences
    .filter((occurrence) => occurrence.status === "scheduled")
    .filter((occurrence) => occurrence.dueDate <= today)
    .map((occurrence) => {
      const daysLate = daysBetween(occurrence.dueDate, today);
      return { occurrence, daysLate, isLate: daysLate > 0 };
    })
    .sort((a, b) => b.daysLate - a.daysLate);
}

/**
 * Quantas revisões vencem nos próximos dias.
 *
 * O cronograma usa isto para reservar tempo antes de o Motor 1 distribuir o
 * resto do dia — é assim que a revisão nunca é espremida a zero, sem que os
 * dois motores precisem se conhecer.
 */
export function countUpcomingReviews<T extends { dueDate: CivilDate; status: string }>(
  occurrences: T[],
  from: CivilDate,
  days: number,
): Map<CivilDate, number> {
  const horizon = addDays(from, days);
  const counts = new Map<CivilDate, number>();

  for (const occurrence of occurrences) {
    if (occurrence.status !== "scheduled") continue;

    // Atrasadas contam como se vencessem hoje: é quando elas aparecem na tela.
    const effectiveDate = occurrence.dueDate < from ? from : occurrence.dueDate;
    if (effectiveDate > horizon) continue;

    counts.set(effectiveDate, (counts.get(effectiveDate) ?? 0) + 1);
  }

  return counts;
}

/**
 * Estatística de aderência às revisões, para o Índice de Preparação.
 *
 * "No prazo" aqui significa no dia previsto ou antes. Revisar adiantado não é
 * penalizado — só não adianta a série, porque o próximo intervalo conta da
 * execução real de qualquer forma.
 */
export function reviewAdherence(
  completed: Array<{ daysLate: number }>,
  skipped: number,
): { total: number; onTime: number; late: number; skipped: number; percent: number } {
  const onTime = completed.filter((r) => r.daysLate === 0).length;
  const late = completed.length - onTime;
  const total = completed.length + skipped;

  return {
    total,
    onTime,
    late,
    skipped,
    // Sem nenhuma revisão devida ainda, a aderência é 100 e não 0: o aluno
    // novo não pode começar com a métrica no chão por algo que não aconteceu.
    percent: total === 0 ? 100 : Math.round((onTime / total) * 100),
  };
}
