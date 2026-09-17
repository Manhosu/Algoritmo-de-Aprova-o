"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useActionState, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PlanContent } from "@/server/preparations/content";

import {
  saveAdminPlanContentAction,
  type PlanContentFormState,
} from "./plan-content-actions";

const INICIAL: PlanContentFormState = { status: "idle" };

const ENTRADA =
  "h-10 w-full rounded-lg border border-input bg-input px-3 text-sm text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

type Linha = {
  key: string;
  id: string | null;
  subjectId: string;
  displayName: string;
  weight: number | null;
  isActive: boolean;
  /** O assunto casou com o catálogo? Sem casar, ele não puxa questão. */
  mapped: boolean;
  questionCount: number;
};

/**
 * CORREÇÃO DO CONTEÚDO DO EDITAL DE UM ALUNO, PELO PAINEL.
 *
 * ⚠️ É A MESMA GRAVAÇÃO DA TELA DO ALUNO (`savePlanContent`), com a posse
 * dispensada. Uma segunda implementação divergiria do casamento com o catálogo e
 * faria o painel gravar assunto que o motor não reconhece.
 *
 * A tela do aluno tem peso por disciplina, técnicas e o passo de confirmação.
 * Aqui não: a cliente vem consertar uma falha pontual — acrescentar o que a
 * leitura deixou passar, tirar o que sobrou, corrigir um nome.
 */
export function PlanContentForm({
  content,
  alunoId,
}: {
  content: PlanContent;
  alunoId: string;
}) {
  const [estado, dispatch] = useActionState(saveAdminPlanContentAction, INICIAL);
  const [pending, startTransition] = useTransition();

  const [linhas, setLinhas] = useState<Linha[]>(() =>
    content.subjects.flatMap((disciplina) =>
      disciplina.topics.map((assunto) => ({
        key: assunto.id,
        id: assunto.id,
        subjectId: disciplina.id,
        displayName: assunto.displayName,
        weight: assunto.weight,
        isActive: assunto.isActive,
        mapped:
          assunto.mappingStatus === "mapped" || assunto.mappingStatus === "manually_mapped",
        questionCount: assunto.questionCount,
      })),
    ),
  );

  const payload = useMemo(
    () =>
      JSON.stringify(
        linhas.map((linha) => ({
          id: linha.id,
          subjectId: linha.subjectId,
          displayName: linha.displayName,
          weight: linha.weight,
          isActive: linha.isActive,
        })),
      ),
    [linhas],
  );

  const ativos = linhas.filter((linha) => linha.isActive).length;

  function mudar(key: string, patch: Partial<Linha>) {
    setLinhas((atual) =>
      atual.map((linha) => (linha.key === key ? { ...linha, ...patch } : linha)),
    );
  }

  function acrescentar(subjectId: string) {
    setLinhas((atual) => [
      ...atual,
      {
        key: `novo-${crypto.randomUUID()}`,
        id: null,
        subjectId,
        displayName: "",
        weight: null,
        isActive: true,
        mapped: false,
        questionCount: 0,
      },
    ]);
  }

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    startTransition(() => dispatch(dados));
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <input type="hidden" name="preparacaoId" value={content.preparationId} />
      <input type="hidden" name="alunoId" value={alunoId} />
      <input type="hidden" name="assuntos" value={payload} />

      {content.subjects.map((disciplina) => {
        const daDisciplina = linhas.filter((linha) => linha.subjectId === disciplina.id);

        return (
          <details
            key={disciplina.id}
            className="rounded-xl border border-border bg-card"
            open={content.subjects.length <= 3}
          >
            <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
              <span className="min-w-0 flex-1 text-pretty font-semibold text-foreground">
                {disciplina.displayName}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {daDisciplina.filter((l) => l.isActive).length} de {daDisciplina.length}
              </span>
            </summary>

            <div className="flex flex-col gap-2 border-t border-border p-4">
              {daDisciplina.map((linha) => (
                <div key={linha.key} className="flex flex-wrap items-center gap-2">
                  <input
                    value={linha.displayName}
                    onChange={(evento) => mudar(linha.key, { displayName: evento.target.value })}
                    placeholder="Nome do assunto"
                    className={cn(ENTRADA, "min-w-0 flex-1", !linha.isActive && "opacity-60")}
                  />

                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={linha.weight ?? ""}
                    onChange={(evento) =>
                      mudar(linha.key, {
                        weight: evento.target.value === "" ? null : Number(evento.target.value),
                      })
                    }
                    placeholder="peso"
                    aria-label={`Peso de ${linha.displayName || "assunto novo"}`}
                    className={cn(ENTRADA, "w-20 shrink-0")}
                  />

                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={linha.isActive}
                      onChange={(evento) => mudar(linha.key, { isActive: evento.target.checked })}
                      className="size-4 accent-[var(--primary)]"
                    />
                    No plano
                  </label>

                  <span
                    className="shrink-0 text-xs text-muted-foreground"
                    title="Questões publicadas para este assunto"
                  >
                    {linha.mapped ? `${linha.questionCount} q.` : "sem catálogo"}
                  </span>

                  <button
                    type="button"
                    onClick={() => setLinhas((atual) => atual.filter((l) => l.key !== linha.key))}
                    aria-label={`Remover ${linha.displayName || "assunto novo"}`}
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              ))}

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => acrescentar(disciplina.id)}
              >
                <Plus aria-hidden />
                Acrescentar assunto
              </Button>
            </div>
          </details>
        );
      })}

      {estado.message ? (
        <p
          role="status"
          className={cn(
            "rounded-lg border px-3 py-2.5 text-sm text-pretty",
            estado.status === "saved"
              ? "border-success/40 bg-success/10 text-foreground"
              : "border-destructive/40 bg-destructive/10 text-foreground",
          )}
        >
          {estado.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Salvar o conteúdo
        </Button>
        <span className="text-sm text-muted-foreground">
          {ativos} {ativos === 1 ? "assunto no plano" : "assuntos no plano"}
        </span>
      </div>
    </form>
  );
}
