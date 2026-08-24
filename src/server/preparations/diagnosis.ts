import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  diagnosticResponses,
  diagnostics,
  preparations,
  studyPlanSubjects,
  studyPlanTopics,
  topicStates,
} from "@/server/db/schema";

import { markFunnelStage, recordEvent } from "./service";

/**
 * PASSO 5 DO FLUXO DO "+": O DIAGNÓSTICO INICIAL.
 * ============================================================================
 *
 * README 1.5. Duas decisões da cliente (20/08/2026) moldam tudo aqui:
 *
 * 1. O diagnóstico é SÓ NO NÍVEL DE DISCIPLINA, com propagação para os assuntos.
 *    Um edital real tem de 150 a 300 assuntos; pedir três cliques em cada um é
 *    o maior candidato a abandono do funil inteiro. São 10 a 15 disciplinas.
 *
 * 2. Ele NÃO pode ser refeito. Palavras dela: "para não interferir nas métricas
 *    do andamento do estudo depois". Está certo — se o aluno pudesse reescrever
 *    a percepção inicial, o ponto de partida das métricas mudaria
 *    retroativamente e "evoluí quanto?" deixaria de ter resposta.
 *
 * A trava não prende ninguém a um erro de clique, e é isso que o aviso
 * obrigatório da tela promete: `initial_mastery` é a percepção e nunca muda;
 * `current_mastery_score` é o que o desempenho real diz, e é ele que o Motor 1
 * consome. Uma pessoa que se disse "alto domínio" e erra tudo é corrigida pelo
 * algoritmo em poucos dias.
 */

/**
 * ⚠️ TEXTO EXATO EXIGIDO PELO README 1.5. Não reescrever, não resumir, não
 * "melhorar". É requisito de aceite do Marco 1.
 */
export const DIAGNOSIS_NOTICE =
  "O nível de domínio informado neste diagnóstico é uma percepção inicial sobre o " +
  "seu conhecimento. Ele será continuamente validado e atualizado pelo Algoritmo da " +
  "Aprovação conforme você resolver questões, realizar revisões e evoluir na preparação.";

export type MasteryLevel = "high" | "medium" | "low";

/**
 * Como a percepção inicial vira número para o motor.
 *
 * O valor é o ponto de partida de `current_mastery_score`, não um veredito:
 * `mastery_confidence` começa baixa justamente porque isto é opinião, não
 * medição. Conforme o aluno responde questões, o desempenho real ganha peso e a
 * opinião perde.
 */
const MASTERY_SCORE: Record<MasteryLevel, number> = {
  high: 0.8,
  medium: 0.5,
  low: 0.2,
};

/** Confiança inicial: baixa de propósito. É percepção, não desempenho medido. */
const INITIAL_CONFIDENCE = 0.15;

/* ========================================================================== *
 * LEITURA
 * ========================================================================== */

export type DiagnosisSubject = {
  id: string;
  displayName: string;
  topicCount: number;
  /** Resposta já dada, quando o aluno voltou à tela sem ter concluído. */
  answer: MasteryLevel | null;
};

export type DiagnosisView = {
  preparationId: string;
  targetPosition: string;
  status: (typeof preparations.$inferSelect)["status"];
  /** Verdadeiro quando o diagnóstico já foi fechado e não aceita mais resposta. */
  locked: boolean;
  subjects: DiagnosisSubject[];
};

export async function getDiagnosis(
  preparationId: string,
  userId: string,
): Promise<DiagnosisView | null> {
  const preparation = await db.query.preparations.findFirst({
    where: (t, { and: a, eq: e }) => a(e(t.id, preparationId), e(t.userId, userId)),
    columns: { id: true, status: true, targetPosition: true },
  });

  if (!preparation) return null;

  const existing = await db.query.diagnostics.findFirst({
    where: (t, { eq: e }) => e(t.preparationId, preparationId),
    columns: { id: true, lockedAt: true },
  });

  const subjectRows = await db
    .select({
      id: studyPlanSubjects.id,
      displayName: studyPlanSubjects.displayName,
      sortOrder: studyPlanSubjects.sortOrder,
    })
    .from(studyPlanSubjects)
    .where(
      and(
        eq(studyPlanSubjects.preparationId, preparationId),
        isNull(studyPlanSubjects.deletedAt),
      ),
    )
    .orderBy(studyPlanSubjects.sortOrder);

  const topicCounts = new Map<string, number>();
  const topicRows = await db
    .select({ planSubjectId: studyPlanTopics.planSubjectId })
    .from(studyPlanTopics)
    .where(
      and(
        eq(studyPlanTopics.preparationId, preparationId),
        eq(studyPlanTopics.isActive, true),
        isNull(studyPlanTopics.deletedAt),
      ),
    );

  for (const row of topicRows) {
    topicCounts.set(row.planSubjectId, (topicCounts.get(row.planSubjectId) ?? 0) + 1);
  }

  const answers = new Map<string, MasteryLevel>();
  if (existing) {
    const responseRows = await db
      .select({
        planSubjectId: diagnosticResponses.planSubjectId,
        masteryLevel: diagnosticResponses.masteryLevel,
      })
      .from(diagnosticResponses)
      .where(eq(diagnosticResponses.diagnosticId, existing.id));

    for (const row of responseRows) {
      if (row.planSubjectId) answers.set(row.planSubjectId, row.masteryLevel);
    }
  }

  return {
    preparationId,
    targetPosition: preparation.targetPosition,
    status: preparation.status,
    locked: existing?.lockedAt != null,
    subjects: subjectRows.map((subject) => ({
      id: subject.id,
      displayName: subject.displayName,
      topicCount: topicCounts.get(subject.id) ?? 0,
      answer: answers.get(subject.id) ?? null,
    })),
  };
}

/* ========================================================================== *
 * ESCRITA
 * ========================================================================== */

export type SubmitDiagnosisResult =
  | { ok: true; topicsInitialized: number }
  | { ok: false; message: string };

/**
 * Fecha o diagnóstico e semeia a memória de trabalho dos motores.
 *
 * A resposta de disciplina é PROPAGADA para cada assunto dela, e a propagação
 * fica marcada (`initial_mastery_was_propagated`). O motor precisa saber a
 * diferença: uma percepção herdada da disciplina vale menos que uma resposta
 * dada assunto a assunto, e sem a marca as duas seriam indistinguíveis.
 *
 * Tudo numa transação, e o `unique` em `diagnostics.preparation_id` é o que
 * impede dois envios simultâneos de criarem dois diagnósticos — a garantia é do
 * banco, não da tela.
 */
export async function submitDiagnosis(input: {
  preparationId: string;
  userId: string;
  answers: Array<{ subjectId: string; level: MasteryLevel }>;
}): Promise<SubmitDiagnosisResult> {
  const preparation = await db.query.preparations.findFirst({
    where: (t, { and: a, eq: e }) => a(e(t.id, input.preparationId), e(t.userId, input.userId)),
    columns: { id: true, status: true },
  });

  if (!preparation) return { ok: false, message: "Preparação não encontrada." };

  const already = await db.query.diagnostics.findFirst({
    where: (t, { eq: e }) => e(t.preparationId, input.preparationId),
    columns: { id: true, lockedAt: true },
  });

  if (already?.lockedAt) {
    return {
      ok: false,
      message:
        "Seu diagnóstico já foi concluído e não pode ser refeito. " +
        "A partir daqui quem atualiza seu nível é o seu desempenho nas questões.",
    };
  }

  const subjects = await db
    .select({ id: studyPlanSubjects.id })
    .from(studyPlanSubjects)
    .where(
      and(
        eq(studyPlanSubjects.preparationId, input.preparationId),
        isNull(studyPlanSubjects.deletedAt),
      ),
    );

  const validIds = new Set(subjects.map((subject) => subject.id));
  const answers = input.answers.filter((answer) => validIds.has(answer.subjectId));

  /**
   * O diagnóstico precisa estar COMPLETO para fechar.
   *
   * Não há refino posterior — ele não se refaz. Uma disciplina sem resposta
   * ficaria para sempre com o palpite neutro do sistema, e o aluno nunca teria
   * como corrigir isso.
   */
  if (answers.length < subjects.length) {
    const missing = subjects.length - answers.length;
    return {
      ok: false,
      message: `Falta responder ${missing} ${missing === 1 ? "disciplina" : "disciplinas"}. Como o diagnóstico não pode ser refeito depois, ele precisa estar completo.`,
    };
  }

  const now = new Date();
  let topicsInitialized = 0;

  await db.transaction(async (tx) => {
    const [diagnostic] = await tx
      .insert(diagnostics)
      .values({
        preparationId: input.preparationId,
        userId: input.userId,
        status: "completed",
        granularity: "subject",
        startedAt: already ? undefined : now,
        completedAt: now,
        lockedAt: now,
        itemsAnswered: answers.length,
        itemsTotal: subjects.length,
      })
      .onConflictDoUpdate({
        target: diagnostics.preparationId,
        set: {
          status: "completed",
          completedAt: now,
          lockedAt: now,
          itemsAnswered: answers.length,
          itemsTotal: subjects.length,
          updatedAt: now,
        },
      })
      .returning({ id: diagnostics.id });

    // Uma tentativa anterior incompleta pode ter deixado respostas gravadas.
    await tx
      .delete(diagnosticResponses)
      .where(eq(diagnosticResponses.diagnosticId, diagnostic.id));

    await tx.insert(diagnosticResponses).values(
      answers.map((answer) => ({
        diagnosticId: diagnostic.id,
        preparationId: input.preparationId,
        planSubjectId: answer.subjectId,
        masteryLevel: answer.level,
        appliedToChildren: true,
        answeredAt: now,
      })),
    );

    const topics = await tx
      .select({ id: studyPlanTopics.id, planSubjectId: studyPlanTopics.planSubjectId })
      .from(studyPlanTopics)
      .where(
        and(
          eq(studyPlanTopics.preparationId, input.preparationId),
          eq(studyPlanTopics.isActive, true),
          isNull(studyPlanTopics.deletedAt),
        ),
      );

    const levelBySubject = new Map(answers.map((a) => [a.subjectId, a.level]));

    const states = topics.map((topic) => {
      const level = levelBySubject.get(topic.planSubjectId) ?? "medium";
      return {
        preparationId: input.preparationId,
        planTopicId: topic.id,
        userId: input.userId,
        initialMastery: level,
        initialMasteryWasPropagated: true,
        currentMasteryScore: MASTERY_SCORE[level],
        masteryConfidence: INITIAL_CONFIDENCE,
        coverageStatus: "not_started" as const,
      };
    });

    /**
     * Semear é seguro aqui porque o diagnóstico acontece ANTES de qualquer
     * atividade: a preparação só vira `active` no final desta transação. Não há
     * histórico de estudo para preservar, e apagar antes evita o caso de uma
     * tentativa anterior ter deixado linhas de assuntos que o aluno apagou no
     * passo 3.
     */
    await tx.delete(topicStates).where(eq(topicStates.preparationId, input.preparationId));

    // Em lotes: um edital com 300 assuntos gera um comando grande demais para
    // um insert só, e o pooler do Supabase tem limite de tamanho de statement.
    for (let index = 0; index < states.length; index += 100) {
      await tx.insert(topicStates).values(states.slice(index, index + 100));
    }
    topicsInitialized = states.length;

    await tx
      .update(preparations)
      .set({
        status: "active",
        diagnosisCompletedAt: now,
        activatedAt: now,
        updatedAt: now,
      })
      .where(eq(preparations.id, input.preparationId));
  });

  await markFunnelStage(input.userId, "diagnosis_completed", now);
  await recordEvent(input.userId, "diagnosis_completed", {
    preparationId: input.preparationId,
    subjects: answers.length,
    topics: topicsInitialized,
  });

  return { ok: true, topicsInitialized };
}
