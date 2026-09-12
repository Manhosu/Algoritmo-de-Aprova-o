import "server-only";

import { cache } from "react";

import { APP_TIMEZONE } from "@/config/app";
import { toCivilDate } from "@/modules/shared/dates";
import { encerrarAssinaturaVencida } from "@/server/billing/cancel";
import { db } from "@/server/db";

import { getCurrentSession, type SessionUser } from "./session";

/**
 * Contexto do aluno logado, para as telas.
 *
 * `cache()` do React deduplica a chamada DENTRO da mesma requisição: o layout,
 * o cabeçalho e a página pedem o mesmo dado e o banco é consultado uma vez só.
 * Sem isso, uma página com três componentes que precisam do usuário faz três
 * viagens idênticas ao Postgres.
 */

export type StudentContext = {
  user: SessionUser;
  today: string;
  /** Preparação que o aluno está vendo. Nulo antes de criar a primeira. */
  currentPreparation: {
    id: string;
    title: string;
    targetPosition: string;
    status:
      | "draft"
      | "extracting"
      | "review_pending"
      | "diagnosis_pending"
      | "active"
      | "archived"
      | "failed";
    examDate: string | null;
    examDateIsEstimated: boolean;
  } | null;
  /** Falso enquanto o aluno não informou tempo de estudo. */
  hasAvailability: boolean;
  gamification: {
    totalXp: number;
    currentStreak: number;
    longestStreak: number;
  };
};

export const getStudentContext = cache(async (): Promise<StudentContext | null> => {
  const session = await getCurrentSession();
  if (!session) return null;

  const userId = session.user.id;

  /*
    ⚠️ ASSINATURA CANCELADA PELO ALUNO SÓ CAI QUANDO O PERÍODO PAGO ACABA, e é
    aqui que ela cai.

    O projeto não tem job agendado. A primeira visita depois do vencimento
    aplica o fim: uma consulta indexada por requisição, e uma escrita por
    assinatura, no dia em que ela vence. Falhar aqui não pode derrubar a tela —
    o pior caso é o acesso durar uma visita a mais.
  */
  await encerrarAssinaturaVencida(userId).catch((erro) =>
    console.error("[assinatura] falha ao encerrar assinatura vencida", erro),
  );

  const [preparation, availability, gamification] = await Promise.all([
    db.query.preparations.findFirst({
      where: (t, { and, eq, isNull }) =>
        and(eq(t.userId, userId), eq(t.isCurrent, true), isNull(t.deletedAt)),
      columns: {
        id: true,
        title: true,
        targetPosition: true,
        status: true,
        examDate: true,
        examDateIsEstimated: true,
      },
    }),
    db.query.userAvailability.findFirst({
      where: (t, { and, eq, gt }) => and(eq(t.userId, userId), gt(t.minutesAvailable, 0)),
      columns: { id: true },
    }),
    db.query.userGamificationStates.findFirst({
      where: (t, { eq }) => eq(t.userId, userId),
      /*
        `longestStreak` vem junto porque está na MESMA linha já lida — o Perfil
        mostra "recorde: N dias" e uma consulta a mais para buscar um inteiro
        que já veio seria desperdício puro.
      */
      columns: { totalXp: true, currentStreak: true, longestStreak: true },
    }),
  ]);

  return {
    user: session.user,
    today: toCivilDate(new Date(), session.user.timezone || APP_TIMEZONE),
    currentPreparation: preparation
      ? {
          id: preparation.id,
          title: preparation.title ?? preparation.targetPosition,
          targetPosition: preparation.targetPosition,
          status: preparation.status,
          examDate: preparation.examDate,
          examDateIsEstimated: preparation.examDateIsEstimated,
        }
      : null,
    hasAvailability: Boolean(availability),
    gamification: {
      totalXp: gamification?.totalXp ?? 0,
      currentStreak: gamification?.currentStreak ?? 0,
      longestStreak: gamification?.longestStreak ?? 0,
    },
  };
});
