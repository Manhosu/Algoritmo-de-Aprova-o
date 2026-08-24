"use server";

import { revalidatePath } from "next/cache";

import { requireApiUser } from "@/server/auth/guards";
import {
  archivePreparation,
  renamePreparation,
  reopenPreparation,
  switchPreparation,
} from "@/server/preparations/manage";

export type ManageResult = { ok: boolean; message?: string };

/**
 * As quatro ações da tela de gestão da preparação (README 1.10).
 *
 * Todas revalidam `/inicio` além da própria tela: trocar de preparação muda o
 * que a Home mostra, e deixá-la em cache faria o aluno trocar e continuar
 * vendo o plano antigo — parecendo que o botão não funcionou.
 */

function refresh() {
  revalidatePath("/preparacoes");
  revalidatePath("/inicio");
}

export async function switchPreparationAction(
  preparationId: string,
): Promise<ManageResult> {
  const session = await requireApiUser();
  const result = await switchPreparation({ userId: session.user.id, preparationId });

  if (!result.ok) {
    return {
      ok: false,
      message:
        result.reason === "archived"
          ? "Esta preparação está encerrada. Reabra antes de usá-la."
          : "Preparação não encontrada.",
    };
  }

  refresh();
  return { ok: true };
}

export async function renamePreparationAction(
  preparationId: string,
  title: string,
): Promise<ManageResult> {
  const session = await requireApiUser();
  const result = await renamePreparation({
    userId: session.user.id,
    preparationId,
    title,
  });

  if (result.ok) refresh();
  return result;
}

export async function archivePreparationAction(
  preparationId: string,
): Promise<ManageResult> {
  const session = await requireApiUser();
  const result = await archivePreparation({ userId: session.user.id, preparationId });

  if (!result.ok) return { ok: false, message: "Preparação não encontrada." };

  refresh();
  return { ok: true };
}

export async function reopenPreparationAction(
  preparationId: string,
): Promise<ManageResult> {
  const session = await requireApiUser();
  const result = await reopenPreparation({ userId: session.user.id, preparationId });

  if (result.ok) refresh();
  return result;
}
