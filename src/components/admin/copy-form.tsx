"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { LandingCopy } from "@/content/landing-schema";
import { cn } from "@/lib/utils";

import { publishCopyAction, type CopyFormState } from "./copy-actions";
import { montarArvore, type No } from "./copy-fields";

/**
 * Editor da copy da página inicial.
 *
 * ⚠️ OS CAMPOS SAEM DE `montarArvore`, não são escritos um a um.
 *
 * Escrever os campos à mão cria um segundo lugar onde a estrutura mora, e ele
 * sai de sincronia no primeiro campo novo. A árvore é pura e testada: o teste
 * remonta o que ela gera e passa pelo schema, que é exatamente o que publicar
 * faz. Ver a nota em `copy-fields.ts` — foi assim que dez listas ficaram de fora.
 *
 * ⚠️ A AÇÃO É CHAMADA DE DENTRO DO `onSubmit`, e não por `action={}`.
 *
 * O React 19 limpa o formulário que governa pelo `action` assim que a ação
 * termina — inclusive quando ela RECUSA. Com `action={}`, uma publicação
 * recusada apagava tudo o que a cliente tinha digitado no celular e devolvia os
 * campos ao texto antigo. É o mesmo conserto dos formulários de importação.
 */
export function CopyForm({ inicial }: { inicial: LandingCopy }) {
  const [state, dispatch] = useActionState<CopyFormState, FormData>(publishCopyAction, {
    ok: false,
  });
  const [pending, startTransition] = useTransition();

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    startTransition(() => dispatch(dados));
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-8">
      {montarArvore(inicial).map((no) => (
        <section key={chaveDe(no)} className="rounded-xl border border-border p-4">
          {no.tipo === "grupo" ? (
            <>
              <h2 className="text-sm font-semibold tracking-wide text-foreground">{no.titulo}</h2>
              <div className="mt-4 flex flex-col gap-4">
                {no.filhos.map((filho) => (
                  <Campo key={chaveDe(filho)} no={filho} />
                ))}
              </div>
              {no.nota ? <p className="mt-3 text-xs text-muted-foreground">{no.nota}</p> : null}
            </>
          ) : (
            <Campo no={no} />
          )}
        </section>
      ))}

      <div className="flex flex-col gap-3 border-t border-border pt-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="note">Anotação desta versão</Label>
          <input
            id="note"
            name="note"
            placeholder="ex.: testando título mais curto"
            className="h-11 rounded-lg border border-input bg-input px-3 text-sm text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
          <p className="text-xs text-muted-foreground">
            Opcional. Serve para você reconhecer esta versão depois, se quiser voltar.
          </p>
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
            <p>{state.message}</p>
            {state.problems?.length ? (
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-xs">
                {state.problems.map((problema) => (
                  <li key={problema}>{problema}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Publicar no site
        </Button>
      </div>
    </form>
  );
}

function chaveDe(no: No): string {
  return no.tipo === "grupo" ? no.id : no.nome;
}

function Campo({ no }: { no: No }) {
  if (no.tipo === "grupo") {
    return (
      <div className="rounded-lg border border-border/60 p-3">
        <p className="text-xs font-medium text-foreground">{no.titulo}</p>
        <div className="mt-3 flex flex-col gap-3">
          {no.filhos.map((filho) => (
            <Campo key={chaveDe(filho)} no={filho} />
          ))}
        </div>
        {no.nota ? <p className="mt-2 text-xs text-muted-foreground">{no.nota}</p> : null}
      </div>
    );
  }

  if (no.tipo === "marcador") {
    return (
      <div className="flex items-center gap-2">
        {/* O `hidden` garante que "false" chegue: caixa desmarcada não envia
            nada, e o campo sumiria do objeto remontado. */}
        <input type="hidden" name={no.nome} value="false" />
        <input
          type="checkbox"
          id={no.nome}
          name={no.nome}
          value="true"
          defaultChecked={no.valor}
          className="size-4 accent-[var(--primary)]"
        />
        <Label htmlFor={no.nome} className="text-sm font-normal">
          {no.rotulo}
        </Label>
      </div>
    );
  }

  const classe =
    "rounded-lg border border-input bg-input px-3 py-2.5 text-sm text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={no.nome}>{no.rotulo}</Label>
      {no.longo ? (
        <textarea id={no.nome} name={no.nome} defaultValue={no.valor} rows={4} className={classe} />
      ) : (
        <input id={no.nome} name={no.nome} defaultValue={no.valor} className={cn(classe, "h-11")} />
      )}
    </div>
  );
}
