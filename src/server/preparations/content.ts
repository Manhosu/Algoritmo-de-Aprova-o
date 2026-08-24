import "server-only";

import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";

import { normalizeText } from "@/modules/taxonomy/normalize";
import type { QueueInput } from "@/modules/taxonomy/matcher";
import { db } from "@/server/db";
import {
  preparations,
  questions,
  studyPlanSubjects,
  studyPlanTopics,
} from "@/server/db/schema";
import {
  closeQueueKeys,
  enqueueUnmapped,
  loadCatalog,
  matchTopic,
} from "@/server/taxonomy/mapping";

import { markFunnelStage, recordEvent } from "./service";

/**
 * PASSO 3 DO FLUXO DO "+": O ALUNO CONFERE O QUE A IA LEU.
 * ============================================================================
 *
 * README 1.4, passo 3: o aluno pode corrigir, apagar e acrescentar itens, e
 * preencher o peso quando o edital não informou.
 *
 * POR QUE ESTE PASSO NÃO É OPCIONAL
 * ----------------------------------------------------------------------------
 * Tudo que vem depois — prioridade, cronograma, cobertura — é calculado em cima
 * desta lista. Uma disciplina que a IA leu errado vira meses de estudo no lugar
 * errado, e o aluno não teria como descobrir. Confirmar aqui é o único momento
 * em que uma pessoa olha para o plano inteiro.
 *
 * RENOMEAR REFAZ O CASAMENTO
 * ----------------------------------------------------------------------------
 * O nome é a ponte com o catálogo: é por ele que o sistema encontra questão
 * para o assunto. Quando o aluno reescreve "Emprego do sinal indicativo de
 * crase" como "Crase", o item precisa casar de novo — senão a correção dele não
 * teria efeito nenhum, e ele veria o mesmo "sem questões disponíveis" depois de
 * fazer exatamente a coisa certa.
 */

/* ========================================================================== *
 * LEITURA
 * ========================================================================== */

export type PlanTopicView = {
  id: string;
  displayName: string;
  depth: number;
  weight: number | null;
  weightSource: "edital" | "student" | "default" | "admin";
  isActive: boolean;
  mappingStatus: "mapped" | "manually_mapped" | "unmapped" | "ambiguous" | "ignored";
  /** Quantas questões publicadas existem hoje para este assunto. */
  questionCount: number;
};

export type PlanSubjectView = {
  id: string;
  displayName: string;
  topics: PlanTopicView[];
};

export type PlanContent = {
  preparationId: string;
  status: (typeof preparations.$inferSelect)["status"];
  targetPosition: string;
  subjects: PlanSubjectView[];
  /** Resumo para o cabeçalho da tela. */
  summary: {
    subjects: number;
    topics: number;
    withQuestions: number;
    withoutWeight: number;
  };
};

export async function getPlanContent(
  preparationId: string,
  userId: string,
): Promise<PlanContent | null> {
  const preparation = await db.query.preparations.findFirst({
    where: (t, { and: a, eq: e }) => a(e(t.id, preparationId), e(t.userId, userId)),
    columns: { id: true, status: true, targetPosition: true },
  });

  if (!preparation) return null;

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

  const topicRows = await db
    .select({
      id: studyPlanTopics.id,
      planSubjectId: studyPlanTopics.planSubjectId,
      displayName: studyPlanTopics.displayName,
      depth: studyPlanTopics.depth,
      sortOrder: studyPlanTopics.sortOrder,
      weight: studyPlanTopics.weight,
      weightSource: studyPlanTopics.weightSource,
      isActive: studyPlanTopics.isActive,
      mappingStatus: studyPlanTopics.mappingStatus,
      canonicalTopicId: studyPlanTopics.canonicalTopicId,
    })
    .from(studyPlanTopics)
    .where(
      and(
        eq(studyPlanTopics.preparationId, preparationId),
        isNull(studyPlanTopics.deletedAt),
      ),
    )
    .orderBy(studyPlanTopics.sortOrder);

  /**
   * Quantas questões o acervo tem por assunto canônico.
   *
   * A cliente pediu isto explicitamente em 21/08/2026: mostrar a porcentagem do
   * acervo pronto por matéria, "para o aluno saber o que já está disponível".
   * Uma consulta agregada, não uma por assunto — 300 assuntos seriam 300 idas ao
   * banco para desenhar uma tela.
   */
  const canonicalIds = [
    ...new Set(topicRows.map((t) => t.canonicalTopicId).filter((id): id is string => id !== null)),
  ];

  const questionCounts = new Map<string, number>();
  if (canonicalIds.length > 0) {
    const rows = await db
      .select({ topicId: questions.canonicalTopicId, total: count() })
      .from(questions)
      .where(
        and(
          inArray(questions.canonicalTopicId, canonicalIds),
          eq(questions.status, "published"),
        ),
      )
      .groupBy(questions.canonicalTopicId);

    for (const row of rows) {
      if (row.topicId) questionCounts.set(row.topicId, row.total);
    }
  }

  const subjects: PlanSubjectView[] = subjectRows.map((subject) => ({
    id: subject.id,
    displayName: subject.displayName,
    topics: topicRows
      .filter((topic) => topic.planSubjectId === subject.id)
      .map((topic) => ({
        id: topic.id,
        displayName: topic.displayName,
        depth: topic.depth,
        weight: topic.weight,
        weightSource: topic.weightSource,
        isActive: topic.isActive,
        mappingStatus: topic.mappingStatus,
        questionCount: topic.canonicalTopicId
          ? (questionCounts.get(topic.canonicalTopicId) ?? 0)
          : 0,
      })),
  }));

  const allTopics = subjects.flatMap((s) => s.topics);

  return {
    preparationId,
    status: preparation.status,
    targetPosition: preparation.targetPosition,
    subjects,
    summary: {
      subjects: subjects.length,
      topics: allTopics.length,
      withQuestions: allTopics.filter((t) => t.questionCount > 0).length,
      withoutWeight: allTopics.filter((t) => t.weight === null).length,
    },
  };
}

/* ========================================================================== *
 * ESCRITA
 * ========================================================================== */

export type ContentEdit = {
  /** `id` existente, ou `null` para item novo criado pelo aluno. */
  id: string | null;
  subjectId: string;
  displayName: string;
  weight: number | null;
  isActive: boolean;
};

export type SaveContentResult =
  | { ok: true; remapped: number; removed: number; added: number }
  | { ok: false; message: string };

/**
 * Grava a revisão do aluno e reabre o casamento do que ele renomeou.
 *
 * O que a função faz, em ordem:
 *   1. apaga os itens que sumiram da lista;
 *   2. atualiza os que continuam, refazendo o casamento dos renomeados;
 *   3. insere os que o aluno acrescentou, já casando;
 *   4. move a preparação para `diagnosis_pending`.
 *
 * Tudo numa transação: uma revisão gravada pela metade deixaria o plano do
 * aluno num estado que ele não escolheu e não consegue enxergar.
 */
export async function savePlanContent(input: {
  preparationId: string;
  userId: string;
  topics: ContentEdit[];
  confirm: boolean;
}): Promise<SaveContentResult> {
  const preparation = await db.query.preparations.findFirst({
    where: (t, { and: a, eq: e }) => a(e(t.id, input.preparationId), e(t.userId, input.userId)),
    columns: { id: true, status: true },
  });

  if (!preparation) return { ok: false, message: "Preparação não encontrada." };

  if (preparation.status === "archived") {
    return { ok: false, message: "Esta preparação está encerrada." };
  }

  const active = input.topics.filter((topic) => topic.displayName.trim().length > 0);
  if (input.confirm && active.filter((t) => t.isActive).length === 0) {
    return {
      ok: false,
      message:
        "Deixe pelo menos um assunto ativo. Sem nenhum, não há o que o algoritmo priorizar.",
    };
  }

  const existing = await db
    .select({
      id: studyPlanTopics.id,
      planSubjectId: studyPlanTopics.planSubjectId,
      displayName: studyPlanTopics.displayName,
      canonicalSubjectId: studyPlanSubjects.canonicalSubjectId,
      subjectName: studyPlanSubjects.displayName,
      weight: studyPlanTopics.weight,
      weightSource: studyPlanTopics.weightSource,
      depth: studyPlanTopics.depth,
      sortOrder: studyPlanTopics.sortOrder,
    })
    .from(studyPlanTopics)
    .innerJoin(studyPlanSubjects, eq(studyPlanTopics.planSubjectId, studyPlanSubjects.id))
    .where(
      and(
        eq(studyPlanTopics.preparationId, input.preparationId),
        isNull(studyPlanTopics.deletedAt),
      ),
    );

  const byId = new Map(existing.map((row) => [row.id, row]));
  const keptIds = new Set(active.map((t) => t.id).filter((id): id is string => id !== null));
  const removedIds = existing.filter((row) => !keptIds.has(row.id)).map((row) => row.id);

  const catalog = await loadCatalog();
  const queueEntries: QueueInput[] = [];
  const matchedKeys: string[] = [];

  let remapped = 0;
  let added = 0;

  const now = new Date();

  await db.transaction(async (tx) => {
    if (removedIds.length > 0) {
      await tx.delete(studyPlanTopics).where(inArray(studyPlanTopics.id, removedIds));
    }

    for (const edit of active) {
      const name = edit.displayName.trim().slice(0, 300);
      const current = edit.id ? byId.get(edit.id) : undefined;

      // Item que o aluno diz existir mas não é dele: ignora em silêncio em vez
      // de gravar num plano alheio.
      if (edit.id && !current) continue;

      const renamed = current ? current.displayName !== name : true;
      const scopeSubjectId = current
        ? current.canonicalSubjectId
        : await subjectCanonicalId(tx, edit.subjectId);

      const match = renamed ? matchTopic(name, scopeSubjectId, catalog) : null;
      const mapped =
        match !== null && (match.status === "mapped" || match.status === "manually_mapped");

      if (match) {
        if (mapped) matchedKeys.push(match.key);
        else {
          queueEntries.push({
            rawName: name,
            subjectHint: current?.subjectName ?? null,
            userId: input.userId,
            result: match,
          });
        }
      }

      /**
       * A origem do peso segue quem o informou por último.
       *
       * Campo vazio volta a `default`, e o motor usa peso neutro — que é
       * diferente de peso zero: zero diria "este assunto não cai na prova".
       *
       * Peso intocado mantém a origem que tinha: se veio do edital, continua
       * vindo do edital. Só vira `student` quando o número muda de fato — o
       * simples ato de abrir a tela e confirmar não pode transformar um dado
       * lido do documento em opinião do aluno.
       */
      const weightUnchanged = current !== undefined && current.weight === edit.weight;
      const weightSource =
        edit.weight === null
          ? ("default" as const)
          : weightUnchanged
            ? current.weightSource
            : ("student" as const);

      if (current) {
        await tx
          .update(studyPlanTopics)
          .set({
            displayName: name,
            normalizedName: normalizeText(name).slice(0, 300),
            weight: edit.weight,
            weightSource,
            isActive: edit.isActive,
            origin: renamed ? "student" : undefined,
            ...(match
              ? {
                  canonicalTopicId: match.canonicalId,
                  mappingStatus: match.status,
                  mappingConfidence: match.confidence,
                  mappedAt: mapped ? now : null,
                  mappedByUserId: null,
                }
              : {}),
            updatedAt: now,
          })
          .where(eq(studyPlanTopics.id, current.id));

        if (renamed) remapped += 1;
      } else {
        await tx.insert(studyPlanTopics).values({
          preparationId: input.preparationId,
          planSubjectId: edit.subjectId,
          canonicalTopicId: match?.canonicalId ?? null,
          rawName: name,
          displayName: name,
          normalizedName: normalizeText(name).slice(0, 300),
          depth: 0,
          // Vai para o fim da disciplina: o que o aluno acrescenta não deve
          // embaralhar a ordem do edital, que ele usa para se localizar.
          sortOrder: 10_000 + added,
          weight: edit.weight,
          weightSource,
          isActive: edit.isActive,
          mappingStatus: match?.status ?? "unmapped",
          mappingConfidence: match?.confidence ?? 0,
          mappedAt: mapped ? now : null,
          origin: "student",
        });

        added += 1;
      }
    }

    if (input.confirm) {
      await tx
        .update(preparations)
        .set({
          status: "diagnosis_pending",
          contentConfirmedAt: now,
          updatedAt: now,
        })
        .where(eq(preparations.id, input.preparationId));
    }
  });

  await enqueueUnmapped(queueEntries);
  await closeQueueKeys(matchedKeys);

  if (input.confirm) {
    await markFunnelStage(input.userId, "content_confirmed", now);
    await recordEvent(input.userId, "content_confirmed", {
      preparationId: input.preparationId,
      topics: active.length,
      removed: removedIds.length,
      added,
      renamed: remapped,
    });
  }

  return { ok: true, remapped, removed: removedIds.length, added };
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function subjectCanonicalId(
  tx: Transaction,
  planSubjectId: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ canonicalSubjectId: studyPlanSubjects.canonicalSubjectId })
    .from(studyPlanSubjects)
    .where(eq(studyPlanSubjects.id, planSubjectId))
    .limit(1);

  return row?.canonicalSubjectId ?? null;
}

/**
 * Renomeia uma DISCIPLINA do plano.
 *
 * Separado do salvamento em massa de propósito: são 10 a 15 disciplinas contra
 * 300 assuntos, e mudar o nome de uma disciplina muda o ESCOPO do casamento de
 * todos os assuntos dela. Fazer isso junto com a edição de assuntos misturaria
 * duas operações de custo muito diferente numa única submissão.
 */
export async function renamePlanSubject(input: {
  preparationId: string;
  userId: string;
  subjectId: string;
  displayName: string;
}): Promise<{ ok: boolean; message?: string }> {
  const name = input.displayName.trim().slice(0, 200);
  if (name.length === 0) return { ok: false, message: "Informe o nome da disciplina." };

  const owned = await db
    .select({ id: studyPlanSubjects.id })
    .from(studyPlanSubjects)
    .innerJoin(preparations, eq(studyPlanSubjects.preparationId, preparations.id))
    .where(
      and(
        eq(studyPlanSubjects.id, input.subjectId),
        eq(preparations.id, input.preparationId),
        eq(preparations.userId, input.userId),
      ),
    )
    .limit(1);

  if (owned.length === 0) return { ok: false, message: "Disciplina não encontrada." };

  await db
    .update(studyPlanSubjects)
    .set({
      displayName: name,
      normalizedName: normalizeText(name).slice(0, 200),
      origin: "student",
      updatedAt: new Date(),
    })
    .where(eq(studyPlanSubjects.id, input.subjectId));

  return { ok: true };
}

/** Remove uma disciplina inteira do plano, com os assuntos dela. */
export async function removePlanSubject(input: {
  preparationId: string;
  userId: string;
  subjectId: string;
}): Promise<{ ok: boolean; message?: string }> {
  const [remaining] = await db
    .select({ total: count() })
    .from(studyPlanSubjects)
    .where(
      and(
        eq(studyPlanSubjects.preparationId, input.preparationId),
        isNull(studyPlanSubjects.deletedAt),
      ),
    );

  if ((remaining?.total ?? 0) <= 1) {
    return {
      ok: false,
      message: "Esta é a única disciplina do seu plano. Apagá-la deixaria o edital vazio.",
    };
  }

  const result = await db
    .delete(studyPlanSubjects)
    .where(
      and(
        eq(studyPlanSubjects.id, input.subjectId),
        eq(studyPlanSubjects.preparationId, input.preparationId),
        // A posse é conferida aqui, no mesmo comando que apaga: consultar antes
        // e apagar depois deixa uma janela entre as duas coisas.
        sql`exists (select 1 from ${preparations} p where p.id = ${studyPlanSubjects.preparationId} and p.user_id = ${input.userId})`,
      ),
    );

  return result.count > 0
    ? { ok: true }
    : { ok: false, message: "Disciplina não encontrada." };
}
