"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/server/auth/guards";
import { archiveMaterial, saveMaterial } from "@/server/admin/material-admin";

/** ⚠️ Arquivo `"use server"`: só exporta `async function`. Tipo é apagado. */

export type MaterialFormState = {
  ok: boolean;
  message?: string;
};

const TIPOS = ["flashcard_deck", "mind_map", "video", "study_text", "pdf", "audio"];

/**
 * Cria ou atualiza um material da biblioteca.
 *
 * Lê campo por campo, com `formData.get` — varrer o `FormData` traria junto os
 * `$ACTION_REF_*` que o React injeta em formulário de Server Action ligada.
 */
export async function saveMaterialAction(
  _prev: MaterialFormState,
  formData: FormData,
): Promise<MaterialFormState> {
  await requireAdmin();

  const tipo = texto(formData, "type");
  if (!TIPOS.includes(tipo)) return { ok: false, message: "Escolha o tipo do material." };

  const resultado = await saveMaterial({
    id: texto(formData, "materialId") || null,
    title: texto(formData, "title"),
    description: texto(formData, "description") || null,
    type: tipo,
    status: situacao(texto(formData, "status")),
    requiredAccessLevel: texto(formData, "requiredAccessLevel") === "full" ? "full" : "limited",
    canonicalSubjectId: texto(formData, "canonicalSubjectId") || null,
    canonicalTopicId: texto(formData, "canonicalTopicId") || null,
    externalUrl: texto(formData, "externalUrl") || null,
  });

  if (!resultado.ok) return { ok: false, message: resultado.message };

  revalidatePath("/admin/materiais");
  revalidatePath(`/admin/materiais/${resultado.id}`);
  /* A biblioteca do aluno lê a mesma tabela. */
  revalidatePath("/estudos");

  if (resultado.created) redirect(`/admin/materiais/${resultado.id}?aviso=criado`);

  return { ok: true, message: "Material salvo." };
}

/** Tira um material de circulação, preservando o histórico de quem o estudou. */
export async function archiveMaterialAction(
  _prev: MaterialFormState,
  formData: FormData,
): Promise<MaterialFormState> {
  await requireAdmin();

  const id = texto(formData, "materialId");
  if (!id) return { ok: false, message: "Material inválido." };

  await archiveMaterial(id);

  revalidatePath("/admin/materiais");
  revalidatePath("/estudos");

  redirect("/admin/materiais?aviso=arquivado");
}

function texto(formData: FormData, chave: string): string {
  const valor = formData.get(chave);
  return typeof valor === "string" ? valor.trim() : "";
}

/*
  Rascunho é o meio-termo seguro: um valor adulterado nunca publica material por
  engano, e o rascunho não aparece para nenhum aluno.
*/
function situacao(valor: string): "draft" | "published" | "archived" {
  return valor === "published" || valor === "archived" ? valor : "draft";
}
