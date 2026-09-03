"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { publishReviewIntervalsAction, type EngineFormState } from "./engine-actions";

const ENTRADA =
  "h-11 w-full rounded-lg border border-input bg-input px-3 text-sm text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/**
 * A periodicidade do Motor 2 (pedido da cliente em 02/09/2026).
 *
 * ⚠️ UM CAMPO DE TEXTO, e não cinco campos numerados.
 *
 * A quantidade de etapas é editável: a curva pode ter três intervalos ou oito.
 * Com campos fixos, mudar o número de etapas viraria pedido de deploy — que é
 * exatamente o que esta tela existe para evitar.
 *
 * A regra dos intervalos serem crescentes fica no schema, no servidor. Aqui não
 * há validação além de "são números": duplicar a regra criaria uma segunda
 * fonte que um dia discordaria da primeira.
 */
export function ReviewIntervalsForm({ atuais }: { atuais: number[] }) {
  const [state, formAction, pending] = useActionState<EngineFormState, FormData>(
    publishReviewIntervalsAction,
    { ok: false },
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="intervals">Intervalos, em dias</Label>
        <input
          id="intervals"
          name="intervals"
          required
          defaultValue={atuais.join(", ")}
          placeholder="1, 7, 30, 60, 90"
          className={ENTRADA}
        />
        <p className="text-xs text-pretty text-muted-foreground">
          Quando cada revisão vence, contando do estudo. Precisam ser crescentes
          — é o que faz a curva do esquecimento ser uma curva.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="note-review">Anotação desta versão</Label>
        <input
          id="note-review"
          name="note"
          placeholder="ex.: primeira revisão em 2 dias"
          className={ENTRADA}
        />
      </div>

      {state.message ? (
        <div
          role="status"
          className={cn(
            "rounded-lg border px-3 py-2.5 text-sm",
            state.ok
              ? "border-success/40 bg-success/10 text-foreground"
              : "border-destructive/40 bg-destructive/10 text-foreground",
          )}
        >
          <p className="text-pretty">{state.message}</p>
          {state.problems?.length ? (
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-xs">
              {state.problems.map((problema) => (
                <li key={problema} className="text-pretty">
                  {problema}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Publicar
      </Button>
    </form>
  );
}
