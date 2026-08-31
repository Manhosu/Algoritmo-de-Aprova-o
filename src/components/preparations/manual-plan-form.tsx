"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { saveManualPlanAction, type ManualPlanState } from "./manual-plan-actions";

/**
 * Digitar o edital quando a leitura automática não funciona.
 *
 * ⚠️ UM ASSUNTO POR LINHA, NUM `textarea` — e não um campo por assunto.
 *
 * A pessoa está copiando de um PDF, onde o conteúdo programático já vem em
 * lista. Colar tudo de uma vez e deixar a quebra de linha separar é o gesto que
 * ela faria de qualquer jeito; um campo por assunto obrigaria trinta cliques em
 * "adicionar" para o que o Ctrl+V resolve.
 *
 * Os blocos são identificados por POSIÇÃO no formulário (`disciplina-0`,
 * `assuntos-0`). Simples o bastante para a ação remontar sem estado paralelo.
 */
export function ManualPlanForm({ preparationId }: { preparationId: string }) {
  const [state, formAction, pending] = useActionState<ManualPlanState, FormData>(
    saveManualPlanAction.bind(null, preparationId),
    { ok: false },
  );

  const [blocos, setBlocos] = useState([0]);

  const campo =
    "rounded-lg border border-input bg-input px-3 py-2.5 text-sm text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {blocos.map((id, indice) => (
        <section key={id} className="rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              Disciplina {indice + 1}
            </span>

            {blocos.length > 1 ? (
              <button
                type="button"
                onClick={() => setBlocos((atual) => atual.filter((b) => b !== id))}
                className="flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Trash2 className="size-3.5" aria-hidden />
                Remover
              </button>
            ) : null}
          </div>

          <div className="mt-3 flex flex-col gap-1.5">
            <Label htmlFor={`disciplina-${indice}`}>Nome da disciplina</Label>
            <input
              id={`disciplina-${indice}`}
              name={`disciplina-${indice}`}
              placeholder="Língua Portuguesa"
              className={cn(campo, "h-11")}
            />
          </div>

          <div className="mt-3 flex flex-col gap-1.5">
            <Label htmlFor={`assuntos-${indice}`}>Assuntos, um por linha</Label>
            <textarea
              id={`assuntos-${indice}`}
              name={`assuntos-${indice}`}
              rows={6}
              placeholder={"Crase\nConcordância verbal e nominal\nRegência verbal e nominal"}
              className={campo}
            />
            <p className="text-xs text-muted-foreground">
              Pode colar direto do edital. Cada linha vira um assunto.
            </p>
          </div>
        </section>
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={() => setBlocos((atual) => [...atual, Math.max(...atual) + 1])}
      >
        <Plus aria-hidden />
        Acrescentar disciplina
      </Button>

      {state.message ? (
        <p
          role="status"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-foreground"
        >
          {state.message}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Salvar e ir para o diagnóstico
      </Button>
    </form>
  );
}
