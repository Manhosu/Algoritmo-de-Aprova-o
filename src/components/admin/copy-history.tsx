"use client";

import { Loader2, Undo2 } from "lucide-react";
import { useActionState } from "react";

import { cn } from "@/lib/utils";

import { restoreCopyAction, type CopyFormState } from "./copy-actions";

type Versao = {
  version: number;
  note: string | null;
  isCurrent: boolean;
  createdAt: string;
};

/**
 * As versões já publicadas, com o botão de voltar para cada uma.
 *
 * POR QUE VOLTAR IMPORTA MAIS AQUI QUE EM OUTRAS TELAS
 * ----------------------------------------------------------------------------
 * A cliente disse que quer TESTAR copies. Testar é publicar, olhar o resultado
 * e desfazer — e sem desfazer de um clique, ela precisaria guardar o texto
 * antigo em algum lugar por conta própria, ou me chamar. Foi para evitar
 * exatamente essa dependência que a tela existe.
 */
export function CopyHistory({ versoes }: { versoes: Versao[] }) {
  const [state, formAction, pending] = useActionState<CopyFormState, FormData>(
    restoreCopyAction,
    { ok: false },
  );

  if (versoes.length === 0) return null;

  return (
    <section className="rounded-xl border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">Versões publicadas</h2>

      <ul className="mt-3 flex flex-col gap-2 text-sm">
        {versoes.map((versao) => (
          <li key={versao.version} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-metric text-xs text-muted-foreground">
              v{versao.version}
            </span>
            <span className="text-muted-foreground">{versao.createdAt}</span>
            {versao.note ? (
              <span className="text-pretty text-foreground">— {versao.note}</span>
            ) : null}

            {versao.isCurrent ? (
              <span className="ml-auto shrink-0 rounded-full border border-primary/50 px-2 py-0.5 text-[0.65rem] text-primary">
                no ar
              </span>
            ) : (
              <form action={formAction} className="ml-auto shrink-0">
                <input type="hidden" name="version" value={versao.version} />
                <button
                  type="submit"
                  disabled={pending}
                  className="flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                >
                  {pending ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Undo2 className="size-3.5" aria-hidden />
                  )}
                  Voltar para esta
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>

      {state.message ? (
        <p
          role="status"
          className={cn(
            "mt-3 rounded-lg border px-3 py-2 text-sm",
            state.ok
              ? "border-success/40 bg-success/10 text-foreground"
              : "border-destructive/40 bg-destructive/10 text-foreground",
          )}
        >
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
