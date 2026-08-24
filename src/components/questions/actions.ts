"use server";

import { requireApiUser } from "@/server/auth/guards";
import { getStudentContext } from "@/server/auth/current-user";
import { answerQuestion, type AnswerResult } from "@/server/questions/service";

/**
 * Responde uma questão e devolve o gabarito com o comentário.
 *
 * ⚠️ O gabarito NÃO vai junto com a lista de questões. Ele só existe nesta
 * resposta, depois de a tentativa estar gravada. Mandar `isCorrect` de cada
 * alternativa na carga da página seria entregar o gabarito a quem abrir o
 * inspetor — e o produto inteiro (diagnóstico, priorização, métricas) passaria
 * a medir uma pessoa que não existe.
 *
 * O limite diário também é conferido aqui, no servidor. A tela desabilita os
 * botões quando o teto é atingido, mas isso é conveniência: quem enviar a ação
 * direto continua barrado.
 */
export async function answerQuestionAction(input: {
  questionId: string;
  optionId: string;
  dailyTaskItemId?: string | null;
  timeSpentSeconds?: number;
}): Promise<AnswerResult> {
  const session = await requireApiUser();
  const context = await getStudentContext();

  return answerQuestion({
    userId: session.user.id,
    questionId: input.questionId,
    optionId: input.optionId,
    // A preparação atual liga a resposta ao assunto do edital do aluno — é o
    // que faz o desempenho voltar para o Motor 1.
    preparationId: context?.currentPreparation?.id ?? null,
    dailyTaskItemId: input.dailyTaskItemId ?? null,
    source: input.dailyTaskItemId ? "daily_task" : "question_bank",
    timeSpentSeconds: input.timeSpentSeconds,
  });
}
