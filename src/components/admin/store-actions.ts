"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/server/auth/guards";
import { fulfillRedemption, upsertStoreItem } from "@/server/engine/store";

/** ⚠️ Arquivo `"use server"`: só exporta `async function`. Tipo é apagado. */

export type StoreFormState = {
  ok: boolean;
  message?: string;
};

/**
 * Cria ou atualiza um item da loja.
 *
 * ⚠️ LÊ CAMPO POR CAMPO, com `formData.get`.
 *
 * Varrer o `FormData` inteiro é o erro que já custou uma correção nesta base: o
 * React injeta os próprios campos (`$ACTION_REF_*`) no formulário de uma Server
 * Action ligada, e eles chegam junto. Nomear o que se lê é o que impede a
 * plumbagem do framework de virar dado.
 */
export async function saveStoreItemAction(
  _prev: StoreFormState,
  formData: FormData,
): Promise<StoreFormState> {
  await requireAdmin();

  const nome = texto(formData, "name");
  const codigo = texto(formData, "code");
  const custo = Number(texto(formData, "costCoins").replace(",", "."));
  const estoqueBruto = texto(formData, "stock");

  if (!nome) return { ok: false, message: "O item precisa de um nome." };
  if (!codigo) return { ok: false, message: "O item precisa de um código." };

  if (!Number.isInteger(custo) || custo <= 0) {
    return { ok: false, message: "O custo precisa ser um número inteiro maior que zero." };
  }

  /*
    Campo vazio significa ESTOQUE ILIMITADO, e não zero. Um zero silencioso
    publicaria o item já esgotado — visível na loja e impossível de resgatar,
    que é a pior combinação possível.
  */
  const estoque = estoqueBruto === "" ? null : Number(estoqueBruto);
  if (estoque !== null && (!Number.isInteger(estoque) || estoque < 0)) {
    return { ok: false, message: "O estoque precisa ser um inteiro, ou vazio para ilimitado." };
  }

  const imagem = texto(formData, "imageUrl") || null;

  if (imagem && !/^https?:\/\//i.test(imagem)) {
    /*
      Sem o esquema, o navegador trata "imagens.com/x.png" como caminho relativo
      e o card fica com a imagem quebrada dentro da nossa própria loja.
    */
    return { ok: false, message: "O endereço da imagem precisa começar com https://" };
  }

  await upsertStoreItem({
    code: codigo,
    name: nome,
    description: texto(formData, "description") || null,
    imageUrl: imagem,
    costCoins: custo,
    stock: estoque,
    isActive: formData.get("isActive") === "on",
  });

  revalidatePath("/admin/loja");
  revalidatePath("/loja");

  return { ok: true, message: `"${nome}" está na loja.` };
}

/** Marca um resgate como entregue. */
export async function fulfillRedemptionAction(
  _prev: StoreFormState,
  formData: FormData,
): Promise<StoreFormState> {
  await requireAdmin();

  const id = formData.get("redemptionId");
  if (typeof id !== "string") return { ok: false, message: "Resgate inválido." };

  const feito = await fulfillRedemption(id);
  revalidatePath("/admin/loja");

  return feito
    ? { ok: true, message: "Resgate marcado como entregue." }
    : { ok: false, message: "Este resgate já não estava pendente." };
}

function texto(formData: FormData, chave: string): string {
  const valor = formData.get(chave);
  return typeof valor === "string" ? valor.trim() : "";
}
