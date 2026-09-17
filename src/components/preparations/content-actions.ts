"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { parseContentEdits, type ContentEdit } from "@/modules/preparations/content-edits";
import { requireApiUser } from "@/server/auth/guards";
import { savePlanContent } from "@/server/preparations/content";

export type ContentFormState = {
  status: "idle" | "saved" | "error";
  message?: string;
};

/**
 * Salva a revisão do conteúdo programático.
 *
 * O formulário manda a lista INTEIRA em um campo só, como JSON. Um input por
 * campo daria três mil inputs num edital comum — o navegador aguenta, o celular
 * do aluno não, e a submissão viraria um megabyte de `application/x-www-form-
 * urlencoded`.
 *
 * O servidor reconcilia: o que sumiu é apagado, o que ficou é atualizado, o que
 * é novo é inserido. Nada é confiado ao cliente além do texto digitado — a
 * posse da preparação e o casamento com o catálogo são refeitos aqui.
 */
export async function saveContentAction(
  _prev: ContentFormState,
  formData: FormData,
): Promise<ContentFormState> {
  const session = await requireApiUser();

  const preparationId = String(formData.get("preparacaoId") ?? "");
  const confirm = formData.get("confirmar") === "1";

  let topics: ContentEdit[];
  try {
    topics = parseContentEdits(formData.get("assuntos"));
  } catch {
    return {
      status: "error",
      message: "Não conseguimos ler as alterações. Recarregue a página e tente de novo.",
    };
  }

  const result = await savePlanContent({
    preparationId,
    userId: session.user.id,
    topics,
    confirm,
  });

  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  if (confirm) {
    redirect(`/preparacoes/${preparationId}/diagnostico`);
  }

  revalidatePath(`/preparacoes/${preparationId}/conteudo`);
  return { status: "saved" };
}

