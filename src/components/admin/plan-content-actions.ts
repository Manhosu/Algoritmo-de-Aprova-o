"use server";

import { revalidatePath } from "next/cache";

import { parseContentEdits } from "@/modules/preparations/content-edits";
import { requireAdmin } from "@/server/auth/guards";
import { savePlanContent } from "@/server/preparations/content";

/** ⚠️ Arquivo `"use server"`: só exporta `async function`. Tipo é apagado. */

export type PlanContentFormState = {
  status: "idle" | "saved" | "error";
  message?: string;
};

/**
 * A cliente corrige o conteúdo do edital de um aluno.
 *
 * Pedido dela em 17/09/2026: uma leitura de edital deixou parte do conteúdo de
 * fora, o aluno confirmou sem notar, e o cronograma dele nasceu incompleto. Ela
 * enxerga o problema no painel e não tinha como consertar.
 *
 * ⚠️ O CRONOGRAMA NÃO PRECISA SER REFEITO À MÃO. Ele é projetado a cada leitura
 * a partir dos assuntos pendentes do plano: assunto acrescentado aqui entra na
 * projeção do aluno na próxima vez que ele abrir a tela.
 */
export async function saveAdminPlanContentAction(
  _prev: PlanContentFormState,
  formData: FormData,
): Promise<PlanContentFormState> {
  const session = await requireAdmin();

  const preparationId = String(formData.get("preparacaoId") ?? "");
  const alunoId = String(formData.get("alunoId") ?? "");

  let topics;
  try {
    topics = parseContentEdits(formData.get("assuntos"));
  } catch {
    return {
      status: "error",
      message: "Não consegui ler as alterações. Recarregue a página e tente de novo.",
    };
  }

  const resultado = await savePlanContent({
    preparationId,
    userId: session.user.id,
    topics,
    /* Confirmar é passo do aluno: aqui só se corrige o conteúdo. */
    confirm: false,
    asAdmin: true,
  });

  if (!resultado.ok) return { status: "error", message: resultado.message };

  revalidatePath(`/admin/alunos/${alunoId}`);
  revalidatePath(`/admin/alunos/${alunoId}/conteudo`);

  return {
    status: "saved",
    message: `Salvo. ${resultado.added} incluído(s), ${resultado.removed} removido(s), ${resultado.remapped} renomeado(s).`,
  };
}
