import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { DiagnosisForm } from "@/components/preparations/diagnosis-form";
import { requireUser } from "@/server/auth/guards";
import { DIAGNOSIS_NOTICE, getDiagnosis } from "@/server/preparations/diagnosis";

export const metadata: Metadata = { title: "Diagnóstico inicial" };

/**
 * PASSO 5 DO FLUXO DO "+": o diagnóstico inicial (README 1.5).
 *
 * Última porta do funil de ativação. Ao concluir, a preparação vira `active` e
 * o aluno passa a ter Tarefa do Dia.
 */
export default async function DiagnosisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireUser(`/preparacoes/${id}/diagnostico`);
  const view = await getDiagnosis(id, session.user.id);

  if (!view) notFound();

  // Sem conteúdo confirmado não há disciplina para diagnosticar.
  if (view.subjects.length === 0) redirect(`/preparacoes/${id}/edital`);

  // Já foi feito e não se refaz — mandar de volta é mais honesto que mostrar um
  // formulário que vai recusar a submissão.
  if (view.locked) redirect("/inicio");

  return (
    <div className="mx-auto w-full max-w-lg py-4">
      <div className="mb-5">
        <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          Passo 4 de 4
        </p>
        <h1 className="mt-1 text-2xl font-bold text-balance text-foreground">
          Quanto você domina cada disciplina?
        </h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          Responda de cabeça, sem pesquisar. É o ponto de partida do algoritmo —
          não uma prova.
        </p>
      </div>

      <DiagnosisForm view={view} notice={DIAGNOSIS_NOTICE} />
    </div>
  );
}
