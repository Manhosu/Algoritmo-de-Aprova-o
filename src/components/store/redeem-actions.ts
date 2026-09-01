"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/server/auth/guards";
import { redeemItem } from "@/server/engine/store";

/** ⚠️ Arquivo `"use server"`: só exporta `async function`. Tipo é apagado. */

export type RedeemState = {
  ok: boolean;
  message?: string;
};

const RECUSA = {
  not_found: "Este item saiu da loja.",
  no_coins: "Suas moedas não cobrem este item.",
  out_of_stock: "Este item acabou.",
} as const;

/**
 * Resgata um item da loja.
 *
 * ⚠️ O ID DO ITEM VEM DO FORMULÁRIO, e o preço NÃO.
 *
 * Se o custo viesse por campo escondido, qualquer pessoa alteraria o HTML e
 * levaria um item de 500 moedas por 1. `redeemItem` lê o preço do banco pelo id
 * — a única coisa que o cliente escolhe é QUAL item, que é a única coisa que
 * cabe a ele escolher.
 */
export async function redeemItemAction(
  _prev: RedeemState,
  formData: FormData,
): Promise<RedeemState> {
  const session = await requireUser();
  const storeItemId = formData.get("storeItemId");

  if (typeof storeItemId !== "string") {
    return { ok: false, message: "Item inválido." };
  }

  const resultado = await redeemItem({ userId: session.user.id, storeItemId });

  if (!resultado.ok) {
    return { ok: false, message: RECUSA[resultado.reason] };
  }

  revalidatePath("/loja");

  return {
    ok: true,
    message: `Resgatado. Restam ${resultado.remaining} moedas — a equipe entra em contato para entregar.`,
  };
}
