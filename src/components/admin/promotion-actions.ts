"use server";

import { revalidatePath } from "next/cache";

import { lerPrecoEmCentavos } from "@/modules/billing/promotions";
import type { CivilDate } from "@/modules/shared/dates";
import { requireAdmin } from "@/server/auth/guards";
import { criarPromocao, encerrarPromocao } from "@/server/billing/promotions";

/** ⚠️ Arquivo `"use server"`: só exporta `async function`. Tipo é apagado. */

export type PromotionFormState = {
  ok: boolean;
  message?: string;
  problems?: string[];
};

export async function createPromotionAction(
  _prev: PromotionFormState,
  formData: FormData,
): Promise<PromotionFormState> {
  const session = await requireAdmin();

  const valor = lerPrecoEmCentavos(String(formData.get("preco") ?? ""));
  if (valor === null) {
    return { ok: false, problems: ["Informe o preço promocional, por exemplo 69,90."] };
  }

  const resultado = await criarPromocao({
    planId: String(formData.get("planId") ?? ""),
    billingPeriod: formData.get("billingPeriod") === "annual" ? "annual" : "monthly",
    amountCents: valor,
    startsOn: String(formData.get("inicio") ?? "") as CivilDate,
    endsOn: String(formData.get("fim") ?? "") as CivilDate,
    createdByUserId: session.user.id,
  });

  if (!resultado.ok) {
    return { ok: false, message: "A promoção não foi criada.", problems: resultado.problems };
  }

  /* A página de planos lê a promoção na hora; o painel mostra a lista nova. */
  revalidatePath("/admin/planos");
  revalidatePath("/planos");

  return { ok: true, message: "Promoção criada." };
}

export async function endPromotionAction(
  _prev: PromotionFormState,
  formData: FormData,
): Promise<PromotionFormState> {
  await requireAdmin();

  const encerrou = await encerrarPromocao(String(formData.get("id") ?? ""));

  revalidatePath("/admin/planos");
  revalidatePath("/planos");

  return encerrou
    ? { ok: true, message: "Promoção encerrada." }
    : { ok: false, message: "Essa promoção já estava encerrada." };
}
