"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { EngineConfigKind } from "@/modules/engine-config/schemas";
import { cn } from "@/lib/utils";

import { publishEngineConfigAction, type EngineFormState } from "./engine-actions";
import type { CampoConfig } from "./engine-fields";


/**
 * Formulário de uma configuração de motor.
 *
 * ⚠️ MOSTRA A SOMA AO VIVO quando os campos precisam somar 100.
 *
 * Os cinco pesos do Motor 1 têm essa regra, e o schema a impõe. Sem o total na
 * tela, quem edita descobre o erro só depois de tentar publicar — e aí precisa
 * refazer a conta de cabeça para achar onde sobrou ou faltou. A soma ao lado
 * transforma tentativa e erro em ajuste direto.
 *
 * A conferência de verdade continua no servidor: este número é conveniência,
 * não guarda.
 */
export function EngineForm({
  kind,
  campos,
  somaEsperada,
}: {
  kind: EngineConfigKind;
  campos: CampoConfig[];
  /** Quando definido, mostra o total e avisa se estiver diferente. */
  somaEsperada?: number;
}) {
  const [state, formAction, pending] = useActionState<EngineFormState, FormData>(
    publishEngineConfigAction.bind(null, kind),
    { ok: false },
  );

  const [valores, setValores] = useState<Record<string, string>>(
    Object.fromEntries(campos.map((c) => [c.chave, String(c.valor)])),
  );

  const soma = Object.values(valores).reduce(
    (total, v) => total + (Number(v.replace(",", ".")) || 0),
    0,
  );

  const somaOk = somaEsperada === undefined || Math.abs(soma - somaEsperada) < 0.01;

  const entrada =
    "h-11 rounded-lg border border-input bg-input px-3 text-sm text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {campos.map((campo) => (
        <div key={campo.chave} className="flex flex-col gap-1.5">
          <Label htmlFor={campo.chave}>{campo.rotulo}</Label>
          <div className="flex items-center gap-2">
            <input
              id={campo.chave}
              name={campo.chave}
              inputMode="decimal"
              value={valores[campo.chave]}
              onChange={(e) =>
                setValores((atual) => ({ ...atual, [campo.chave]: e.target.value }))
              }
              className={cn(entrada, "w-28")}
            />
            {campo.sufixo ? (
              <span className="text-sm text-muted-foreground">{campo.sufixo}</span>
            ) : null}
          </div>
          {campo.ajuda ? (
            <p className="text-xs text-pretty text-muted-foreground">{campo.ajuda}</p>
          ) : null}
        </div>
      ))}

      {somaEsperada !== undefined ? (
        <p
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            somaOk
              ? "border-success/40 bg-success/10 text-foreground"
              : "border-warning/40 bg-warning/10 text-foreground",
          )}
        >
          Total: <span className="text-metric">{Math.round(soma * 100) / 100}</span>
          {somaOk ? " — pode publicar." : ` — precisa somar ${somaEsperada}.`}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`note-${kind}`}>Anotação desta versão</Label>
        <input
          id={`note-${kind}`}
          name="note"
          placeholder="ex.: mais peso para lacunas"
          className={entrada}
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

      <Button type="submit" disabled={pending || !somaOk}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Publicar
      </Button>
    </form>
  );
}
