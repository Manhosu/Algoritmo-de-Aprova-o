"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/server/auth/guards";
import { touchContentProgress } from "@/server/content/library";
import { rewardMaterialStudied } from "@/server/engine/material-reward";

/** ⚠️ Arquivo `"use server"`: só exporta `async function`. Tipo é apagado. */

export type MarkState = {
  done: boolean;
  /** Preenchido só na marcação que PAGOU — reabrir não repete o aviso. */
  xpEarned?: number;
  coinsEarned?: number;
};

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

  /*
    ⚠️ A RECOMPENSA VEM ANTES DA MARCAÇÃO, e a ordem é o que a torna pagável.

    `rewardMaterialStudied` decide se paga olhando se o progresso JÁ está
    `completed`. Gravar a conclusão primeiro faria ele encontrar o item pronto e
    concluir que já tinha pago — ninguém receberia nada, nunca, e o sintoma seria
    "as moedas não aparecem" sem erro em lugar algum.
  */
  const ganho = await rewardMaterialStudied({
    userId: session.user.id,
    contentItemId,
  });

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
  /* O saldo de moedas e o XP aparecem na Home e na Loja. */
  revalidatePath("/inicio");
  revalidatePath("/loja");

  return { done: true, xpEarned: ganho.xpEarned, coinsEarned: ganho.coinsEarned };
}
