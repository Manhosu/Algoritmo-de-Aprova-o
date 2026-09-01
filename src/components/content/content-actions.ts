"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/server/auth/guards";
import { touchContentProgress } from "@/server/content/library";

/** ⚠️ Arquivo `"use server"`: só exporta `async function`. Tipo é apagado. */

export type MarkState = { done: boolean };

/**
 * ⚠️ O `FormData` NÃO ENTRA NA ASSINATURA, de propósito.
 *
 * `useActionState` chama a ação com `(estadoAnterior, formData)` e o
 * `contentItemId` vem amarrado antes por `bind`. Como não há campo nenhum para
 * ler, declarar o terceiro parâmetro só para ignorá-lo seria ruído: JavaScript
 * descarta argumento a mais sem reclamar.
 *
 * O estado anterior, esse sim, é usado — e evita uma escrita repetida quando o
 * botão é acionado duas vezes.
 */
export async function markMaterialComplete(
  contentItemId: string,
  prev: MarkState,
): Promise<MarkState> {
  if (prev.done) return prev;

  const session = await requireUser();

  await touchContentProgress({
    userId: session.user.id,
    contentItemId,
    completed: true,
  });

  /*
    A lista precisa refletir o selo de concluído na volta. Sem isto o aluno
    marca, volta para /estudos e vê o cartão exatamente como antes — e conclui
    que o botão não funcionou.
  */
  revalidatePath("/estudos");

  return { done: true };
}
