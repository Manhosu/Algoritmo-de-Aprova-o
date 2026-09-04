"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/server/auth/guards";
import { setPlanManually } from "@/server/admin/plan-override";

/** ⚠️ Arquivo `"use server"`: só exporta `async function`. Tipo é apagado. */

export type PlanOverrideState = {
  ok: boolean;
  message?: string;
};

/**
 * Concede ou troca o plano de um aluno pelo painel.
 *
 * ⚠️ `requireAdmin` NA PRIMEIRA LINHA. Esta ação dá acesso pago de graça: se ela
 * fosse alcançável por um aluno, ele assinaria o Premium sozinho.
 */
export async function setPlanAction(
  _prev: PlanOverrideState,
  formData: FormData,
): Promise<PlanOverrideState> {
  const session = await requireAdmin();

  const userId = texto(formData, "userId");
  const planCode = texto(formData, "planCode");

  if (!userId || !planCode) return { ok: false, message: "Escolha o plano." };

  const resultado = await setPlanManually({
    userId,
    planCode,
    changedByUserId: session.user.id,
    note: texto(formData, "note") || null,
  });

  if (!resultado.ok) return { ok: false, message: resultado.message };

  /*
    Três telas mudam: a do aluno no painel, a lista de alunos (que mostra o
    plano) e a aba Planos, que conta quantos estão em cada um.
  */
  revalidatePath(`/admin/alunos/${userId}`);
  revalidatePath("/admin/alunos");
  revalidatePath("/admin/planos");

  return { ok: true, message: `Plano alterado para ${resultado.planName}.` };
}

function texto(formData: FormData, chave: string): string {
  const valor = formData.get(chave);
  return typeof valor === "string" ? valor.trim() : "";
}
