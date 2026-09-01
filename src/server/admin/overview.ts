import "server-only";

import { and, count, desc, eq, gte, isNotNull, sql } from "drizzle-orm";

import { toStage, type FunnelStage } from "@/modules/admin/funnel";
import { db } from "@/server/db";
import {
  canonicalTopics,
  contentItems,
  questionAttempts,
  questions,
  userFunnelProgress,
  userGamificationStates,
  users,
} from "@/server/db/schema";

/**
 * O PAINEL DE VISÃO GERAL (README 2.6).
 * ============================================================================
 *
 * Ativação, retenção, monetização e operação — o funil completo de todos os
 * cadastrados.
 *
 * ⚠️ TUDO SAI DE `user_funnel_progress`, e não de contagens espalhadas.
 *
 * Aquela tabela é preenchida nos próprios eventos (cadastro, upload, primeira
 * questão) e tem UMA LINHA POR PESSOA, com pseudônimo. Recontar cada etapa a
 * partir das tabelas de origem exigiria seis varreduras grandes a cada carga do
 * painel — e daria números que divergiriam dela na primeira mudança de fluxo.
 *
 * O pseudônimo é o que permite medir sem expor: a linha sobrevive à
 * anonimização da conta, então o funil continua correto mesmo depois de alguém
 * exercer o direito de exclusão.
 */

export type AdminOverview = {
  totalSignups: number;
  activation: FunnelStage[];
  retention: FunnelStage[];
  monetization: FunnelStage[];
  operation: {
    activeStudents: number;
    publishedQuestions: number;
    contentItems: number;
    classAccuracyPercent: number | null;
  };
  /** Onde a turma mais erra. */
  hardestTopics: Array<{ name: string; errorPercent: number; answered: number }>;
};

export async function getAdminOverview(): Promise<AdminOverview> {
  const [funil, alunosAtivos, questoes, materiais, acerto, dificeis] = await Promise.all([
    db
      .select({
        total: count(),
        criouPreparacao: contar(userFunnelProgress.preparationCreatedAt),
        subiuEdital: contar(userFunnelProgress.editalUploadedAt),
        leituraOk: contar(userFunnelProgress.extractionSucceededAt),
        confirmouConteudo: contar(userFunnelProgress.contentConfirmedAt),
        fezDiagnostico: contar(userFunnelProgress.diagnosisCompletedAt),
        primeiraQuestao: contar(userFunnelProgress.firstQuestionAnsweredAt),
        primeiraRevisao: contar(userFunnelProgress.firstReviewCompletedAt),
        voltouNoDiaSeguinte: contar(userFunnelProgress.returnedNextDayAt),
        voltouNaSegundaSemana: contar(userFunnelProgress.returnedWeekTwoAt),
        completouTarefa: sql<number>`count(*) filter (where ${userFunnelProgress.completedTasksCount} > 0)::int`,
        bateuNoLimite: contar(userFunnelProgress.freeLimitFirstReachedAt),
        assinou: contar(userFunnelProgress.upgradedAt),
      })
      .from(userFunnelProgress),

    db
      .select({ total: count() })
      .from(users)
      .where(and(eq(users.role, "student"), eq(users.status, "active"))),

    db
      .select({ total: count() })
      .from(questions)
      .where(eq(questions.status, "published")),

    db.select({ total: count() }).from(contentItems),

    db
      .select({
        acerto: sql<number | null>`round(
          count(*) filter (where ${questionAttempts.isCorrect}) * 100.0 / nullif(count(*), 0)
        )::int`,
      })
      .from(questionAttempts),

    /*
      "Onde a turma mais erra" — o ranking que diz o que produzir em seguida.
      Exige amostra: um assunto com três respostas e dois erros não é uma
      dificuldade da turma, é acaso.
    */
    db
      .select({
        name: canonicalTopics.name,
        answered: count(),
        correct: sql<number>`count(*) filter (where ${questionAttempts.isCorrect})::int`,
      })
      .from(questionAttempts)
      .innerJoin(questions, eq(questions.id, questionAttempts.questionId))
      .innerJoin(canonicalTopics, eq(canonicalTopics.id, questions.canonicalTopicId))
      .groupBy(canonicalTopics.id, canonicalTopics.name)
      .having(sql`count(*) >= 20`)
      .orderBy(
        sql`count(*) filter (where ${questionAttempts.isCorrect}) * 1.0 / count(*) asc`,
      )
      .limit(8),
  ]);

  const f = funil[0];
  const total = f?.total ?? 0;
  const etapa = (label: string, valor: number) => toStage(label, valor, total);

  return {
    totalSignups: total,

    activation: [
      etapa("Criaram preparação", f?.criouPreparacao ?? 0),
      etapa("Subiram o edital", f?.subiuEdital ?? 0),
      etapa("A IA leu com sucesso", f?.leituraOk ?? 0),
      etapa("Confirmaram o conteúdo", f?.confirmouConteudo ?? 0),
      etapa("Concluíram o diagnóstico", f?.fezDiagnostico ?? 0),
      etapa("Responderam a 1ª questão", f?.primeiraQuestao ?? 0),
    ],

    retention: [
      etapa("Voltaram no dia seguinte", f?.voltouNoDiaSeguinte ?? 0),
      etapa("Voltaram na 2ª semana", f?.voltouNaSegundaSemana ?? 0),
      etapa("Completaram alguma tarefa", f?.completouTarefa ?? 0),
      etapa("Fizeram a 1ª revisão", f?.primeiraRevisao ?? 0),
    ],

    monetization: [
      etapa("Bateram no limite do Free", f?.bateuNoLimite ?? 0),
      etapa("Assinaram um plano pago", f?.assinou ?? 0),
    ],

    operation: {
      activeStudents: alunosAtivos[0]?.total ?? 0,
      publishedQuestions: questoes[0]?.total ?? 0,
      contentItems: materiais[0]?.total ?? 0,
      classAccuracyPercent: acerto[0]?.acerto ?? null,
    },

    hardestTopics: dificeis.map((t) => ({
      name: t.name,
      answered: t.answered,
      errorPercent: Math.round(((t.answered - t.correct) / t.answered) * 100),
    })),
  };
}

/** Conta quantas linhas têm a marca de tempo preenchida — uma etapa cumprida. */
function contar(coluna: Parameters<typeof isNotNull>[0]) {
  return sql<number>`count(*) filter (where ${coluna} is not null)::int`;
}

/* ========================================================================== *
 * ALUNOS
 * ========================================================================== */

export type StudentRow = {
  id: string;
  name: string | null;
  email: string | null;
  totalXp: number;
  currentStreak: number;
  questionsAnswered: number;
  accuracyPercent: number | null;
  lastActiveDate: string | null;
};

/**
 * Progresso, XP, sequência e acerto por aluno (README 2.6).
 *
 * ⚠️ Os agregados de questões vêm em SUBCONSULTA, não em join.
 *
 * Um `left join` com `question_attempts` multiplicaria a linha do aluno por
 * cada resposta dele, e `total_xp` — que é coluna, não agregado — passaria a
 * ser contado uma vez por tentativa. A subconsulta devolve um número por
 * aluno, e a linha continua sendo uma linha.
 */
export async function listStudents(limit = 50): Promise<StudentRow[]> {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      totalXp: sql<number>`coalesce(${userGamificationStates.totalXp}, 0)::int`,
      currentStreak: sql<number>`coalesce(${userGamificationStates.currentStreak}, 0)::int`,
      questionsAnswered: sql<number>`(
        select count(*)::int from ${questionAttempts}
        where ${questionAttempts.userId} = ${users.id}
      )`,
      accuracyPercent: sql<number | null>`(
        select round(
          count(*) filter (where ${questionAttempts.isCorrect}) * 100.0 / nullif(count(*), 0)
        )::int
        from ${questionAttempts} where ${questionAttempts.userId} = ${users.id}
      )`,
      lastActiveDate: userFunnelProgress.lastActiveDate,
    })
    .from(users)
    .leftJoin(userGamificationStates, eq(userGamificationStates.userId, users.id))
    .leftJoin(userFunnelProgress, eq(userFunnelProgress.userId, users.id))
    .where(and(eq(users.role, "student"), eq(users.status, "active")))
    .orderBy(desc(sql`coalesce(${userGamificationStates.totalXp}, 0)`))
    .limit(limit);
}

/** Cadastros dos últimos N dias, para a leitura de crescimento. */
export async function countRecentSignups(days = 7): Promise<number> {
  const desde = new Date(Date.now() - days * 86_400_000);

  const [row] = await db
    .select({ total: count() })
    .from(userFunnelProgress)
    .where(gte(userFunnelProgress.signedUpAt, desde));

  return row?.total ?? 0;
}
