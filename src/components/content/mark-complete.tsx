"use client";

import { Check, Loader2 } from "lucide-react";
import { useActionState } from "react";

import { markMaterialComplete, type MarkState } from "./content-actions";

/**
 * "Marquei como estudado."
 *
 * ⚠️ É UM ATO DO ALUNO, não uma inferência da tela.
 *
 * Rolar até o fim ou deixar a aba aberta não significa ter estudado, e o
 * progresso alimenta o Motor 1 — inferir errado aqui faz o algoritmo parar de
 * oferecer um assunto que a pessoa não aprendeu.
 */
export function MarkComplete({ contentItemId }: { contentItemId: string }) {
  const [state, formAction, pending] = useActionState<MarkState, FormData>(
    markMaterialComplete.bind(null, contentItemId),
    { done: false },
  );

  if (state.done) {
    return (
      <p
        role="status"
        className="flex items-center justify-center gap-2 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-foreground"
      >
        <Check className="size-4 shrink-0 text-success" aria-hidden />
        Marcado como estudado.
      </p>
    );
  }

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {pending ? (
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
        ) : (
          <Check className="size-4 shrink-0" aria-hidden />
        )}
        Marcar como estudado
      </button>
    </form>
  );
}
