import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import {
  judgeMastery,
  masterySize,
  MASTERY_MIN_QUESTIONS,
  type MasteryVerdict,
} from "@/modules/trails/mastery";
import { db } from "@/server/db";
import {
  canonicalTopics,
  questionOptions,
  questions,
  studyPlanTopics,
  topicStates,
} from "@/server/db/schema";

/**
 * PROVA DE DOMÍNIO — a parte que toca o banco.
 * ============================================================================
 *
 * ⚠️ AS QUESTÕES VÊM SEM GABARITO PARA A TELA.
 *
 * O mesmo cuidado do Banco de Questões: `isCorrect` não entra no payload. Numa
 * prova de 20 questões seguidas, o gabarito no HTML transformaria "comprovar
 * domínio" em "abrir o inspetor" — e o resultado tira o assunto da fila do
 * Motor 1, então a fraude tem consequência real no cronograma.
 *
 * ⚠️ A CORREÇÃO ACONTECE INTEIRA NO SERVIDOR, ao enviar.
 *
 * O cliente manda apenas pares (questão, alternativa escolhida). Confiar num
 * "acertei" vindo do navegador seria o mesmo buraco por outro caminho.
 */

export type MasteryQuestion = {
  id: string;
  statement: string;
  options: Array<{ id: string; label: string; content: string }>;
};

export type MasteryExam =
  | { ok: true; topicName: string; questions: MasteryQuestion[] }
  | { ok: false; reason: "sem_assunto" | "acervo_insuficiente"; available: number };

/**
 * Monta a prova.
 *
 * ⚠️ `order by random()` É ACEITÁVEL AQUI, e normalmente não seria.
 *
 * Ele varre a partição do assunto para embaralhar. Numa tabela de milhões seria
 * proibitivo; aqui o filtro já reduz a algumas dezenas ou centenas de linhas
 * pelo índice de `canonical_topic_id`, e a aleatoriedade de verdade é o que
 * impede o aluno de decorar a mesma sequência refazendo a prova.
 */
export async function buildMasteryExam(input: {
  userId: string;
  planTopicId: string;
}): Promise<MasteryExam> {
  const [assunto] = await db
    .select({
      planTopicId: studyPlanTopics.id,
      name: studyPlanTopics.displayName,
      canonicalTopicId: studyPlanTopics.canonicalTopicId,
      canonicalName: canonicalTopics.name,
    })
    .from(studyPlanTopics)
    .leftJoin(canonicalTopics, eq(canonicalTopics.id, studyPlanTopics.canonicalTopicId))
    .where(eq(studyPlanTopics.id, input.planTopicId))
    .limit(1);

  if (!assunto?.canonicalTopicId) {
    return { ok: false, reason: "sem_assunto", available: 0 };
  }

  const [contagem] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(questions)
    .where(
      and(
        eq(questions.canonicalTopicId, assunto.canonicalTopicId),
        eq(questions.status, "published"),
        isNull(questions.deletedAt),
      ),
    );

  const disponiveis = contagem?.total ?? 0;
  const quantas = masterySize(disponiveis);

  if (quantas === null) {
    return { ok: false, reason: "acervo_insuficiente", available: disponiveis };
  }

  const sorteadas = await db
    .select({ id: questions.id, statement: questions.statement })
    .from(questions)
    .where(
      and(
        eq(questions.canonicalTopicId, assunto.canonicalTopicId),
        eq(questions.status, "published"),
        isNull(questions.deletedAt),
      ),
    )
    .orderBy(sql`random()`)
    .limit(quantas);

  const alternativas = await db
    .select({
      id: questionOptions.id,
      questionId: questionOptions.questionId,
      label: questionOptions.label,
      content: questionOptions.content,
      sortOrder: questionOptions.sortOrder,
    })
    .from(questionOptions)
    .where(
      sql`${questionOptions.questionId} in (${sql.join(
        sorteadas.map((q) => sql`${q.id}`),
        sql`, `,
      )})`,
    );

  const porQuestao = new Map<string, MasteryQuestion["options"]>();
  for (const alternativa of alternativas.sort((a, b) => a.sortOrder - b.sortOrder)) {
    const atual = porQuestao.get(alternativa.questionId) ?? [];
    atual.push({
      id: alternativa.id,
      label: alternativa.label,
      content: alternativa.content,
    });
    porQuestao.set(alternativa.questionId, atual);
  }

  return {
    ok: true,
    topicName: assunto.canonicalName ?? assunto.name,
    questions: sorteadas.map((q) => ({
      id: q.id,
      statement: q.statement,
      options: porQuestao.get(q.id) ?? [],
    })),
  };
}

export type MasteryResult = {
  verdict: MasteryVerdict;
  /** O assunto foi marcado como dominado agora? */
  markedAsMastered: boolean;
};

/**
 * Corrige a prova e, se passou, marca o assunto como dominado.
 *
 * ⚠️ REPROVAR NÃO REBAIXA o assunto.
 *
 * Um aluno que já tinha o assunto como `mastered` e refaz a prova por curiosidade
 * não pode perder o status por errar duas. O estado só sobe: a prova é uma forma
 * de PROVAR domínio, não de auditá-lo periodicamente.
 */
export async function gradeMasteryExam(input: {
  userId: string;
  planTopicId: string;
  answers: Array<{ questionId: string; optionId: string }>;
}): Promise<MasteryResult> {
  if (input.answers.length === 0) {
    return { verdict: judgeMastery({ total: 0, correct: 0 }), markedAsMastered: false };
  }

  /*
    ⚠️ UMA CONSULTA, e ela devolve só as alternativas CORRETAS das questões
    respondidas.

    Buscar questão por questão seriam 20 idas ao banco num pool com teto de 15
    conexões — a prova de domínio derrubaria o resto do site enquanto corrige.
  */
  const corretas = await db
    .select({ questionId: questionOptions.questionId, optionId: questionOptions.id })
    .from(questionOptions)
    .where(
      and(
        eq(questionOptions.isCorrect, true),
        sql`${questionOptions.questionId} in (${sql.join(
          input.answers.map((a) => sql`${a.questionId}`),
          sql`, `,
        )})`,
      ),
    );

  const gabarito = new Map(corretas.map((c) => [c.questionId, c.optionId]));

  /*
    Só contam as questões cujo gabarito foi encontrado. Uma questão excluída
    entre a montagem e o envio some do gabarito, e contá-la como erro puniria o
    aluno por uma edição da operação.
  */
  const validas = input.answers.filter((a) => gabarito.has(a.questionId));
  const acertos = validas.filter((a) => gabarito.get(a.questionId) === a.optionId).length;

  const verdict = judgeMastery({ total: validas.length, correct: acertos });

  if (!verdict.passed || validas.length < MASTERY_MIN_QUESTIONS) {
    return { verdict, markedAsMastered: false };
  }

  await db
    .update(topicStates)
    .set({ coverageStatus: "mastered", updatedAt: new Date() })
    .where(eq(topicStates.planTopicId, input.planTopicId));

  return { verdict, markedAsMastered: true };
}
