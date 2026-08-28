"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useState } from "react";

import { Field } from "@/components/auth/field";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { OTHER_EXAM_BOARD } from "@/config/app";
import { cn } from "@/lib/utils";

import { updateExamDetailsAction } from "./manage-actions";
import type { ExamBoardOption } from "./new-preparation-form";

type Initial = {
  cargo: string;
  orgao: string;
  banca: string;
  bancaOutra: string;
  dataProva: string;
  estimada: boolean;
};

type DateMode = "unknown" | "known" | "estimated";

/**
 * Formulário de dados da prova, para uma preparação que já existe.
 *
 * ⚠️ NÃO REPROCESSA O EDITAL. Trocar o cargo aqui muda o rótulo e a urgência
 * do Motor 1; o conteúdo programático extraído continua o mesmo. Reprocessar
 * apagaria o que o aluno corrigiu à mão e consumiria uma leitura do plano dele
 * — é decisão que precisa ser dele, na tela do edital.
 */
export function ExamDetailsForm({
  preparationId,
  examBoards,
  initial,
}: {
  preparationId: string;
  examBoards: ExamBoardOption[];
  initial: Initial;
}) {
  const [state, formAction, pending] = useActionState(
    updateExamDetailsAction.bind(null, preparationId),
    { ok: false } as { ok: boolean; message?: string },
  );

  const [banca, setBanca] = useState(initial.banca);

  const [dateMode, setDateMode] = useState<DateMode>(
    initial.dataProva ? (initial.estimada ? "estimated" : "known") : "unknown",
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field
        label="Cargo pretendido"
        name="cargo"
        defaultValue={initial.cargo}
        hint="Como aparece no edital."
        required
      />

      <Field
        label="Órgão ou instituição"
        name="orgao"
        defaultValue={initial.orgao}
        hint="Opcional."
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="banca">Banca organizadora</Label>
        <select
          id="banca"
          name="banca"
          value={banca}
          onChange={(e) => setBanca(e.target.value)}
          className={cn(
            // Mesmo tratamento do formulário de criação: sem `bg-input` e sem
            // pintar as `option`, o navegador abre a lista em branco e o texto
            // claro some sobre ela.
            "h-11 rounded-lg border border-input bg-input px-3 text-sm text-foreground",
            "[&>option]:bg-card [&>option]:text-foreground",
            "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          )}
        >
          <option value="">Não sei ainda</option>
          {examBoards.map((board) => (
            <option key={board.id} value={board.id}>
              {board.shortName} — {board.name}
            </option>
          ))}
          <option value={OTHER_EXAM_BOARD}>Outra banca</option>
        </select>

        {/* Mesmo campo do formulário de criação — ver a nota lá. */}
        {banca === OTHER_EXAM_BOARD ? (
          <Field
            label="Qual é a banca?"
            name="bancaOutra"
            defaultValue={initial.bancaOutra}
            hint="Como aparece no edital. Ainda não temos questões dela, mas guardamos o nome."
            maxLength={120}
          />
        ) : null}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium text-foreground">
          Data da prova
        </legend>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["unknown", "Ainda não sei"],
              ["known", "Sei a data"],
              ["estimated", "Tenho uma estimativa"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={dateMode === mode}
              onClick={() => setDateMode(mode)}
              className={cn(
                "min-h-11 rounded-lg border px-3 text-sm transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                dateMode === mode
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <input type="hidden" name="dataModo" value={dateMode} />

        {dateMode === "unknown" ? (
          <p className="text-sm text-pretty text-muted-foreground">
            Sem data, o cronograma projeta um horizonte e a urgência fica neutra.
            Assim que a banca publicar, volte aqui.
          </p>
        ) : (
          <input
            type="date"
            name="dataProva"
            defaultValue={initial.dataProva}
            required
            className={cn(
              "h-11 rounded-lg border border-input bg-input px-3 text-sm text-foreground",
              "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            )}
          />
        )}
      </fieldset>

      {state.message ? (
        <p
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            state.ok
              ? "border-success/40 bg-success/10 text-foreground"
              : "border-destructive/40 bg-destructive/10 text-foreground",
          )}
          role="status"
        >
          {state.message}
        </p>
      ) : null}

      {state.ok && !state.message ? (
        <p
          className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-foreground"
          role="status"
        >
          Dados atualizados. O cronograma já foi refeito com a data nova.
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Salvar
      </Button>
    </form>
  );
}
