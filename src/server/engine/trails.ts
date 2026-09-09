import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { computeCoverage } from "@/modules/metrics";
import { db } from "@/server/db";
import {
  canonicalTopics,
  questions,
  questionTopics,
  studyPlanSubjects,
  studyPlanTopics,
  topicStates,
} from "@/server/db/schema";

/**
 * TRILHAS — os percursos de estudo (README 2.4).
 * ============================================================================
 *
 * Uma trilha por disciplina do edital do aluno: os assuntos na ordem em que o
 * edital os traz, com o estado de cada um.
 *
 * ⚠️ A TRILHA NÃO É O CRONOGRAMA, e a diferença é o motivo de existirem as duas
 * telas.
 *
 * O Cronograma responde "o que fazer hoje" e muda todo dia, porque o motor
 * repriorizava conforme o aluno anda. A Trilha responde "onde eu estou no
 * edital" e é ESTÁVEL: a ordem é a do edital, não a da prioridade. Um aluno que
 * abre o cronograma três dias seguidos vê três listas diferentes e não consegue
 * dizer se avançou; a trilha mostra o mapa inteiro e o quanto dele já foi
 * andado.
 *
 * Por isso aqui a ordenação é por `sortOrder`, e não por `priorityScore`.
 */

export type TrailTopic = {
  planTopicId: string;
  name: string;
  /** Profundidade na árvore do edital — a trilha indenta os subassuntos. */
  depth: number;
  status: "not_started" | "in_progress" | "studied" | "mastered";
  /** Slug do assunto canônico, quando casou. Sem ele não há questões. */
  topicSlug: string | null;
  questionsAnswered: number;
  accuracyPercent: number | null;
  reviewsCompleted: number;
  /**
   * Quantas questões publicadas existem deste assunto no acervo.
   *
   * ⚠️ É O QUE DECIDE SE O BOTÃO "COMPROVAR DOMÍNIO" APARECE.
   *
   * A prova precisa de um mínimo para medir domínio em vez de sorte, e o acervo
   * ainda está em expansão. Contar aqui evita que a trilha ofereça um botão que
   * abre uma tela dizendo "ainda não dá".
   */
  availableQuestions: number;
};

export type Trail = {
  planSubjectId: string;
  subjectName: string;
  topics: TrailTopic[];
  /** Assuntos com algum progresso, sobre o total. */
  startedCount: number;
  masteredCount: number;
  /**
   * 0–100, calculado por `computeCoverage` — a MESMA função do card de
   * Cobertura da Home.
   *
   * ⚠️ Não reimplementar a conta aqui. Duas contas para a mesma pergunta é
   * exatamente como o produto passa a se contradizer: a Home diria 40% e a
   * trilha 35%, e o aluno não teria como saber qual acreditar.
   */
  progressPercent: number;
};

export async function getTrails(preparationId: string): Promise<Trail[]> {
  const linhas = await db
    .select({
      planSubjectId: studyPlanSubjects.id,
      subjectName: studyPlanSubjects.displayName,
      subjectOrder: studyPlanSubjects.sortOrder,

      planTopicId: studyPlanTopics.id,
      name: studyPlanTopics.displayName,
      depth: studyPlanTopics.depth,
      topicOrder: studyPlanTopics.sortOrder,
      topicSlug: canonicalTopics.slug,

      status: topicStates.coverageStatus,
      questionsAnswered: topicStates.questionsAnswered,
      questionsCorrect: topicStates.questionsCorrect,
      reviewsCompleted: topicStates.reviewsCompleted,

      /*
        Subconsulta, e não `join` com `group by`: um join com `questions`
        multiplicaria a linha do assunto por questão, e todo agregado de
        `topic_states` acima passaria a ser somado uma vez por questão.

        E conta pelo VÍNCULO: o número aqui é o que a trilha promete ao aluno, e
        precisa bater com o que o Banco de Questões mostra quando ele filtra por
        este assunto. Contando pela coluna da questão, a trilha diria "0
        questões" num assunto que só aparece como segundo de uma célula
        "Crase; Concordância" — e o botão levaria a uma lista cheia.
      */
      availableQuestions: sql<number>`(
        select count(*)::int from ${questions}
         where exists (
                 select 1 from ${questionTopics}
                  where ${questionTopics.questionId} = ${questions.id}
                    and ${questionTopics.canonicalTopicId} = ${studyPlanTopics.canonicalTopicId}
               )
           and ${questions.status} = 'published'
           and ${questions.deletedAt} is null
      )`,
    })
    .from(studyPlanTopics)
    .innerJoin(
      studyPlanSubjects,
      eq(studyPlanTopics.planSubjectId, studyPlanSubjects.id),
    )
    /*
      `left join` em `topic_states`: a linha de estado nasce no diagnóstico, e um
      assunto acrescentado depois pelo aluno ainda não tem a dele. Com `inner`
      esse assunto sumiria da trilha — justamente o que o aluno acabou de
      incluir.
    */
    .leftJoin(topicStates, eq(topicStates.planTopicId, studyPlanTopics.id))
    .leftJoin(canonicalTopics, eq(studyPlanTopics.canonicalTopicId, canonicalTopics.id))
    .where(
      and(
        eq(studyPlanTopics.preparationId, preparationId),
        eq(studyPlanTopics.isActive, true),
        isNull(studyPlanTopics.deletedAt),
        eq(studyPlanSubjects.isActive, true),
        isNull(studyPlanSubjects.deletedAt),
      ),
    )
    .orderBy(
      asc(studyPlanSubjects.sortOrder),
      asc(studyPlanSubjects.displayName),
      asc(studyPlanTopics.sortOrder),
    );

  const porDisciplina = new Map<string, Trail>();

  for (const linha of linhas) {
    let trilha = porDisciplina.get(linha.planSubjectId);

    if (!trilha) {
      trilha = {
        planSubjectId: linha.planSubjectId,
        subjectName: linha.subjectName,
        topics: [],
        startedCount: 0,
        masteredCount: 0,
        progressPercent: 0,
      };
      porDisciplina.set(linha.planSubjectId, trilha);
    }

    const status = linha.status ?? "not_started";

    trilha.topics.push({
      planTopicId: linha.planTopicId,
      name: linha.name,
      depth: linha.depth,
      status,
      topicSlug: linha.topicSlug,
      availableQuestions: Number(linha.availableQuestions ?? 0),
      questionsAnswered: linha.questionsAnswered ?? 0,
      accuracyPercent:
        linha.questionsAnswered && linha.questionsAnswered > 0
          ? Math.round(((linha.questionsCorrect ?? 0) / linha.questionsAnswered) * 100)
          : null,
      reviewsCompleted: linha.reviewsCompleted ?? 0,
    });
  }

  for (const trilha of porDisciplina.values()) {
    trilha.startedCount = trilha.topics.filter((t) => t.status !== "not_started").length;
    trilha.masteredCount = trilha.topics.filter((t) => t.status === "mastered").length;
    trilha.progressPercent = computeCoverage(
      trilha.topics.map((t) => ({
        planTopicId: t.planTopicId,
        coverageStatus: t.status,
        weight: null,
      })),
    ).percent;
  }

  return [...porDisciplina.values()];
}

/**
 * O total do edital, para o cabeçalho da tela.
 *
 * Deriva das trilhas já carregadas em vez de fazer uma segunda consulta: são os
 * mesmos assuntos, e uma contagem agregada em SQL teria que repetir a regra da
 * cobertura — que é justamente a que não pode ter duas versões.
 */
export function summarize(trails: Trail[]): {
  topics: number;
  mastered: number;
  percent: number;
} {
  const todos = trails.flatMap((t) => t.topics);

  return {
    topics: todos.length,
    mastered: todos.filter((t) => t.status === "mastered").length,
    percent: computeCoverage(
      todos.map((t) => ({
        planTopicId: t.planTopicId,
        coverageStatus: t.status,
        weight: null,
      })),
    ).percent,
  };
}
