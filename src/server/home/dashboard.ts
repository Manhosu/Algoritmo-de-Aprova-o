import "server-only";

import { and, count, eq, sql } from "drizzle-orm";

import { APP_TIMEZONE } from "@/config/app";
import { xpForQuestion, xpForReview, xpForStudy, sumXp } from "@/modules/gamification";
import { toCivilDate, type CivilDate } from "@/modules/shared/dates";
import { db } from "@/server/db";
import {
  questionAttempts,
  reviewOccurrences,
  userGamificationStates,
  xpLedger,
} from "@/server/db/schema";
import { getActiveConfig } from "@/server/engine/config";
import {
  ensureDailyTask,
  getDailyMissions,
  type DailyMissions,
} from "@/server/engine/daily-task";

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
  reviewsPending: number;
  currentStreak: number;
};

export type HomeData = {
  today: CivilDate;
  missions: DailyMissions | null;
  /** Por que não há missões, quando não há. */
  missionsSkippedReason: "no_availability" | "no_topics" | "not_active" | null;
  stats: HomeStats;
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

  const [missions, stats, xpConfig] = await Promise.all([
    generated.status === "skipped"
      ? Promise.resolve(null)
      : getDailyMissions(input.preparationId, today),
    loadStats(input.userId, today),
    getActiveConfig("xp_values"),
  ]);

  return {
    today,
    missions,
    missionsSkippedReason: generated.status === "skipped" ? generated.reason : null,
    stats,
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
  const [state, xpToday, answered, reviews] = await Promise.all([
    db.query.userGamificationStates.findFirst({
      where: (t, { eq: e }) => e(t.userId, userId),
      columns: { totalXp: true, currentStreak: true },
    }),

    db
      .select({ total: sql<number>`coalesce(sum(${xpLedger.amount}), 0)::int` })
      .from(xpLedger)
      .where(and(eq(xpLedger.userId, userId), eq(xpLedger.occurredDate, today))),

    db
      .select({ total: count() })
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
  ]);

  return {
    totalXp: state?.totalXp ?? 0,
    xpToday: xpToday[0]?.total ?? 0,
    questionsAnswered: answered[0]?.total ?? 0,
    reviewsPending: reviews[0]?.total ?? 0,
    currentStreak: state?.currentStreak ?? 0,
  };
}

/** Garante a linha de gamificação do aluno. Chamada na primeira visita à Home. */
export async function ensureGamificationState(userId: string): Promise<void> {
  await db.insert(userGamificationStates).values({ userId }).onConflictDoNothing();
}
