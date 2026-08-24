import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import {
  buildMappingQueue,
  matchToCanonical,
  type AliasEntry,
  type CanonicalCandidate,
  type MatchResult,
  type QueueInput,
} from "@/modules/taxonomy/matcher";
import { db } from "@/server/db";
import {
  canonicalSubjectAliases,
  canonicalSubjects,
  canonicalTopicAliases,
  canonicalTopics,
  topicMappingQueue,
} from "@/server/db/schema";

/**
 * A PONTE ENTRE O EDITAL DO ALUNO E O CATÁLOGO.
 *
 * Este módulo é só a camada de dados: carrega o catálogo, chama o casador PURO
 * (`@/modules/taxonomy/matcher`) e grava o resultado. Nenhuma regra de
 * casamento mora aqui — elas ficam no módulo, que é testável sem banco.
 *
 * A separação importa porque a regra vai mudar: cada edital real que não casa
 * ensina alguma coisa. Se a regra estivesse misturada com SQL, cada ajuste
 * exigiria um banco para ser verificado.
 */

export type Catalog = {
  subjects: CanonicalCandidate[];
  subjectAliases: AliasEntry[];
  topics: CanonicalCandidate[];
  topicAliases: AliasEntry[];
};

/**
 * Carrega o catálogo inteiro em memória, uma vez por extração.
 *
 * São 7 disciplinas, 57 assuntos e 71 sinônimos hoje; mesmo multiplicado por
 * cem, cabe folgado. Uma consulta por assunto do edital seria trezentas idas ao
 * banco para ler sempre a mesma tabela.
 */
export async function loadCatalog(): Promise<Catalog> {
  const [subjects, topics, subjectAliasRows, topicAliasRows] = await Promise.all([
    db
      .select({
        id: canonicalSubjects.id,
        name: canonicalSubjects.name,
        normalizedName: canonicalSubjects.normalizedName,
      })
      .from(canonicalSubjects)
      .where(eq(canonicalSubjects.isActive, true)),

    db
      .select({
        id: canonicalTopics.id,
        name: canonicalTopics.name,
        normalizedName: canonicalTopics.normalizedName,
        subjectId: canonicalTopics.subjectId,
      })
      .from(canonicalTopics)
      .where(eq(canonicalTopics.isActive, true)),

    db
      .select({
        normalizedAlias: canonicalSubjectAliases.normalizedAlias,
        targetId: canonicalSubjectAliases.subjectId,
        origin: canonicalSubjectAliases.origin,
      })
      .from(canonicalSubjectAliases),

    db
      .select({
        normalizedAlias: canonicalTopicAliases.normalizedAlias,
        targetId: canonicalTopicAliases.topicId,
        origin: canonicalTopicAliases.origin,
      })
      .from(canonicalTopicAliases),
  ]);

  return {
    subjects: subjects.map((s) => ({ ...s, subjectId: null })),
    subjectAliases: subjectAliasRows.map(toAliasEntry),
    topics,
    topicAliases: topicAliasRows.map(toAliasEntry),
  };
}

/**
 * `contentOriginEnum` tem valores que o casador não conhece (`import`, por
 * exemplo). Tudo que não é "admin" ou "student" entra como "ai", que é a
 * origem de menor prioridade — na dúvida, o sinônimo vale menos, nunca mais.
 */
function toAliasEntry(row: {
  normalizedAlias: string;
  targetId: string;
  origin: string;
}): AliasEntry {
  const origin =
    row.origin === "admin" ? "admin" : row.origin === "student" ? "student" : "ai";
  return { normalizedAlias: row.normalizedAlias, targetId: row.targetId, origin };
}

/* ========================================================================== *
 * CASAMENTO
 * ========================================================================== */

export function matchSubject(rawName: string, catalog: Catalog): MatchResult {
  return matchToCanonical({
    rawName,
    aliases: catalog.subjectAliases,
    candidates: catalog.subjects,
  });
}

/**
 * Casa um assunto, restrito à disciplina que já casou.
 *
 * O escopo é o que evita o pior erro possível: "Princípios" existe em Direito
 * Administrativo, em Direito Constitucional e em Contabilidade. Sem escopo, o
 * casamento aproximado escolhe um deles com confiança alta e o aluno recebe
 * questões da matéria errada, sem nunca saber por quê.
 *
 * Quando a disciplina não casou (`scopeSubjectId` nulo), o casador ainda tenta
 * no catálogo inteiro — mas aí quase tudo cai na fila, que é o comportamento
 * certo: disciplina desconhecida é um buraco de catálogo, não um caso isolado.
 */
export function matchTopic(
  rawName: string,
  scopeSubjectId: string | null,
  catalog: Catalog,
): MatchResult {
  return matchToCanonical({
    rawName,
    scopeSubjectId,
    aliases: catalog.topicAliases,
    candidates: catalog.topics,
  });
}

/* ========================================================================== *
 * FILA DO PAINEL
 * ========================================================================== */

/**
 * Grava na fila o que não casou, somando às ocorrências que já existiam.
 *
 * O `ON CONFLICT` sobre `normalized_name` é o que mantém a fila deduplicada:
 * cinquenta alunos com a mesma redação viram UMA linha com `occurrences = 50`,
 * e o administrador conserta os cinquenta de uma vez.
 *
 * Item já RESOLVIDO volta para `pending` quando reaparece. Isso é intencional:
 * se o texto voltou a cair aqui depois de resolvido, o sinônimo criado não
 * cobriu o caso e alguém precisa olhar de novo.
 */
export async function enqueueUnmapped(entries: QueueInput[]): Promise<number> {
  const candidates = buildMappingQueue(entries);
  if (candidates.length === 0) return 0;

  const now = new Date();

  await db
    .insert(topicMappingQueue)
    .values(
      candidates.map((candidate) => ({
        rawName: candidate.rawName,
        normalizedName: candidate.key,
        subjectHint: candidate.subjectHint,
        suggestedTopicId: candidate.suggestedTopicId,
        suggestedConfidence: candidate.suggestedConfidence,
        alternatives: candidate.alternatives.map((alternative) => ({
          topicId: alternative.topicId,
          confidence: alternative.confidence,
        })),
        occurrences: candidate.occurrences,
        affectedUserCount: candidate.affectedUsers.size,
        firstSeenAt: now,
        lastSeenAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: topicMappingQueue.normalizedName,
      set: {
        occurrences: sql`${topicMappingQueue.occurrences} + excluded.occurrences`,
        affectedUserCount: sql`${topicMappingQueue.affectedUserCount} + excluded.affected_user_count`,
        lastSeenAt: now,
        status: sql`case when ${topicMappingQueue.status} = 'resolved' then 'pending'::mapping_queue_status else ${topicMappingQueue.status} end`,
        updatedAt: now,
      },
    });

  return candidates.length;
}

/**
 * Marca como resolvidos os itens da fila cujo texto passou a casar.
 *
 * Chamado depois de uma extração: se um administrador criou o sinônimo entre a
 * primeira e a segunda aparição do mesmo texto, a linha antiga precisa sair do
 * "pendente" sozinha. Sem isto a fila só cresce e deixa de ser uma lista de
 * trabalho.
 */
export async function closeQueueKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) return;

  const now = new Date();

  await db
    .update(topicMappingQueue)
    .set({
      status: "resolved",
      resolvedAt: now,
      resolutionNote: "Fechado automaticamente: o texto voltou a casar com o catálogo.",
      updatedAt: now,
    })
    .where(
      and(
        inArray(topicMappingQueue.normalizedName, keys),
        eq(topicMappingQueue.status, "pending"),
      ),
    );
}
