"use server";

import { revalidatePath } from "next/cache";

import { requireApiUser } from "@/server/auth/guards";
import { OTHER_EXAM_BOARD } from "@/config/app";
import {
  archivePreparation,
  renamePreparation,
  updateExamDetails,
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

/**
 * Atualiza cargo, órgão, banca e data da prova.
 *
 * ⚠️ Recebe `FormData` porque o formulário usa `useActionState`, e não uma
 * lista de argumentos como as outras ações desta tela — que são acionadas por
 * botão, sem campos.
 */
export async function updateExamDetailsAction(
  preparationId: string,
  _prev: ManageResult,
  formData: FormData,
): Promise<ManageResult> {
  const session = await requireApiUser();

  const modo = String(formData.get("dataModo") ?? "unknown");
  const data = String(formData.get("dataProva") ?? "").trim();
  const banca = String(formData.get("banca") ?? "").trim();

  const result = await updateExamDetails({
    userId: session.user.id,
    preparationId,
    targetPosition: String(formData.get("cargo") ?? ""),
    institution: String(formData.get("orgao") ?? "") || null,
    // "Outra" não tem id para gravar: vira nulo, como "não sei".
    examBoardId: banca && banca !== OTHER_EXAM_BOARD ? banca : null,
    examDate: modo === "unknown" || !data ? null : data,
    examDateIsEstimated: modo === "estimated",
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
