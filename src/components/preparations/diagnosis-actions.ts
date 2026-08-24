"use server";

import { redirect } from "next/navigation";

import { requireApiUser } from "@/server/auth/guards";
import { submitDiagnosis, type MasteryLevel } from "@/server/preparations/diagnosis";

export type DiagnosisFormState = {
  status: "idle" | "error";
  message?: string;
};

const LEVELS = new Set<MasteryLevel>(["high", "medium", "low"]);

/**
 * Fecha o diagnóstico e ativa a preparação.
 *
 * É a última porta do funil de ativação: ao voltar daqui, o aluno tem Tarefa do
 * Dia. Por isso o redirecionamento vai direto para a Home — a tela seguinte
 * precisa ser a recompensa do que ele acabou de preencher, não um "salvo com
 * sucesso" que o obriga a procurar o caminho sozinho.
 */
export async function submitDiagnosisAction(
  _prev: DiagnosisFormState,
  formData: FormData,
): Promise<DiagnosisFormState> {
  const session = await requireApiUser();

  const preparationId = String(formData.get("preparacaoId") ?? "");

  let answers: Array<{ subjectId: string; level: MasteryLevel }>;
  try {
    answers = parseAnswers(formData.get("respostas"));
  } catch {
    return {
      status: "error",
      message: "Não conseguimos ler suas respostas. Recarregue a página e tente de novo.",
    };
  }

  const result = await submitDiagnosis({
    preparationId,
    userId: session.user.id,
    answers,
  });

  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  redirect("/inicio");
}

function parseAnswers(
  raw: FormDataEntryValue | null,
): Array<{ subjectId: string; level: MasteryLevel }> {
  const parsed: unknown = JSON.parse(String(raw ?? "[]"));
  if (!Array.isArray(parsed)) throw new Error("formato inválido");

  return parsed.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;

    const subjectId = typeof record.subjectId === "string" ? record.subjectId : null;
    const level = record.level;

    // Nível fora da lista é descartado, não convertido para um padrão: um
    // "médio" silencioso seria uma resposta que o aluno não deu, e ele não pode
    // corrigir depois.
    if (!subjectId || typeof level !== "string" || !LEVELS.has(level as MasteryLevel)) {
      return [];
    }

    return [{ subjectId, level: level as MasteryLevel }];
  });
}
