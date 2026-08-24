"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireApiUser } from "@/server/auth/guards";
import { savePlanContent, type ContentEdit } from "@/server/preparations/content";

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
    topics = parseTopics(formData.get("assuntos"));
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

/**
 * Converte o JSON do formulário, descartando o que não tem forma válida.
 *
 * O payload vem do navegador e pode ter sido adulterado. Cada campo é
 * convertido explicitamente em vez de confiar na forma do objeto: um `weight`
 * vindo como string `"1e9"` ou `NaN` chegaria ao motor e faria um assunto valer
 * mais que o edital inteiro.
 */
function parseTopics(raw: FormDataEntryValue | null): ContentEdit[] {
  const parsed: unknown = JSON.parse(String(raw ?? "[]"));
  if (!Array.isArray(parsed)) throw new Error("formato inválido");

  return parsed.flatMap((item): ContentEdit[] => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;

    const subjectId = typeof record.subjectId === "string" ? record.subjectId : null;
    const displayName = typeof record.displayName === "string" ? record.displayName : "";
    if (!subjectId || displayName.trim() === "") return [];

    const weightRaw = record.weight;
    const weightNumber =
      typeof weightRaw === "number"
        ? weightRaw
        : typeof weightRaw === "string" && weightRaw.trim() !== ""
          ? Number(weightRaw)
          : null;

    const weight =
      weightNumber !== null && Number.isFinite(weightNumber) && weightNumber >= 0
        ? Math.min(Math.round(weightNumber), 500)
        : null;

    return [
      {
        id: typeof record.id === "string" && record.id !== "" ? record.id : null,
        subjectId,
        displayName,
        weight,
        isActive: record.isActive !== false,
      },
    ];
  });
}
