"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/server/auth/guards";
import { apagarJogo, salvarJogo } from "@/server/games/service";

/** ⚠️ Arquivo `"use server"`: só exporta `async function`. Tipo é apagado. */

export type GameFormState = {
  ok: boolean;
  message?: string;
};

function texto(formData: FormData, chave: string): string {
  const valor = formData.get(chave);
  return typeof valor === "string" ? valor.trim() : "";
}

/** Cria ou atualiza um jogo. Com `id` no formulário, atualiza. */
export async function saveGameAction(
  _prev: GameFormState,
  formData: FormData,
): Promise<GameFormState> {
  const session = await requireAdmin();

  const resultado = await salvarJogo({
    id: texto(formData, "id") || null,
    title: texto(formData, "title"),
    description: texto(formData, "description") || null,
    gameUrl: texto(formData, "gameUrl"),
    imageStoragePath: texto(formData, "imageStoragePath") || null,
    minPlanId: texto(formData, "minPlanId") || null,
    isPublished: formData.get("isPublished") === "on",
    createdByUserId: session.user.id,
  });

  if (!resultado.ok) return { ok: false, message: resultado.message };

  revalidatePath("/admin/jogos");
  revalidatePath("/jogos");

  return { ok: true, message: "Jogo salvo." };
}

export async function deleteGameAction(
  _prev: GameFormState,
  formData: FormData,
): Promise<GameFormState> {
  await requireAdmin();

  const apagou = await apagarJogo(texto(formData, "id"));

  revalidatePath("/admin/jogos");
  revalidatePath("/jogos");

  return apagou ? { ok: true, message: "Jogo excluído." } : { ok: false, message: "Esse jogo já tinha sido excluído." };
}
