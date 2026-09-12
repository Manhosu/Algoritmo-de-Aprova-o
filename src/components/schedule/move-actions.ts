"use server";

import { revalidatePath } from "next/cache";

import { getStudentContext } from "@/server/auth/current-user";
import { moverAssunto } from "@/server/engine/schedule-moves";

/** ⚠️ Arquivo `"use server"`: só exporta `async function`. Tipo é apagado. */

export type MoveTopicState = {
  ok: boolean;
  message?: string;
};

/**
 * Move um assunto do cronograma para outro dia, ou o devolve ao automático.
 *
 * O `revalidatePath` é o que se quer aqui: o assunto sai do dia antigo, entra
 * no novo, e a tela inteira se redesenha com a projeção que já leva o
 * movimento em conta.
 */
export async function moveTopicAction(
  _prev: MoveTopicState,
  formData: FormData,
): Promise<MoveTopicState> {
  const context = await getStudentContext();
  if (!context?.currentPreparation) return { ok: false, message: "Entre de novo para continuar." };

  const paraData = String(formData.get("paraData") ?? "");

  const resultado = await moverAssunto({
    userId: context.user.id,
    preparationId: context.currentPreparation.id,
    planTopicId: String(formData.get("planTopicId") ?? ""),
    paraData: paraData === "" ? null : paraData,
  });

  if (!resultado.ok) return { ok: false, message: resultado.message };

  revalidatePath("/cronograma");
  return { ok: true };
}
