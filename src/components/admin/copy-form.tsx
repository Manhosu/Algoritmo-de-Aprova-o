"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { LandingCopy } from "@/content/landing-schema";
import { cn } from "@/lib/utils";

import { publishCopyAction, type CopyFormState } from "./copy-actions";
import { rotular } from "./copy-labels";

/**
 * Editor da copy da página inicial.
 *
 * ⚠️ OS CAMPOS SÃO GERADOS A PARTIR DA COPY ATUAL, não escritos um a um.
 *
 * Escrever trinta inputs à mão cria um segundo lugar onde a estrutura mora, e
 * ele sai de sincronia no primeiro campo novo: o schema ganharia a chave, o
 * formulário não, e a cliente publicaria sem nunca ver o campo. Percorrer o
 * objeto garante que tudo que o schema aceita aparece na tela.
 *
 * O `name` de cada input é o CAMINHO dentro do objeto (`hero.titleLine1`), e a
 * ação remonta o objeto a partir disso.
 */

/** Campos longos ganham `textarea`; o resto é `input`. */
const LONGOS = new Set(["subtitle", "body", "footnote"]);

export function CopyForm({ inicial }: { inicial: LandingCopy }) {
  const [state, formAction, pending] = useActionState<CopyFormState, FormData>(
    publishCopyAction,
    { ok: false },
  );

  return (
    <form action={formAction} className="flex flex-col gap-8">
      {Object.entries(inicial).map(([chave, valor]) => (
        <Grupo key={chave} titulo={rotular(chave)} caminho={chave} valor={valor} />
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

/** Um bloco do objeto: vira uma seção com os campos dentro. */
function Grupo({
  titulo,
  caminho,
  valor,
}: {
  titulo: string;
  caminho: string;
  valor: unknown;
}) {
  if (Array.isArray(valor)) {
    return (
      <section className="rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold tracking-wide text-foreground">{titulo}</h2>
        <div className="mt-4 flex flex-col gap-4">
          {valor.map((item, i) => (
            <div key={`${caminho}.${i}`} className="rounded-lg border border-border/60 p-3">
              <p className="mb-3 text-xs text-muted-foreground">Item {i + 1}</p>
              <Campos caminho={`${caminho}.${i}`} valor={item} />
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          A quantidade de itens é fixa — o desenho da tela depende dela.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border p-4">
      <h2 className="text-sm font-semibold tracking-wide text-foreground">{titulo}</h2>
      <div className="mt-4">
        <Campos caminho={caminho} valor={valor} />
      </div>
    </section>
  );
}

/** Percorre um objeto e desenha um campo por folha. */
function Campos({ caminho, valor }: { caminho: string; valor: unknown }) {
  if (valor === null || typeof valor !== "object") return null;

  return (
    <div className="flex flex-col gap-4">
      {Object.entries(valor as Record<string, unknown>).map(([chave, item]) => {
        const nome = `${caminho}.${chave}`;

        if (typeof item === "string") {
          return <CampoTexto key={nome} nome={nome} chave={chave} valor={item} />;
        }

        if (typeof item === "boolean") {
          return (
            <div key={nome} className="flex items-center gap-2">
              {/* O `hidden` garante que "false" chegue: caixa desmarcada não
                  envia nada, e o campo sumiria do objeto remontado. */}
              <input type="hidden" name={nome} value="false" />
              <input
                type="checkbox"
                id={nome}
                name={nome}
                value="true"
                defaultChecked={item}
                className="size-4 accent-[var(--primary)]"
              />
              <Label htmlFor={nome} className="text-sm font-normal">
                {rotular(chave)}
              </Label>
            </div>
          );
        }

        if (Array.isArray(item)) {
          return (
            <div key={nome} className="rounded-lg border border-border/60 p-3">
              <p className="text-xs font-medium text-foreground">{rotular(chave, nome)}</p>
              <div className="mt-3 flex flex-col gap-3">
                {item.map((sub, i) => (
                  <div key={`${nome}.${i}`} className="rounded border border-border/50 p-2.5">
                    <Campos caminho={`${nome}.${i}`} valor={sub} />
                  </div>
                ))}
              </div>
            </div>
          );
        }

        return (
          <div key={nome} className="rounded-lg border border-border/60 p-3">
            <p className="text-xs font-medium text-foreground">{rotular(chave, nome)}</p>
            <div className="mt-3">
              <Campos caminho={nome} valor={item} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CampoTexto({
  nome,
  chave,
  valor,
}: {
  nome: string;
  chave: string;
  valor: string;
}) {
  const classe =
    "rounded-lg border border-input bg-input px-3 py-2.5 text-sm text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={nome}>{rotular(chave, nome)}</Label>
      {LONGOS.has(chave) ? (
        <textarea id={nome} name={nome} defaultValue={valor} rows={4} className={classe} />
      ) : (
        <input id={nome} name={nome} defaultValue={valor} className={cn(classe, "h-11")} />
      )}
    </div>
  );
}
