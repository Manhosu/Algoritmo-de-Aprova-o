"use client";

import { Info, Loader2 } from "lucide-react";
import { useActionState, useMemo, useState } from "react";

import { FormError } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DiagnosisView, MasteryLevel } from "@/server/preparations/diagnosis";

import { submitDiagnosisAction, type DiagnosisFormState } from "./diagnosis-actions";

const INITIAL: DiagnosisFormState = { status: "idle" };

/**
 * Os três níveis do README 1.5, com as cores dele.
 *
 * O emoji é do documento e ficou: numa lista de quinze disciplinas, a cor é o
 * que permite ver de relance o que ainda falta responder.
 */
const LEVELS: Array<{
  value: MasteryLevel;
  label: string;
  dot: string;
  selected: string;
}> = [
  /*
   * ⚠️ BAIXO → MEDIANO → ALTO, nesta ordem (pedido da cliente em 27/08/2026).
   *
   * A escala cresce da esquerda para a direita, como régua e como nota. Com
   * "Alto" na primeira posição, o clique mais fácil e mais próximo do dedo era
   * justamente o que o aluno menos deve marcar por reflexo — e superestimar
   * domínio no diagnóstico envenena a priorização inteira do Motor 1.
   */
  {
    value: "low",
    label: "Baixo",
    dot: "bg-destructive",
    selected: "border-destructive bg-destructive/15 text-destructive",
  },
  {
    value: "medium",
    label: "Mediano",
    dot: "bg-warning",
    selected: "border-warning bg-warning/15 text-warning",
  },
  {
    value: "high",
    label: "Alto",
    dot: "bg-success",
    selected: "border-success bg-success/15 text-success",
  },
];

export function DiagnosisForm({
  view,
  notice,
}: {
  view: DiagnosisView;
  notice: string;
}) {
  const [state, formAction, pending] = useActionState(submitDiagnosisAction, INITIAL);

  const [answers, setAnswers] = useState<Record<string, MasteryLevel>>(() =>
    Object.fromEntries(
      view.subjects
        .filter((subject) => subject.answer !== null)
        .map((subject) => [subject.id, subject.answer as MasteryLevel]),
    ),
  );

  const payload = useMemo(
    () =>
      JSON.stringify(
        Object.entries(answers).map(([subjectId, level]) => ({ subjectId, level })),
      ),
    [answers],
  );

  const answered = Object.keys(answers).length;
  const complete = answered === view.subjects.length;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="preparacaoId" value={view.preparationId} />
      <input type="hidden" name="respostas" value={payload} />

      {state.status === "error" ? <FormError>{state.message}</FormError> : null}

      {/*
        ⚠️ AVISO OBRIGATÓRIO — README 1.5, texto exato.
        Fica ANTES das perguntas, não depois: ele existe para reduzir a
        ansiedade de errar a resposta, e depois do formulário chegaria tarde.
      */}
      <div className="flex gap-3 rounded-xl border border-primary/30 bg-primary-soft p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <p className="text-sm text-pretty text-muted-foreground">{notice}</p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {view.subjects.map((subject) => {
          const current = answers[subject.id] ?? null;

          return (
            <li
              key={subject.id}
              className="rounded-2xl border border-border bg-card p-4"
            >
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-sm font-medium text-foreground">
                  {subject.displayName}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {subject.topicCount}{" "}
                  {subject.topicCount === 1 ? "assunto" : "assuntos"}
                </span>
              </div>

              <div
                className="grid grid-cols-3 gap-2"
                role="group"
                aria-label={`Seu domínio em ${subject.displayName}`}
              >
                {LEVELS.map((level) => {
                  const isSelected = current === level.value;
                  return (
                    <button
                      key={level.value}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() =>
                        setAnswers((previous) => ({
                          ...previous,
                          [subject.id]: level.value,
                        }))
                      }
                      className={cn(
                        "flex min-h-11 items-center justify-center gap-1.5 rounded-lg border text-sm transition-colors",
                        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        isSelected
                          ? level.selected
                          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                      )}
                    >
                      <span
                        className={cn("size-2 shrink-0 rounded-full", level.dot)}
                        aria-hidden
                      />
                      {level.label}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-20 z-10 flex flex-col gap-2 rounded-2xl border border-border bg-card/95 p-3 backdrop-blur sm:bottom-4">
        <p className="text-center text-xs text-muted-foreground">
          {answered} de {view.subjects.length} respondidas
        </p>

        <Button type="submit" size="lg" disabled={pending || !complete}>
          {pending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              Montando seu plano…
            </>
          ) : (
            "Concluir e começar a estudar"
          )}
        </Button>

        {/*
          A trava é decisão da cliente ("para não interferir nas métricas do
          andamento do estudo"). Avisar ANTES do clique é o mínimo: uma tela que
          não se refaz e não avisa disso é uma armadilha.
        */}
        <p className="text-center text-xs text-pretty text-muted-foreground">
          O diagnóstico é feito uma única vez. Daqui em diante, quem atualiza seu
          nível é o seu desempenho nas questões.
        </p>
      </div>
    </form>
  );
}
