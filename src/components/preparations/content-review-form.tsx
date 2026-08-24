"use client";

import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { useActionState, useMemo, useState } from "react";

import { FormError } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PlanContent } from "@/server/preparations/content";

import { saveContentAction, type ContentFormState } from "./content-actions";

const INITIAL: ContentFormState = { status: "idle" };

type Row = {
  id: string | null;
  subjectId: string;
  displayName: string;
  depth: number;
  weight: number | null;
  weightFromEdital: boolean;
  isActive: boolean;
  mapped: boolean;
  questionCount: number;
  /** Chave estável de renderização — `id` não existe em item novo. */
  key: string;
};

/**
 * PASSO 3: O ALUNO CONFERE O QUE A IA LEU.
 *
 * DUAS DECISÕES DE INTERFACE QUE VALEM A EXPLICAÇÃO
 * ----------------------------------------------------------------------------
 * 1. Um edital tem de 150 a 300 assuntos. Renderizar tudo aberto é uma tela de
 *    rolagem infinita no celular, e o aluno desiste antes de revisar. Por isso
 *    a lista abre POR DISCIPLINA, e só a primeira vem aberta — o suficiente
 *    para ele entender o que a tela pede sem precisar de instrução.
 *
 * 2. Tudo é editado em memória e salvo de uma vez. Salvar a cada tecla seria
 *    trezentas requisições e um indicador de "salvando" piscando sem parar;
 *    além disso, renomear refaz o casamento com o catálogo no servidor, que é
 *    trabalho demais para acontecer a cada letra digitada.
 */
export function ContentReviewForm({ content }: { content: PlanContent }) {
  const [state, formAction, pending] = useActionState(saveContentAction, INITIAL);

  const [rows, setRows] = useState<Row[]>(() =>
    content.subjects.flatMap((subject) =>
      subject.topics.map((topic) => ({
        id: topic.id,
        subjectId: subject.id,
        displayName: topic.displayName,
        depth: topic.depth,
        weight: topic.weight,
        weightFromEdital: topic.weightSource === "edital",
        isActive: topic.isActive,
        mapped: topic.mappingStatus === "mapped" || topic.mappingStatus === "manually_mapped",
        questionCount: topic.questionCount,
        key: topic.id,
      })),
    ),
  );

  const [open, setOpen] = useState<Set<string>>(
    () => new Set(content.subjects.slice(0, 1).map((subject) => subject.id)),
  );

  const payload = useMemo(
    () =>
      JSON.stringify(
        rows.map((row) => ({
          id: row.id,
          subjectId: row.subjectId,
          displayName: row.displayName,
          weight: row.weight,
          isActive: row.isActive,
        })),
      ),
    [rows],
  );

  const activeCount = rows.filter((row) => row.isActive).length;

  function update(key: string, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function remove(key: string) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  function add(subjectId: string) {
    setRows((current) => [
      ...current,
      {
        id: null,
        subjectId,
        displayName: "",
        depth: 0,
        weight: null,
        weightFromEdital: false,
        isActive: true,
        mapped: false,
        questionCount: 0,
        key: `novo-${subjectId}-${current.length}-${Date.now()}`,
      },
    ]);
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="preparacaoId" value={content.preparationId} />
      <input type="hidden" name="assuntos" value={payload} />

      {state.status === "error" ? <FormError>{state.message}</FormError> : null}

      {state.status === "saved" ? (
        <p
          className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-foreground"
          role="status"
        >
          Alterações salvas.
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {content.subjects.map((subject) => {
          const subjectRows = rows.filter((row) => row.subjectId === subject.id);
          const isOpen = open.has(subject.id);

          return (
            <li
              key={subject.id}
              className="overflow-hidden rounded-2xl border border-border bg-card"
            >
              <button
                type="button"
                onClick={() =>
                  setOpen((current) => {
                    const next = new Set(current);
                    if (next.has(subject.id)) next.delete(subject.id);
                    else next.add(subject.id);
                    return next;
                  })
                }
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform",
                    isOpen && "rotate-180",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {subject.displayName}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {subjectRows.length}{" "}
                    {subjectRows.length === 1 ? "assunto" : "assuntos"}
                  </span>
                </span>
              </button>

              {isOpen ? (
                <div className="border-t border-border px-3 pb-3">
                  <ul className="flex flex-col">
                    {subjectRows.map((row) => (
                      <li
                        key={row.key}
                        className={cn(
                          "flex flex-col gap-2 border-b border-border/60 py-3 last:border-b-0",
                          row.depth > 0 && "pl-4",
                          !row.isActive && "opacity-50",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <input
                            value={row.displayName}
                            onChange={(event) =>
                              update(row.key, { displayName: event.target.value })
                            }
                            placeholder="Nome do assunto"
                            aria-label="Nome do assunto"
                            className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-input px-3 text-sm text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => remove(row.key)}
                            aria-label={`Remover ${row.displayName || "assunto"}`}
                            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-0.5">
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            Questões na prova
                            <input
                              type="number"
                              min={0}
                              max={500}
                              inputMode="numeric"
                              value={row.weight ?? ""}
                              onChange={(event) =>
                                update(row.key, {
                                  weight:
                                    event.target.value === ""
                                      ? null
                                      : Number(event.target.value),
                                })
                              }
                              className="text-metric min-h-9 w-20 rounded-lg border border-border bg-input px-2 text-sm text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            />
                          </label>

                          {row.weightFromEdital && row.weight !== null ? (
                            <span className="text-xs text-muted-foreground">do edital</span>
                          ) : null}

                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={row.isActive}
                              onChange={(event) =>
                                update(row.key, { isActive: event.target.checked })
                              }
                              className="size-4 accent-[var(--primary)]"
                            />
                            Estudar
                          </label>

                          <AcervoBadge mapped={row.mapped} count={row.questionCount} />
                        </div>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => add(subject.id)}
                    className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Plus className="size-4" aria-hidden />
                    Acrescentar assunto
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-20 z-10 flex flex-col gap-2 rounded-2xl border border-border bg-card/95 p-3 backdrop-blur sm:bottom-4">
        <p className="text-center text-xs text-muted-foreground">
          {activeCount} {activeCount === 1 ? "assunto ativo" : "assuntos ativos"}
        </p>

        <div className="flex gap-2">
          <Button
            type="submit"
            variant="outline"
            size="lg"
            className="flex-1"
            disabled={pending}
          >
            Salvar
          </Button>
          <Button
            type="submit"
            name="confirmar"
            value="1"
            size="lg"
            className="flex-1"
            disabled={pending || activeCount === 0}
          >
            {pending ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Salvando…
              </>
            ) : (
              "Confirmar"
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * Diz se o assunto tem questão hoje.
 *
 * Pedido da cliente em 21/08/2026: mostrar o que já está disponível no acervo.
 * A informação é honesta nos dois sentidos — "12 questões" é uma promessa que o
 * sistema cumpre, e "em produção" é um aviso de que ali ainda não cumpre. Sem
 * isso o aluno descobriria sozinho, praticando e não achando nada.
 */
function AcervoBadge({ mapped, count }: { mapped: boolean; count: number }) {
  if (mapped && count > 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-success">
        <CircleCheck className="size-3.5" aria-hidden />
        {count} {count === 1 ? "questão" : "questões"}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <CircleAlert className="size-3.5" aria-hidden />
      Questões em produção
    </span>
  );
}
