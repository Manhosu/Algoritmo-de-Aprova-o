"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useActionState, useState } from "react";

import { Field, FormError } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { createPreparationAction, type PreparationFormState } from "./actions";

const INITIAL: PreparationFormState = { status: "idle" };

export type ExamBoardOption = { id: string; shortName: string; name: string };

/**
 * Passo 1 do fluxo do "+": o que o aluno vai prestar.
 *
 * SOBRE A DATA DA PROVA
 * ----------------------------------------------------------------------------
 * O README não pedia esse campo, mas o Motor 1 depende dele: "urgência
 * (proximidade da prova)" é 20% da priorização. Sem data, esse sinal fica
 * neutro e o motor perde um quinto da capacidade de decidir.
 *
 * Por isso a data é opcional MAS marcada: quem não sabe a data ainda escolhe
 * "não sei" e o sistema usa urgência neutra, em vez de acelerar em cima de um
 * chute. Quem chuta uma data-alvo marca como estimada, e o efeito é o mesmo —
 * a diferença é que a contagem regressiva aparece com o aviso.
 */
export function NewPreparationForm({ examBoards }: { examBoards: ExamBoardOption[] }) {
  const [state, formAction, pending] = useActionState(createPreparationAction, INITIAL);
  const [dateMode, setDateMode] = useState<"known" | "estimated" | "unknown">("unknown");
  const errors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {state.status === "error" && state.formError ? (
        <FormError>{state.formError}</FormError>
      ) : null}

      <Field
        label="Cargo pretendido"
        name="cargo"
        required
        placeholder="Analista Judiciário — Área Administrativa"
        defaultValue={state.values?.cargo}
        hint="Como aparece no edital. É o que aparece no topo da sua preparação."
        error={errors?.cargo}
      />

      <Field
        label="Órgão ou instituição"
        name="orgao"
        placeholder="Tribunal de Justiça de São Paulo"
        defaultValue={state.values?.orgao}
        hint="Opcional."
        error={errors?.orgao}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="banca">Banca organizadora</Label>
        <select
          id="banca"
          name="banca"
          defaultValue={state.values?.banca ?? ""}
          className={cn(
            "h-10 rounded-lg border border-input bg-transparent px-3 text-sm text-foreground",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          )}
        >
          <option value="">Não sei ainda</option>
          {examBoards.map((board) => (
            <option key={board.id} value={board.id}>
              {board.shortName} — {board.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Opcional. Você continua praticando questões de outras bancas.
        </p>
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

        {dateMode !== "unknown" ? (
          <Field
            label={dateMode === "known" ? "Quando é a prova" : "Data estimada"}
            name="dataProva"
            type="date"
            defaultValue={state.values?.dataProva}
            hint={
              dateMode === "estimated"
                ? "Marcamos como estimativa. O algoritmo não acelera em cima de uma data que ainda pode mudar."
                : undefined
            }
            error={errors?.dataProva}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Sem problema. Você informa depois, e a contagem regressiva aparece quando
            souber.
          </p>
        )}
      </fieldset>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            Criando…
          </>
        ) : (
          <>
            Continuar para o edital
            <ArrowRight aria-hidden />
          </>
        )}
      </Button>
    </form>
  );
}
