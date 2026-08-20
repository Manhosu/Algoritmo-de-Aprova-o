import type { XpValues } from "@/modules/engine-config/schemas";
import { addDays, daysBetween, type CivilDate } from "@/modules/shared/dates";

/**
 * GAMIFICAÇÃO — XP, NÍVEIS, STREAK E MISSÕES (README 2.3)
 * ============================================================================
 *
 * Marco 2 no papel; escrito agora porque tudo aqui é consequência de eventos
 * que o Marco 1 já produz — questão respondida, estudo concluído, revisão
 * feita. Deixar para setembro significaria ou perder o XP de agosto ou
 * reprocessá-lo com regras que ninguém mais lembraria.
 *
 * Nenhuma constante de XP mora aqui: todos os valores vêm da configuração
 * versionada (`engine_configs`, tipo `xp_values`), que o painel edita sem
 * deploy. As funções recebem a configuração por parâmetro.
 */

export type XpActivity =
  | "study_completed"
  | "question_answered"
  | "question_correct_bonus"
  | "streak_day"
  | "daily_goal_completed"
  | "review_completed"
  | "mission_completed"
  | "achievement_unlocked"
  | "admin_adjustment";

export type XpEntry = { activity: XpActivity; amount: number };

/**
 * XP de uma resposta de questão.
 *
 * ⚠️ REGRA DO README 2.3: "acertar vale mais que apenas responder". Responder
 * paga o valor base; acertar paga base + bônus.
 *
 * Devolve DUAS entradas quando acerta, não uma soma. O livro-razão precisa
 * distinguir o que foi participação do que foi acerto — sem isso, "quanto do
 * meu XP veio de acertar?" não teria resposta, e um estorno de questão anulada
 * não saberia o que devolver.
 */
export function xpForQuestion(isCorrect: boolean, values: XpValues): XpEntry[] {
  const entries: XpEntry[] = [
    { activity: "question_answered", amount: values.questionAnswered },
  ];

  if (isCorrect) {
    entries.push({ activity: "question_correct_bonus", amount: values.correctBonus });
  }

  return entries;
}

export function xpForStudy(values: XpValues): XpEntry[] {
  return [{ activity: "study_completed", amount: values.studyCompleted }];
}

export function xpForReview(values: XpValues): XpEntry[] {
  return [{ activity: "review_completed", amount: values.reviewCompleted }];
}

export function xpForStreakDay(values: XpValues): XpEntry[] {
  return [{ activity: "streak_day", amount: values.streakDay }];
}

export function xpForDailyGoal(values: XpValues): XpEntry[] {
  return [{ activity: "daily_goal_completed", amount: values.dailyGoalCompleted }];
}

export function sumXp(entries: XpEntry[]): number {
  return entries.reduce((total, entry) => total + entry.amount, 0);
}

/* ========================================================================== *
 * NÍVEIS
 * ========================================================================== */

export type Level = {
  levelNumber: number;
  code: string;
  name: string;
  emoji: string | null;
  minXp: number;
  /** Nulo no último nível — é o que faz "10.000+" funcionar sem número mágico. */
  maxXp: number | null;
};

export type LevelProgress = {
  current: Level;
  next: Level | null;
  xpIntoLevel: number;
  xpToNextLevel: number | null;
  /** 0..100 — a barra de progresso da Home. */
  percentToNext: number;
};

/**
 * Em que nível o aluno está e quanto falta para o próximo.
 *
 * Os níveis vêm da TABELA `levels`, não de constante: os nomes já mudaram uma
 * vez neste projeto (o mockup dizia "NÍVEL 4 AVANÇADO") e vão mudar de novo.
 *
 * No último nível `xpToNextLevel` é nulo e a barra fica em 100 — não existe
 * "próximo", e mostrar uma barra vazia ali pareceria regressão.
 */
export function levelProgress(totalXp: number, levels: Level[]): LevelProgress {
  if (levels.length === 0) {
    throw new Error(
      "Nenhum nível configurado. O seed cria os cinco níveis do README; " +
        "sem eles a Home não tem o que exibir.",
    );
  }

  const ordered = [...levels].sort((a, b) => a.minXp - b.minXp);
  const xp = Math.max(0, totalXp);

  let current = ordered[0];
  for (const level of ordered) {
    if (xp >= level.minXp) current = level;
    else break;
  }

  const next = ordered.find((level) => level.minXp > current.minXp) ?? null;
  const xpIntoLevel = xp - current.minXp;

  if (next === null) {
    return { current, next: null, xpIntoLevel, xpToNextLevel: null, percentToNext: 100 };
  }

  const span = next.minXp - current.minXp;
  const xpToNextLevel = next.minXp - xp;

  return {
    current,
    next,
    xpIntoLevel,
    xpToNextLevel,
    percentToNext: span <= 0 ? 100 : Math.min(100, Math.round((xpIntoLevel / span) * 100)),
  };
}

/* ========================================================================== *
 * STREAK
 * ========================================================================== */

export type StreakState = {
  current: number;
  longest: number;
  lastActivityDate: CivilDate | null;
  /** Verdadeiro quando o aluno ainda não estudou hoje e a sequência vai cair. */
  atRisk: boolean;
  /** Os 7 dias da semana marcados, para os pontinhos do card. */
  weekDots: Array<{ date: CivilDate; active: boolean }>;
};

/**
 * Calcula a sequência a partir dos dias com atividade.
 *
 * RECONSTRUÍDA A PARTIR DOS DIAS, NUNCA INCREMENTADA
 * ----------------------------------------------------------------------------
 * Um contador que só sobe quebra em qualquer falha de escrita — e ninguém
 * descobre até o aluno reclamar que perdeu 27 dias de sequência. Recalcular a
 * partir de `streak_days` custa uma varredura curta e é sempre correto.
 *
 * A sequência continua viva se a última atividade foi HOJE ou ONTEM. Exigir
 * atividade hoje zeraria o streak de todo mundo às 00h01, antes de a pessoa ter
 * tido chance de estudar.
 */
export function computeStreak(
  activityDates: CivilDate[],
  today: CivilDate,
): StreakState {
  const unique = [...new Set(activityDates)].sort();

  const weekDots = buildWeekDots(unique, today);

  if (unique.length === 0) {
    return { current: 0, longest: 0, lastActivityDate: null, atRisk: false, weekDots };
  }

  // Maior sequência histórica.
  let longest = 1;
  let run = 1;
  for (let i = 1; i < unique.length; i++) {
    if (daysBetween(unique[i - 1], unique[i]) === 1) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }

  const last = unique[unique.length - 1];
  const daysSinceLast = daysBetween(last, today);

  // Sequência quebrada: última atividade há mais de um dia.
  if (daysSinceLast > 1) {
    return { current: 0, longest, lastActivityDate: last, atRisk: false, weekDots };
  }

  // Conta para trás a partir da última atividade.
  let current = 1;
  for (let i = unique.length - 1; i > 0; i--) {
    if (daysBetween(unique[i - 1], unique[i]) === 1) current += 1;
    else break;
  }

  return {
    current,
    longest: Math.max(longest, current),
    lastActivityDate: last,
    // Estudou ontem mas ainda não hoje: a sequência cai à meia-noite.
    atRisk: daysSinceLast === 1,
    weekDots,
  };
}

function buildWeekDots(
  activityDates: CivilDate[],
  today: CivilDate,
): Array<{ date: CivilDate; active: boolean }> {
  const active = new Set(activityDates);
  const dots: Array<{ date: CivilDate; active: boolean }> = [];

  for (let offset = 6; offset >= 0; offset--) {
    const date = addDays(today, -offset);
    dots.push({ date, active: active.has(date) });
  }

  return dots;
}

/* ========================================================================== *
 * MISSÕES DO DIA
 * ========================================================================== */

export type MissionDefinition = {
  missionId: string;
  code: string;
  name: string;
  targetType: string;
  targetValue: number;
  xpReward: number;
  coinReward: number;
};

export type MissionProgress = {
  missionId: string;
  name: string;
  progress: number;
  target: number;
  percent: number;
  completed: boolean;
  xpReward: number;
};

export type DailyProgressCounters = Record<string, number>;

/**
 * Progresso das Missões do Dia (README 2.1: "3/5 concluídas").
 *
 * `targetValue` é copiado da definição para a linha do aluno no momento em que
 * a missão é atribuída — se a operação mudar a meta de 10 para 20 questões no
 * meio do dia, quem já estava em 10/10 não pode voltar a 10/20.
 */
export function computeMissionProgress(
  missions: MissionDefinition[],
  counters: DailyProgressCounters,
): { missions: MissionProgress[]; completedCount: number; totalXpAvailable: number } {
  const progress = missions.map((mission) => {
    const value = Math.max(0, counters[mission.targetType] ?? 0);
    const target = Math.max(1, mission.targetValue);
    const completed = value >= target;

    return {
      missionId: mission.missionId,
      name: mission.name,
      progress: Math.min(value, target),
      target,
      percent: Math.min(100, Math.round((value / target) * 100)),
      completed,
      xpReward: mission.xpReward,
    };
  });

  return {
    missions: progress,
    completedCount: progress.filter((m) => m.completed).length,
    totalXpAvailable: missions.reduce((sum, m) => sum + m.xpReward, 0),
  };
}

/* ========================================================================== *
 * SALDOS
 * ========================================================================== */

/**
 * Saldo a partir do livro-razão.
 *
 * Somar o ledger, e não guardar um contador, é o que permite auditar
 * ("por que eu tenho 5.740 XP?"), estornar sem corromper histórico e
 * recalcular depois de uma mudança nos valores de XP.
 */
export function balanceFromLedger(entries: Array<{ amount: number }>): number {
  return entries.reduce((total, entry) => total + entry.amount, 0);
}

/**
 * Chave de idempotência de um lançamento.
 *
 * O índice único de `xp_ledger` usa (userId, activity, sourceType, sourceId).
 * Esta função monta a mesma chave do lado da aplicação, para o serviço poder
 * detectar a repetição antes de bater no banco — uma requisição repetida não
 * pode pagar o mesmo acerto duas vezes.
 */
export function xpIdempotencyKey(
  userId: string,
  activity: XpActivity,
  sourceType: string,
  sourceId: string,
): string {
  return `${userId}:${activity}:${sourceType}:${sourceId}`;
}
