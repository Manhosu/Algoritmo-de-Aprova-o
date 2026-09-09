"use server";

import { revalidatePath } from "next/cache";

import { requireApiUser } from "@/server/auth/guards";
import {
  completeReviewOccurrence,
  completeStudy,
  type CompleteReviewOutcome,
  type CompleteStudyResult,
} from "@/server/engine/review";

/**
 * Marca um item de estudo como concluído.
 *
 * É o gatilho do Motor 2: daqui nasce a série de revisões em 24h / 7 / 30 / 60 /
 * 90 dias. Responder questão não dispara — praticar não é a mesma coisa que
 * estudar o conteúdo, e a curva do esquecimento que o motor combate é a do
 * material visto.
 */
export async function completeStudyAction(
  dailyTaskItemId: string,
): Promise<CompleteStudyResult> {
  const session = await requireApiUser();

  const result = await completeStudy({
    userId: session.user.id,
    dailyTaskItemId,
  });

  if (result.ok) {
    revalidatePath("/inicio");
    revalidatePath("/revisoes");
  }

  return result;
}

/**
 * Conclui uma revisão.
 *
 * ⚠️ NÃO CHAMA `revalidatePath`, e a ausência dela é o conserto.
 *
 * Palavras da cliente, três vezes: "o aviso na tela de Revisões continua não
 * aparecendo para mim, em nenhuma das contas que criei".
 *
 * `revalidatePath` numa Server Action faz o Next devolver, junto da resposta,
 * uma versão nova da página atual — e o roteador aplica as duas coisas na mesma
 * transição. A revisão recém-concluída já não está em `reviews.due`, então o
 * card DESMONTA no mesmo instante em que o `setDone` do componente pediria para
 * mostrar a confirmação. Ela nunca chega a pintar: o card simplesmente some, e
 * com ele a data da próxima revisão e o XP ganho.
 *
 * Eu tinha diagnosticado isso como pressa de leitura e mexido no tempo que a
 * mensagem ficava na tela — primeiro instantâneo, depois seis segundos. Ela
 * repetiu a reclamação as duas vezes porque o tempo nunca foi o problema.
 *
 * Quem recarrega a lista agora é o botão "Fechar" da confirmação, quando o
 * aluno decide sair dela. As duas telas são dinâmicas (leem o cookie da
 * sessão), então não há cache de rota para invalidar — `revalidatePath` aqui
 * não trazia nada além do estrago.
 */
export async function completeReviewAction(input: {
  occurrenceId: string;
  performanceRating?: "easy" | "ok" | "hard";
}): Promise<CompleteReviewOutcome> {
  const session = await requireApiUser();

  return completeReviewOccurrence({
    userId: session.user.id,
    occurrenceId: input.occurrenceId,
    performanceRating: input.performanceRating,
  });
}

/**
 * Recarrega a lista de revisões, quando o aluno fecha a confirmação.
 *
 * ⚠️ É UMA AÇÃO DE SERVIDOR SÓ PARA REVALIDAR, e isso tem motivo.
 *
 * `router.refresh()` sozinho não trouxe dado novo: o botão "Fechar" ficava
 * clicado e a tela continuava mostrando a revisão já concluída, com "Para hoje:
 * 1". Só um `revalidatePath` faz o Next devolver a página remontada de verdade.
 *
 * É exatamente o mecanismo que quebrava a confirmação quando morava no
 * `completeReviewAction`. A diferença inteira é QUANDO ele roda: ali derrubava
 * a mensagem antes de o aluno ler; aqui é ele quem pede.
 */
export async function dismissReviewAction(): Promise<void> {
  await requireApiUser();

  revalidatePath("/inicio");
  revalidatePath("/revisoes");
}
