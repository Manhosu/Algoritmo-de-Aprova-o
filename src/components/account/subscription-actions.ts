"use server";

import { revalidatePath } from "next/cache";

import { APP_TIMEZONE } from "@/config/app";
import { requireUser } from "@/server/auth/guards";
import { cancelarAssinaturaDoAluno } from "@/server/billing/cancel";

/** ⚠️ Arquivo `"use server"`: só exporta `async function`. Tipo é apagado. */

export type CancelSubscriptionState = {
  ok: boolean;
  message?: string;
};

/**
 * O botão "Cancelar assinatura" do perfil.
 *
 * O `revalidatePath` aqui é o comportamento certo: depois de cancelar, o
 * próprio bloco "Seu plano" passa a dizer "Assinatura cancelada. Você continua
 * no Premium até…" — é essa a confirmação, lida do banco, e não uma mensagem
 * que o componente inventa.
 */
export async function cancelSubscriptionAction(): Promise<CancelSubscriptionState> {
  const session = await requireUser();

  const resultado = await cancelarAssinaturaDoAluno(session.user.id);
  if (!resultado.ok) return { ok: false, message: resultado.message };

  revalidatePath("/perfil");

  const ate = resultado.acessoAte
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "numeric",
        month: "long",
        timeZone: APP_TIMEZONE,
      }).format(resultado.acessoAte)
    : null;

  return {
    ok: true,
    message: ate
      ? `Você continua no plano até ${ate}, e não haverá novas cobranças.`
      : "Você voltou para o plano Gratuito, e não haverá novas cobranças.",
  };
}
