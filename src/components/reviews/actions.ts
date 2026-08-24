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

export async function completeReviewAction(input: {
  occurrenceId: string;
  performanceRating?: "easy" | "ok" | "hard";
}): Promise<CompleteReviewOutcome> {
  const session = await requireApiUser();

  const result = await completeReviewOccurrence({
    userId: session.user.id,
    occurrenceId: input.occurrenceId,
    performanceRating: input.performanceRating,
  });

  if (result.ok) {
    revalidatePath("/inicio");
    revalidatePath("/revisoes");
  }

  return result;
}
