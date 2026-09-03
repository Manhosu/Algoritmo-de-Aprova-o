"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/server/auth/guards";
import { gradeMasteryExam } from "@/server/engine/mastery";

/** ⚠️ Arquivo `"use server"`: só exporta `async function`. Tipo é apagado. */

export type MasteryState = {
  done: boolean;
  passed?: boolean;
  message?: string;
  accuracyPercent?: number;
  correct?: number;
  total?: number;
};

/**
 * Corrige a prova de domínio.
 *
 * ⚠️ AS RESPOSTAS VÊM COMO UM CAMPO JSON ÚNICO, e não vinte campos.
 *
 * Vinte campos nomeados exigiriam varrer o `FormData` procurando um prefixo, e
 * varredura traz junto os `$ACTION_REF_*` que o React injeta — erro que já
 * custou uma correção nesta base. Um campo declarado é lido pelo nome.
 */
export async function gradeMasteryAction(
  _prev: MasteryState,
  formData: FormData,
): Promise<MasteryState> {
  const session = await requireUser();

  const planTopicId = texto(formData, "planTopicId");
  if (!planTopicId) return { done: false, message: "Assunto inválido." };

  let respostas: Array<{ questionId: string; optionId: string }>;
  try {
    const cru = JSON.parse(texto(formData, "answers")) as unknown;

    /*
      O corpo vem do navegador, então a forma é conferida antes de ir ao banco.
      Sem isto, um array de objetos estranhos viraria SQL com `undefined` dentro
      da cláusula `in`.
    */
    respostas = Array.isArray(cru)
      ? cru.flatMap((item) =>
          item &&
          typeof item === "object" &&
          typeof (item as { questionId?: unknown }).questionId === "string" &&
          typeof (item as { optionId?: unknown }).optionId === "string"
            ? [item as { questionId: string; optionId: string }]
            : [],
        )
      : [];
  } catch {
    return { done: false, message: "Não consegui ler suas respostas." };
  }

  if (respostas.length === 0) {
    return { done: false, message: "Responda as questões antes de enviar." };
  }

  const { verdict, markedAsMastered } = await gradeMasteryExam({
    userId: session.user.id,
    planTopicId,
    answers: respostas,
  });

  if (markedAsMastered) {
    /*
      A trilha mostra o selo de dominado e a Home conta cobertura. Sem isto o
      aluno volta e vê o assunto exatamente como antes da prova que acabou de
      passar.
    */
    revalidatePath("/trilhas");
    revalidatePath("/inicio");
    revalidatePath("/cronograma");
  }

  return {
    done: true,
    passed: verdict.passed,
    message: verdict.message,
    accuracyPercent: verdict.accuracyPercent,
    correct: verdict.correct,
    total: verdict.total,
  };
}

function texto(formData: FormData, chave: string): string {
  const valor = formData.get(chave);
  return typeof valor === "string" ? valor.trim() : "";
}
