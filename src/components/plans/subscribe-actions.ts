"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/server/auth/guards";
import { startSubscriptionCheckout } from "@/server/billing/subscription";

/** ⚠️ Arquivo `"use server"`: só exporta `async function`. Tipo é apagado. */

export type SubscribeState = {
  ok: boolean;
  message?: string;
};

/**
 * Abre o checkout do Mercado Pago para o plano escolhido.
 *
 * ⚠️ SÓ O CÓDIGO DO PLANO VEM DO FORMULÁRIO. O preço é lido do banco dentro de
 * `startSubscriptionCheckout` — se o valor viajasse daqui, qualquer pessoa com o
 * inspetor aberto assinaria o Premium por um centavo.
 */
export async function subscribeAction(
  _prev: SubscribeState,
  formData: FormData,
): Promise<SubscribeState> {
  const session = await requireUser();

  const planCode = texto(formData, "planCode");
  const periodo = texto(formData, "billingPeriod") === "annual" ? "annual" : "monthly";

  if (!planCode) return { ok: false, message: "Escolha um plano." };

  const resultado = await startSubscriptionCheckout({
    userId: session.user.id,
    planCode,
    billingPeriod: periodo,
  });

  if (!resultado.ok) return { ok: false, message: resultado.message };

  /*
    `redirect` lança, então precisa ficar fora de try/catch e no fim. O destino é
    o Mercado Pago: daqui em diante quem conduz é o checkout deles, e o aluno
    volta pela `back_url` que a assinatura carrega.
  */
  redirect(resultado.checkoutUrl);
}

function texto(formData: FormData, chave: string): string {
  const valor = formData.get(chave);
  return typeof valor === "string" ? valor.trim() : "";
}
