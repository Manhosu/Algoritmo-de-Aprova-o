import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  plans,
  preparations,
  subscriptions,
  users,
} from "@/server/db/schema";

/**
 * FICHA CADASTRAL DE UM ALUNO, para o painel (README 2.6 + pedido de 02/09).
 * ============================================================================
 *
 * ⚠️ AS MÉTRICAS NÃO ESTÃO AQUI, e isso é o ponto.
 *
 * A cliente pediu para ver "praticamente tudo que o próprio aluno vê na
 * Dashboard dele". A tentação é reescrever aquelas consultas com um `userId`
 * diferente — e aí passam a existir duas implementações de "cobertura do
 * edital", que divergem no primeiro ajuste e fazem o painel contradizer a tela
 * do aluno sem ninguém perceber.
 *
 * A tela administrativa chama `getHomeData` com o id do aluno, a MESMA função
 * que a Home dele usa. O que este arquivo acrescenta é só o que a Home não tem
 * porque o aluno não precisa: dados cadastrais, plano e status da conta.
 *
 * ⚠️ ISTO É DADO PESSOAL. Nome, e-mail e WhatsApp existem aqui porque a
 * operação precisa contatar o aluno — é a finalidade declarada na Política de
 * Privacidade. A rota inteira é `requireAdmin`, e nenhum destes campos aparece
 * em tela de aluno nenhuma.
 */

export type StudentProfile = {
  id: string;
  name: string | null;
  email: string | null;
  whatsapp: string | null;
  status: string;
  createdAt: Date;
  planName: string | null;
  planCode: string | null;
  subscriptionStatus: string | null;
  /** Preparação atual, que é de onde saem todas as métricas. */
  preparation: {
    id: string;
    title: string | null;
    targetPosition: string;
    institution: string | null;
    examDate: string | null;
    status: string;
  } | null;
  /** Preparações encerradas — contexto de quem já trocou de concurso. */
  otherPreparations: number;
};

export async function getStudentProfile(userId: string): Promise<StudentProfile | null> {
  const [linha] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      whatsapp: users.whatsapp,
      status: users.status,
      createdAt: users.createdAt,
      planName: plans.name,
      planCode: plans.code,
      subscriptionStatus: subscriptions.status,
    })
    .from(users)
    .leftJoin(
      subscriptions,
      and(eq(subscriptions.userId, users.id), eq(subscriptions.status, "active")),
    )
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(users.id, userId))
    .limit(1);

  if (!linha) return null;

  const [atual] = await db
    .select({
      id: preparations.id,
      title: preparations.title,
      targetPosition: preparations.targetPosition,
      institution: preparations.institution,
      examDate: preparations.examDate,
      status: preparations.status,
    })
    .from(preparations)
    .where(
      and(
        eq(preparations.userId, userId),
        eq(preparations.isCurrent, true),
        isNull(preparations.deletedAt),
      ),
    )
    .limit(1);

  const [outras] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(preparations)
    .where(
      and(
        eq(preparations.userId, userId),
        isNull(preparations.deletedAt),
        atual ? sql`${preparations.id} <> ${atual.id}` : sql`true`,
      ),
    );

  return {
    ...linha,
    preparation: atual ?? null,
    otherPreparations: outras?.total ?? 0,
  };
}

/**
 * Os alunos, para a lista clicável.
 *
 * ⚠️ Traz o id, que a versão anterior não trazia — sem ele não há para onde
 * clicar. E traz plano e data de cadastro, que a cliente pediu para ver de
 * relance sem precisar abrir cada um.
 */
export type StudentListRow = {
  id: string;
  name: string | null;
  email: string | null;
  whatsapp: string | null;
  createdAt: Date;
  planName: string | null;
  totalXp: number;
  currentStreak: number;
  questionsAnswered: number;
  accuracyPercent: number | null;
  lastActiveDate: string | null;
};

export async function listStudentsDetailed(limit = 100): Promise<StudentListRow[]> {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      whatsapp: users.whatsapp,
      createdAt: users.createdAt,
      planName: plans.name,
      totalXp: sql<number>`coalesce((
        select total_xp from user_gamification_states g where g.user_id = ${users.id}
      ), 0)::int`,
      currentStreak: sql<number>`coalesce((
        select current_streak from user_gamification_states g where g.user_id = ${users.id}
      ), 0)::int`,
      questionsAnswered: sql<number>`(
        select count(*)::int from question_attempts a where a.user_id = ${users.id}
      )`,
      accuracyPercent: sql<number | null>`(
        select round(count(*) filter (where a.is_correct) * 100.0 / nullif(count(*), 0))::int
        from question_attempts a where a.user_id = ${users.id}
      )`,
      lastActiveDate: sql<string | null>`(
        select last_active_date from user_funnel_progress p where p.user_id = ${users.id}
      )`,
    })
    .from(users)
    .leftJoin(
      subscriptions,
      and(eq(subscriptions.userId, users.id), eq(subscriptions.status, "active")),
    )
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(users.role, "student"), eq(users.status, "active")))
    .orderBy(desc(sql`(
      select coalesce(total_xp, 0) from user_gamification_states g where g.user_id = ${users.id}
    )`))
    .limit(limit);
}
