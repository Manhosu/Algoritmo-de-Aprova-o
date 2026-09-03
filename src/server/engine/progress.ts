import "server-only";

import { desc, eq, sql } from "drizzle-orm";

import { APP_TIMEZONE } from "@/config/app";
import {
  levelProgress,
  sumXp,
  xpForQuestion,
  xpForReview,
  xpForStudy,
  type XpEntry,
} from "@/modules/gamification";
import { toCivilDate, type CivilDate } from "@/modules/shared/dates";
import { db } from "@/server/db";
import {
  coinLedger,
  levels,
  questionAttempts,
  streakDays,
  topicStates,
  userGamificationStates,
  xpLedger,
} from "@/server/db/schema";

import { getActiveConfig } from "./config";

/**
 * O QUE ACONTECE DEPOIS QUE O ALUNO FAZ ALGUMA COISA.
 * ============================================================================
 *
 * Item 9 do checklist de aceite do Marco 1: "o Cronograma Adaptativo muda
 * quando o aluno estuda ou responde questões". Este arquivo é o elo que faz
 * isso valer — sem ele, responder questão gravaria uma linha de histórico e
 * mais nada: a Tarefa do Dia continuaria priorizando um assunto já dominado, e
 * o produto pareceria não escutar.
 *
 * Três efeitos, sempre nesta ordem:
 *
 *   1. `topic_states` — a memória de trabalho dos motores;
 *   2. `xp_ledger` + `user_gamification_states` — a recompensa;
 *   3. `streak_days` — o dia entra na sequência.
 *
 * TUDO RECONSTRUÍVEL
 * ----------------------------------------------------------------------------
 * Nenhum destes é fonte da verdade. `topic_states` sai de `question_attempts` e
 * `study_logs`; o saldo de XP sai do livro-razão; a sequência sai de
 * `streak_days`, que por sua vez sai da atividade. Um contador incrementado que
 * ninguém sabe reconstruir quebra numa falha de escrita e a descoberta vem
 * meses depois, com o aluno reclamando que perdeu 27 dias de sequência.
 */

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/* ========================================================================== *
 * 1. ESTADO DO ASSUNTO
 * ========================================================================== */

/** Quantas respostas recentes entram no `recentAccuracy`. */
const RECENT_WINDOW = 20;

/**
 * Quanto de confiança cada resposta acrescenta.
 *
 * Vinte respostas levam a confiança de 0 a 1. É deliberadamente lento: o
 * diagnóstico começa com 0,15 justamente porque é opinião, e três acertos não
 * podem transformar um palpite em certeza.
 */
const CONFIDENCE_PER_ANSWER = 1 / RECENT_WINDOW;

/**
 * Atualiza o estado do assunto depois de uma resposta.
 *
 * `currentMasteryScore` é uma MÉDIA PONDERADA entre o que já se sabia e o que
 * acabou de acontecer, com o peso do novo dado crescendo conforme a confiança
 * ainda é baixa. Um aluno que se disse "alto domínio" e erra as cinco primeiras
 * é corrigido rápido; um que já respondeu duzentas não vira do avesso por causa
 * de um erro.
 */
export async function applyAttemptToTopicState(
  tx: Transaction,
  input: {
    planTopicId: string;
    isCorrect: boolean;
    answeredAt: Date;
  },
): Promise<void> {
  const [state] = await tx
    .select({
      id: topicStates.id,
      questionsAnswered: topicStates.questionsAnswered,
      questionsCorrect: topicStates.questionsCorrect,
      currentMasteryScore: topicStates.currentMasteryScore,
      masteryConfidence: topicStates.masteryConfidence,
      coverageStatus: topicStates.coverageStatus,
    })
    .from(topicStates)
    .where(eq(topicStates.planTopicId, input.planTopicId))
    .limit(1);

  // Sem linha de estado, o assunto não está numa preparação ativa — resposta no
  // banco livre sobre algo fora do edital do aluno. Grava o histórico e para.
  if (!state) return;

  const answered = state.questionsAnswered + 1;
  const correct = state.questionsCorrect + (input.isCorrect ? 1 : 0);

  const recent = await tx
    .select({ isCorrect: questionAttempts.isCorrect })
    .from(questionAttempts)
    .where(eq(questionAttempts.planTopicId, input.planTopicId))
    .orderBy(desc(questionAttempts.answeredAt))
    .limit(RECENT_WINDOW);

  const recentAccuracy =
    recent.length === 0
      ? null
      : recent.filter((row) => row.isCorrect).length / recent.length;

  /**
   * O novo dado pesa mais enquanto a confiança é baixa, e vai perdendo força.
   * Nunca menos que 5%: um assunto com histórico enorme ainda precisa poder
   * mudar de patamar quando o aluno de fato melhora.
   */
  const weight = Math.max(0.05, 1 - state.masteryConfidence);
  const observed = input.isCorrect ? 1 : 0;
  const score = state.currentMasteryScore * (1 - weight) + observed * weight;

  await tx
    .update(topicStates)
    .set({
      questionsAnswered: answered,
      questionsCorrect: correct,
      recentAccuracy,
      currentMasteryScore: clamp01(score),
      masteryConfidence: clamp01(state.masteryConfidence + CONFIDENCE_PER_ANSWER),
      lastAnsweredAt: input.answeredAt,
      // Responder questão move de "não começado" para "em andamento"; os
      // degraus seguintes dependem de estudo concluído, não de prática.
      coverageStatus:
        state.coverageStatus === "not_started" ? "in_progress" : state.coverageStatus,
      updatedAt: input.answeredAt,
    })
    .where(eq(topicStates.id, state.id));
}

/** Atualiza o estado do assunto depois de uma sessão de estudo concluída. */
export async function applyStudyToTopicState(
  tx: Transaction,
  input: { planTopicId: string; minutes: number; completedAt: Date },
): Promise<void> {
  await tx
    .update(topicStates)
    .set({
      studySessionsCount: sql`${topicStates.studySessionsCount} + 1`,
      studyMinutesTotal: sql`${topicStates.studyMinutesTotal} + ${input.minutes}`,
      lastStudiedAt: input.completedAt,
      coverageStatus: sql`case when ${topicStates.coverageStatus} = 'not_started' then 'in_progress'::coverage_status else ${topicStates.coverageStatus} end`,
      updatedAt: input.completedAt,
    })
    .where(eq(topicStates.planTopicId, input.planTopicId));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

/* ========================================================================== *
 * 2. XP
 * ========================================================================== */

/**
 * As origens que um lançamento de XP pode ter.
 *
 * ⚠️ É UMA UNIÃO FECHADA porque `source_type` faz parte do índice único que
 * garante a idempotência. Uma origem escrita à mão com outra grafia
 * ("contentItem" em vez de "content_item") criaria uma chave diferente, e o
 * mesmo material passaria a pagar duas vezes sem nada acusar.
 */
export type XpSource =
  | "question"
  | "study_log"
  | "review_occurrence"
  | "achievement"
  /** Material da biblioteca marcado como estudado, fora da Tarefa do Dia. */
  | "content_item";

/**
 * Credita XP no livro-razão e atualiza o saldo consolidado.
 *
 * A CHAVE DE IDEMPOTÊNCIA É A QUESTÃO, NÃO A TENTATIVA
 * ----------------------------------------------------------------------------
 * O índice único é `(user, activity, source_type, source_id)`. Se `source_id`
 * fosse o id da TENTATIVA, cada nova resposta traria um id novo e o índice não
 * impediria nada: responder a mesma questão dez vezes pagaria dez vezes.
 * Descoberto por `npm run verify:engine` — a versão anterior deste código
 * fazia exatamente isso.
 *
 * Com o id da QUESTÃO, o XP de participação é pago uma vez por questão. E o
 * bônus de acerto tem `activity` diferente, então quem erra na primeira e
 * acerta na segunda recebe o bônus quando acerta — que é o comportamento certo
 * para um produto de estudo: insistir num assunto difícil é o que se quer
 * premiar, não o que se quer bloquear.
 *
 * Responder de novo continua valendo para tudo o mais: atualiza o domínio do
 * assunto, consome uma questão do limite diário e entra no histórico.
 */
export async function awardXp(
  tx: Transaction,
  input: {
    userId: string;
    entries: XpEntry[];
    sourceType: XpSource;
    sourceId: string;
    engineConfigId: string | null;
    occurredAt: Date;
    occurredDate: CivilDate;
  },
): Promise<number> {
  if (input.entries.length === 0) return 0;

  const inserted = await tx
    .insert(xpLedger)
    .values(
      input.entries.map((entry) => ({
        userId: input.userId,
        activity: entry.activity,
        amount: entry.amount,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        engineConfigId: input.engineConfigId,
        occurredAt: input.occurredAt,
        occurredDate: input.occurredDate,
      })),
    )
    .onConflictDoNothing()
    .returning({ amount: xpLedger.amount });

  const total = inserted.reduce((sum, row) => sum + row.amount, 0);
  if (total === 0) return 0;

  await tx
    .insert(userGamificationStates)
    .values({ userId: input.userId, totalXp: total, lastActivityDate: input.occurredDate })
    .onConflictDoUpdate({
      target: userGamificationStates.userId,
      set: {
        totalXp: sql`${userGamificationStates.totalXp} + ${total}`,
        lastActivityDate: input.occurredDate,
        updatedAt: input.occurredAt,
      },
    });

  return total;
}

/** Traduz a atividade em lançamentos, a partir da configuração versionada. */
export async function xpEntriesFor(
  kind: "question" | "study" | "review",
  isCorrect = false,
): Promise<{ entries: XpEntry[]; engineConfigId: string | null; total: number }> {
  const config = await getActiveConfig("xp_values");

  const entries =
    kind === "question"
      ? xpForQuestion(isCorrect, config.value)
      : kind === "study"
        ? xpForStudy(config.value)
        : xpForReview(config.value);

  return { entries, engineConfigId: config.id, total: sumXp(entries) };
}

/* ========================================================================== *
 * 2b. MOEDAS
 * ========================================================================== */

/**
 * Credita moedas, pelo mesmo princípio do XP: LIVRO-RAZÃO, nunca contador.
 *
 * ⚠️ E, ao contrário do XP, moeda é SALDO — ela sai da conta quando o aluno
 * troca por algo na Loja. Por isso o `onConflictDoNothing` importa ainda mais
 * aqui: um lançamento duplicado no XP infla um número; um lançamento duplicado
 * na moeda paga um item que ninguém entregou, e não há como desfazer a entrega.
 *
 * O índice `coin_ledger_source_unique` é quem impõe isso — a cláusula abaixo só
 * transforma a violação em "nada aconteceu" em vez de erro na tela.
 */
export async function awardCoins(
  tx: Transaction,
  input: {
    userId: string;
    amount: number;
    reason: "earned_activity" | "mission_reward" | "achievement_reward";
    sourceType: string;
    sourceId: string;
    occurredAt: Date;
    occurredDate: CivilDate;
    note?: string;
  },
): Promise<number> {
  if (input.amount <= 0) return 0;

  const inserido = await tx
    .insert(coinLedger)
    .values({
      userId: input.userId,
      reason: input.reason,
      amount: input.amount,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      occurredAt: input.occurredAt,
      occurredDate: input.occurredDate,
      note: input.note ?? null,
    })
    .onConflictDoNothing()
    .returning({ amount: coinLedger.amount });

  if (inserido.length === 0) return 0;

  await tx
    .insert(userGamificationStates)
    .values({
      userId: input.userId,
      coinBalance: input.amount,
      lastActivityDate: input.occurredDate,
    })
    .onConflictDoUpdate({
      target: userGamificationStates.userId,
      set: {
        coinBalance: sql`${userGamificationStates.coinBalance} + ${input.amount}`,
        updatedAt: input.occurredAt,
      },
    });

  return input.amount;
}

/** Os valores de moeda vigentes, da configuração versionada. */
export async function coinValues() {
  const config = await getActiveConfig("coin_values");
  return config.value;
}

/* ========================================================================== *
 * 3. SEQUÊNCIA
 * ========================================================================== */

/**
 * Marca o dia como ativo e recalcula a sequência.
 *
 * A sequência é RECONSTRUÍDA a partir de `streak_days`, nunca incrementada.
 * Um contador que só sobe quebra em qualquer falha de escrita e ninguém
 * descobre até o aluno reclamar.
 */
export async function markActivity(
  tx: Transaction,
  input: {
    userId: string;
    date: CivilDate;
    kind: "questions" | "study" | "review";
    xpEarned: number;
    /** Vem da configuração versionada `coin_values`, lida pelo chamador. */
    coinsPerStreakDay: number;
    now: Date;
  },
): Promise<void> {
  const [dia] = await tx
    .insert(streakDays)
    .values({
      userId: input.userId,
      activityDate: input.date,
      hadQuestions: input.kind === "questions",
      hadStudy: input.kind === "study",
      hadReview: input.kind === "review",
      xpEarned: input.xpEarned,
    })
    .onConflictDoUpdate({
      target: [streakDays.userId, streakDays.activityDate],
      set: {
        hadQuestions:
          input.kind === "questions" ? true : sql`${streakDays.hadQuestions}`,
        hadStudy: input.kind === "study" ? true : sql`${streakDays.hadStudy}`,
        hadReview: input.kind === "review" ? true : sql`${streakDays.hadReview}`,
        xpEarned: sql`${streakDays.xpEarned} + ${input.xpEarned}`,
      },
    })
    .returning({ id: streakDays.id });

  const days = await tx
    .select({ activityDate: streakDays.activityDate })
    .from(streakDays)
    .where(eq(streakDays.userId, input.userId))
    .orderBy(desc(streakDays.activityDate))
    .limit(400);

  const current = countConsecutive(
    days.map((row) => row.activityDate as CivilDate),
    input.date,
  );

  await tx
    .insert(userGamificationStates)
    .values({
      userId: input.userId,
      currentStreak: current,
      longestStreak: current,
      lastActivityDate: input.date,
    })
    .onConflictDoUpdate({
      target: userGamificationStates.userId,
      set: {
        currentStreak: current,
        longestStreak: sql`greatest(${userGamificationStates.longestStreak}, ${current})`,
        lastActivityDate: input.date,
        updatedAt: input.now,
      },
    });

  /**
   * A moeda do dia de sequência.
   *
   * ⚠️ A CHAVE DO LANÇAMENTO É A LINHA DE `streak_days`, e é ela que faz isso
   * pagar uma vez por DIA em vez de uma vez por atividade.
   *
   * `markActivity` roda a cada questão respondida, cada estudo concluído e cada
   * revisão feita — dezenas de vezes num dia produtivo. `streak_days` tem
   * índice único em (aluno, data), então a linha é sempre a mesma dentro do dia:
   * o índice do livro-razão recusa da segunda em diante e o aluno recebe pelo
   * dia, que é o que "sequência" significa.
   *
   * O id da linha, e não a data, porque `coin_ledger.source_id` é `uuid`.
   */
  await awardCoins(tx, {
    userId: input.userId,
    amount: input.coinsPerStreakDay,
    reason: "earned_activity",
    sourceType: "streak_day",
    sourceId: dia.id,
    occurredAt: input.now,
    occurredDate: input.date,
  });
}

/**
 * Conta os dias consecutivos terminando em `today`.
 *
 * Aritmética em UTC sobre a data civil: `new Date("2026-08-23")` é um instante,
 * e somar 24 horas atravessa o horário de verão errado em metade do mundo.
 * Aqui as datas já vêm resolvidas no fuso do aluno e só andam de um em um.
 */
function countConsecutive(dates: CivilDate[], today: CivilDate): number {
  const set = new Set(dates);
  let streak = 0;
  let cursor = today;

  while (set.has(cursor)) {
    streak += 1;
    const previous = new Date(`${cursor}T00:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    cursor = previous.toISOString().slice(0, 10) as CivilDate;
  }

  return streak;
}

/* ========================================================================== *
 * NÍVEL
 * ========================================================================== */

/** O nível do aluno, a partir dos níveis da TABELA — nunca de constante. */
export async function getLevel(totalXp: number) {
  const rows = await db
    .select({
      levelNumber: levels.levelNumber,
      code: levels.code,
      name: levels.name,
      emoji: levels.emoji,
      minXp: levels.minXp,
      maxXp: levels.maxXp,
    })
    .from(levels)
    .where(eq(levels.isActive, true));

  return levelProgress(totalXp, rows);
}

/** Data civil de hoje no fuso do produto. Atalho para as chamadas acima. */
export function civilToday(now = new Date()): CivilDate {
  return toCivilDate(now, APP_TIMEZONE);
}
