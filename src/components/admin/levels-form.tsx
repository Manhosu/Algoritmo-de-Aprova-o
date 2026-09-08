"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { AdminLevel } from "@/server/admin/levels-admin";

import { saveLevelRangesAction, type EngineFormState } from "./engine-actions";

const ENTRADA =
  "h-11 w-full rounded-lg border border-input bg-input px-3 text-sm text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/**
 * A FAIXA DE XP DE CADA NÍVEL (pedido da cliente em 08/09/2026).
 *
 * ⚠️ SÓ O COMEÇO DE CADA NÍVEL É DIGITADO. O FIM APARECE SOZINHO.
 *
 * Com os dois campos editáveis, a primeira coisa que aconteceria é alguém
 * salvar um teto que não encosta no piso seguinte — a tela diria "até 999"
 * enquanto o nível 2 começasse em 1500, e os 501 XP no meio ficariam num nível
 * que a própria tela nega existir. O fim é sempre o começo do próximo menos um,
 * então ele é mostrado, não perguntado.
 *
 * ⚠️ A AÇÃO É CHAMADA DE DENTRO DO `onSubmit`, e não por `action={}`.
 *
 * O React 19 limpa um formulário que ele governa pelo `action` assim que a ação
 * termina — inclusive quando ela termina RECUSANDO. Num formulário de edição os
 * campos não ficam vazios: voltam aos valores ANTIGOS. Quem digitasse cinco
 * faixas novas e errasse uma veria as cinco voltarem ao que eram.
 */
export function LevelsForm({ niveis }: { niveis: AdminLevel[] }) {
  const [state, dispatch] = useActionState<EngineFormState, FormData>(
    saveLevelRangesAction,
    { ok: false },
  );

  const [pending, startTransition] = useTransition();

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    startTransition(() => dispatch(dados));
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {niveis.map((nivel, i) => {
          const proximo = niveis[i + 1];

          return (
            <li key={nivel.id} className="flex items-end gap-3">
              <input type="hidden" name="levelId" value={nivel.id} />

              <div className="min-w-0 flex-1">
                <Label htmlFor={`minXp:${nivel.id}`}>
                  <span className="mr-1.5" aria-hidden>
                    {nivel.emoji ?? "•"}
                  </span>
                  {nivel.name}
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {/*
                    Quantos alunos estão nesta faixa HOJE. É o custo de mexer,
                    visível antes de mexer: baixar um corte não é um ajuste de
                    número, é subir de nível toda essa gente.
                  */}
                  {nivel.studentCount === 0
                    ? "Nenhum aluno aqui agora"
                    : nivel.studentCount === 1
                      ? "1 aluno aqui agora"
                      : `${nivel.studentCount} alunos aqui agora`}
                </p>
              </div>

              <div className="w-32 shrink-0">
                <Label htmlFor={`minXp:${nivel.id}`} className="sr-only">
                  XP inicial de {nivel.name}
                </Label>
                <input
                  id={`minXp:${nivel.id}`}
                  name={`minXp:${nivel.id}`}
                  inputMode="numeric"
                  required
                  defaultValue={nivel.minXp}
                  /* O primeiro nível é sempre 0 — ver a nota em `buildLevelRanges`. */
                  readOnly={i === 0}
                  className={cn(ENTRADA, i === 0 && "opacity-60")}
                />
              </div>

              <span className="w-24 shrink-0 pb-3 text-xs text-muted-foreground">
                {proximo ? `até ${(proximo.minXp - 1).toLocaleString("pt-BR")}` : "sem teto"}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-pretty text-muted-foreground">
        Digite onde cada nível COMEÇA. O fim é calculado a partir do começo do
        seguinte, e o último nível não tem teto. Mudar as faixas vale para o XP
        que os alunos já têm — quem passar do novo corte sobe de nível na próxima
        vez que abrir a Home.
      </p>

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

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Salvar faixas
      </Button>
    </form>
  );
}
