"use server";

import { redirect } from "next/navigation";

import { requireApiUser } from "@/server/auth/guards";
import { createManualPlan } from "@/server/preparations/manual-plan";

/**
 * ⚠️ ARQUIVO `"use server"`: só exporta `async function`. Tipo é apagado na
 * compilação, então `export type` pode ficar.
 */

export type ManualPlanState = { ok: boolean; message?: string };

/**
 * Grava o edital digitado à mão.
 *
 * O formulário manda pares `disciplina-N` e `assuntos-N`, onde N é a posição do
 * bloco na tela. Reconstruir a partir disso — em vez de mandar um JSON num
 * campo escondido — é o que faz o navegador manter tudo preenchido quando a
 * gravação é recusada: o estado continua sendo o dos campos.
 */
export async function saveManualPlanAction(
  preparationId: string,
  _prev: ManualPlanState,
  formData: FormData,
): Promise<ManualPlanState> {
  const session = await requireApiUser();

  const blocos = new Map<string, { name: string; topics: string[] }>();

  for (const [chave, valor] of formData.entries()) {
    if (typeof valor !== "string") continue;

    const disciplina = chave.match(/^disciplina-(\d+)$/);
    if (disciplina) {
      const bloco = blocos.get(disciplina[1]) ?? { name: "", topics: [] };
      blocos.set(disciplina[1], { ...bloco, name: valor });
      continue;
    }

    const assuntos = chave.match(/^assuntos-(\d+)$/);
    if (assuntos) {
      const bloco = blocos.get(assuntos[1]) ?? { name: "", topics: [] };
      // Um assunto por linha: é como a pessoa cola do PDF do edital.
      blocos.set(assuntos[1], { ...bloco, topics: valor.split(/\r?\n/) });
    }
  }

  const subjects = [...blocos.entries()]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, bloco]) => bloco);

  const resultado = await createManualPlan({
    preparationId,
    userId: session.user.id,
    subjects,
  });

  if (!resultado.ok) return { ok: false, message: resultado.message };

  redirect(`/preparacoes/${preparationId}/diagnostico`);
}
