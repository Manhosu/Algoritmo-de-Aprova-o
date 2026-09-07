"use client";

import { Loader2, Upload } from "lucide-react";
import { useActionState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import {
  importMaterialsAction,
  type MaterialImportState,
} from "./import-actions";

const INICIAL: MaterialImportState = {};

/**
 * Importação de materiais por planilha.
 *
 * ⚠️ A AÇÃO É CHAMADA DE DENTRO DO `onSubmit`, e não por `action={}`.
 *
 * O React 19 limpa o formulário assim que a ação termina, e num formulário com
 * arquivo isso quebra o fluxo inteiro: "Conferir sem gravar" roda, mostra o
 * relatório e apaga o arquivo escolhido, então "Importar" responde "Escolha uma
 * planilha". A conferência ficaria inútil justamente por funcionar. É o mesmo
 * conserto do formulário de questões.
 */
export function MaterialImportForm({ colunas }: { colunas: readonly string[] }) {
  const [state, dispatch] = useActionState<MaterialImportState, FormData>(
    importMaterialsAction,
    INICIAL,
  );
  const [pending, startTransition] = useTransition();

  function enviar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    /* `submitter` é o botão que enviou: é como "conferir" e "importar" se distinguem. */
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const dados = new FormData(
      event.currentTarget,
      submitter instanceof HTMLButtonElement ? submitter : null,
    );

    startTransition(() => dispatch(dados));
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="material-sheet">Planilha (.xlsx)</Label>
          <input
            id="material-sheet"
            name="sheet"
            type="file"
            accept=".xlsx"
            required
            className="rounded-lg border border-input bg-input px-3 py-2.5 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/15 file:px-3 file:py-1.5 file:text-sm file:text-primary focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
          <p className="text-xs text-pretty text-muted-foreground">
            Colunas: <span className="text-metric">{colunas.join(", ")}</span>. As
            quatro primeiras são obrigatórias; as outras podem ficar em branco.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            name="acao"
            value="conferir"
            variant="outline"
            disabled={pending}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Conferir sem gravar
          </Button>

          <Button type="submit" name="acao" value="importar" disabled={pending}>
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Upload aria-hidden />
            )}
            Importar
          </Button>
        </div>
      </form>

      {state.message ? (
        <p
          role="status"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-pretty text-foreground"
        >
          {state.message}
        </p>
      ) : null}

      {state.report ? <Relatorio report={state.report} /> : null}
    </div>
  );
}

function Relatorio({
  report,
}: {
  report: NonNullable<MaterialImportState["report"]>;
}) {
  const conferencia = report.created === 0 && report.updated === 0;

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 text-sm"
    >
      <p className="font-semibold text-foreground">{report.fileName}</p>

      <p className="text-pretty text-muted-foreground">
        {conferencia ? (
          <>
            {report.matched} de {report.parsed}{" "}
            {report.parsed === 1 ? "linha casou" : "linhas casaram"} com o catálogo.
            Nada foi gravado.
          </>
        ) : (
          <>
            {report.created} {report.created === 1 ? "material novo" : "materiais novos"}
            {report.updated > 0 ? ` e ${report.updated} atualizados` : ""}.
          </>
        )}
      </p>

      {/*
        ⚠️ O NÚMERO DE RASCUNHOS APARECE SEMPRE, e é o mais fácil de esquecer.

        Material sem endereço entra invisível para o aluno. Sem este aviso, a
        cliente importa duzentas linhas, vê "200 materiais novos" e descobre
        semanas depois que metade nunca apareceu na biblioteca.
      */}
      {report.drafts > 0 ? (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-pretty text-foreground">
          {report.drafts}{" "}
          {report.drafts === 1
            ? "entrou como rascunho por estar sem endereço"
            : "entraram como rascunho por estarem sem endereço"}
          . Eles não aparecem para o aluno até você preencher o link.
        </p>
      ) : null}

      {report.issues.length > 0 ? (
        <div>
          <p className="font-medium text-foreground">
            {report.issues.length}{" "}
            {report.issues.length === 1 ? "linha recusada" : "linhas recusadas"}
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
            {report.issues.slice(0, 12).map((problema) => (
              <li key={`${problema.row}-${problema.message}`}>
                Linha {problema.row}: {problema.message}
              </li>
            ))}
            {report.issues.length > 12 ? (
              <li>e mais {report.issues.length - 12}…</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {report.unmatched.length > 0 ? (
        <div>
          <p className="font-medium text-foreground">
            Fora do catálogo — cadastre e reimporte
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
            {report.unmatched.slice(0, 10).map((item) => (
              <li key={item.label}>
                {item.label} · {item.count}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
