"use server";

import { redirect } from "next/navigation";

import { isCivilDate } from "@/modules/shared/dates";
import { requireApiUser } from "@/server/auth/guards";
import { createPreparation } from "@/server/preparations/service";

export type PreparationFormState = {
  status: "idle" | "error";
  formError?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

/**
 * Passo 1 do fluxo do "+".
 *
 * O gate de plano ("mais de uma preparação só no Premium") é verificado dentro
 * de `createPreparation`, no servidor — nunca só na tela. A tela pode esconder
 * o botão; a regra tem que valer mesmo para quem enviar o formulário direto.
 */
export async function createPreparationAction(
  _prev: PreparationFormState,
  formData: FormData,
): Promise<PreparationFormState> {
  const session = await requireApiUser();

  const cargo = String(formData.get("cargo") ?? "").trim();
  const orgao = String(formData.get("orgao") ?? "").trim();
  const banca = String(formData.get("banca") ?? "").trim();
  const dataModo = String(formData.get("dataModo") ?? "unknown");
  const dataProva = String(formData.get("dataProva") ?? "").trim();

  const values = { cargo, orgao, banca, dataProva };

  if (cargo.length < 3) {
    return {
      status: "error",
      fieldErrors: { cargo: "Informe o cargo que você vai prestar." },
      values,
    };
  }

  let examDate: string | null = null;
  let isEstimated = false;

  if (dataModo !== "unknown") {
    if (!dataProva || !isCivilDate(dataProva)) {
      return {
        status: "error",
        fieldErrors: { dataProva: "Informe uma data válida." },
        values,
      };
    }
    examDate = dataProva;
    isEstimated = dataModo === "estimated";
  }

  const result = await createPreparation({
    userId: session.user.id,
    targetPosition: cargo,
    institution: orgao || null,
    examBoardId: banca || null,
    examDate,
    examDateIsEstimated: isEstimated,
  });

  if (!result.ok) {
    return {
      status: "error",
      formError:
        `Seu plano permite ${result.limit} preparação ativa e você já tem ${result.current}. ` +
        `Para estudar para mais de um concurso ao mesmo tempo, é preciso o plano Premium — ` +
        `ou encerrar a preparação atual em Configurações.`,
      values,
    };
  }

  redirect(`/preparacoes/${result.preparationId}/edital`);
}
