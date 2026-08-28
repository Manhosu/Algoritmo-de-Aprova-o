"use client";

import { Check, Lightbulb, Loader2, X } from "lucide-react";
import { useState, useTransition } from "react";

import { Surface } from "@/components/shared/surface";
import { cn } from "@/lib/utils";
import type { QuestionView } from "@/server/questions/service";

import { answerQuestionAction } from "./actions";

/**
 * Uma questão, do enunciado ao comentário.
 *
 * README 1.9: "ao responder, exibir breve explicação logo abaixo". O comentário
 * aparece no MESMO lugar, sem navegação e sem modal — o momento imediatamente
 * depois de errar é quando a explicação é lida, e qualquer clique a mais é onde
 * a maioria desiste.
 *
 * ⚠️ O gabarito não está nesta página até o aluno responder. `option.isCorrect`
 * chega `undefined` na carga; quem preenche é a resposta da ação. Mandar o
 * gabarito antes seria entregá-lo a quem abrisse o inspetor.
 */

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: "Fácil",
  medium: "Média",
  hard: "Difícil",
};

type Revealed = {
  correctOptionId: string;
  selectedOptionId: string;
  isCorrect: boolean;
  explanation: string | null;
  optionExplanations: Record<string, string | null>;
};

export function QuestionCard({
  question,
  index,
  blocked,
  dailyTaskItemId,
  onAnswered,
}: {
  question: QuestionView;
  index: number;
  /** Limite diário atingido: dá para ler, não dá para responder. */
  blocked: boolean;
  dailyTaskItemId?: string | null;
  onAnswered?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [openedAt] = useState(() => Date.now());

  /**
   * Alternativas que o aluno descartou.
   *
   * O GESTO DA PROVA IMPRESSA (pedido da cliente em 26/08/2026)
   * --------------------------------------------------------------------------
   * Quem faz prova em papel risca as alternativas que eliminou. Sem isso, na
   * tela, o candidato relê cinco opções a cada volta ao enunciado — inclusive
   * as que já tinha descartado.
   *
   * ⚠️ RISCAR NÃO IMPEDE DE RESPONDER. É uma anotação, não uma trava: a pessoa
   * muda de ideia no meio da questão o tempo todo, e transformar o descarte em
   * bloqueio faria dele um clique perigoso — a pessoa deixaria de usar.
   *
   * ⚠️ NÃO PERSISTE, de propósito. É rascunho de raciocínio, vale enquanto a
   * questão está aberta. Guardar no banco criaria uma tabela por gesto de
   * rascunho e traria de volta descartes de semanas atrás.
   */
  const [discarded, setDiscarded] = useState<ReadonlySet<string>>(new Set());

  function toggleDiscard(optionId: string) {
    setDiscarded((current) => {
      const next = new Set(current);
      if (next.has(optionId)) next.delete(optionId);
      else next.add(optionId);
      return next;
    });
  }

  const [revealed, setRevealed] = useState<Revealed | null>(
    // Questão já respondida antes: o gabarito veio junto, porque nesse caso
    // ele não é mais segredo.
    question.previousAttempt
      ? {
          correctOptionId: question.options.find((o) => o.isCorrect)?.id ?? "",
          selectedOptionId: question.previousAttempt.selectedOptionId ?? "",
          isCorrect: question.previousAttempt.isCorrect,
          explanation: question.explanation ?? null,
          optionExplanations: Object.fromEntries(
            question.options.map((o) => [o.id, o.explanation ?? null]),
          ),
        }
      : null,
  );

  function answer(optionId: string) {
    if (revealed || pending || blocked) return;
    setError(null);

    startTransition(async () => {
      const result = await answerQuestionAction({
        questionId: question.id,
        optionId,
        timeSpentSeconds: Math.round((Date.now() - openedAt) / 1000),
        // Presente só quando o aluno chegou pelo link da Tarefa do Dia. É o
        // que risca a linha "Pratique" e credita o XP dela.
        dailyTaskItemId,
      });

      if (!result.ok) {
        setError(
          result.reason === "limit_reached"
            ? "Você chegou ao limite de questões de hoje."
            : "Não conseguimos registrar sua resposta. Tente de novo.",
        );
        return;
      }

      setRevealed({
        correctOptionId: result.correctOptionId,
        selectedOptionId: optionId,
        isCorrect: result.isCorrect,
        explanation: result.explanation,
        optionExplanations: result.optionExplanations,
      });

      onAnswered?.();
    });
  }

  return (
    <Surface className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3 sm:px-5">
        <span className="text-metric text-xs text-muted-foreground">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {question.sourceLabel || question.subjectName}
        </span>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">
          {DIFFICULTY_LABEL[question.difficulty] ?? question.difficulty}
        </span>
      </div>

      <div className="px-4 py-4 sm:px-5">
        {question.topicName ? (
          <p className="mb-2 text-xs font-semibold tracking-[0.1em] text-primary uppercase">
            {question.topicName}
          </p>
        ) : null}

        {question.contextText ? (
          <p className="mb-3 rounded-lg border border-border bg-surface/40 p-3 text-sm text-pretty whitespace-pre-line text-muted-foreground">
            {question.contextText}
          </p>
        ) : null}

        <p className="text-pretty whitespace-pre-line text-foreground">
          {question.statement}
        </p>

        <ul className="mt-4 flex flex-col gap-2">
          {question.options.map((option) => {
            const isCorrect = revealed?.correctOptionId === option.id;
            const isChosen = revealed?.selectedOptionId === option.id;
            const isWrongChoice = isChosen && !isCorrect;

            const isDiscarded = !revealed && discarded.has(option.id);

            return (
              <li key={option.id} className="flex items-stretch gap-2">
                {/*
                  O botão de descartar fica FORA do botão da alternativa: um
                  botão dentro de outro é HTML inválido, e o clique de riscar
                  dispararia a resposta junto.

                  Some depois de responder — a partir daí o gabarito está na
                  tela e riscar não serve para mais nada.
                */}
                {!revealed ? (
                  <button
                    type="button"
                    onClick={() => toggleDiscard(option.id)}
                    aria-pressed={isDiscarded}
                    aria-label={
                      isDiscarded
                        ? `Desfazer descarte da alternativa ${option.label}`
                        : `Descartar a alternativa ${option.label}`
                    }
                    title={isDiscarded ? "Desfazer descarte" : "Descartar alternativa"}
                    className={cn(
                      "flex w-10 shrink-0 items-center justify-center rounded-xl border transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      isDiscarded
                        ? "border-destructive/50 bg-destructive/10 text-destructive"
                        : "border-border text-muted-foreground/50 hover:border-destructive/40 hover:text-destructive",
                    )}
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                ) : null}

                <button
                  type="button"
                  disabled={Boolean(revealed) || pending || blocked}
                  onClick={() => answer(option.id)}
                  className={cn(
                    "flex flex-1 items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    !revealed && !blocked && "hover:border-primary/50 hover:bg-accent/40",
                    isCorrect && "border-success bg-success/10",
                    isWrongChoice && "border-destructive bg-destructive/10",
                    !isCorrect && !isWrongChoice && "border-border",
                    blocked && !revealed && "cursor-not-allowed opacity-60",
                    // Descartada continua clicável: é anotação, não trava.
                    isDiscarded && "opacity-45",
                  )}
                >
                  <span
                    className={cn(
                      "text-metric flex size-7 shrink-0 items-center justify-center rounded-lg border text-xs",
                      isCorrect
                        ? "border-success bg-success/20 text-success"
                        : isWrongChoice
                          ? "border-destructive bg-destructive/20 text-destructive"
                          : "border-border text-muted-foreground",
                    )}
                    aria-hidden
                  >
                    {isCorrect ? (
                      <Check className="size-4" />
                    ) : isWrongChoice ? (
                      <X className="size-4" />
                    ) : (
                      option.label
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-sm text-pretty text-foreground",
                        isDiscarded && "line-through decoration-destructive/70",
                      )}
                    >
                      {option.content}
                    </span>

                    {/*
                      A justificativa por alternativa só aparece nas que o aluno
                      precisa entender: a que ele marcou e a certa. Exibir as
                      cinco vira um muro de texto que ninguém lê.
                    */}
                    {revealed && (isCorrect || isChosen) &&
                    revealed.optionExplanations[option.id] ? (
                      <span className="mt-1.5 block text-xs text-pretty text-muted-foreground">
                        {revealed.optionExplanations[option.id]}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {pending ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Registrando…
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground">
            {error}
          </p>
        ) : null}

        {revealed ? (
          <div className="mt-4">
            <p
              className={cn(
                "flex items-center gap-2 text-sm font-medium",
                revealed.isCorrect ? "text-success" : "text-destructive",
              )}
              role="status"
            >
              {revealed.isCorrect ? (
                <>
                  <Check className="size-4" aria-hidden />
                  Você acertou
                </>
              ) : (
                <>
                  <X className="size-4" aria-hidden />
                  Resposta errada
                </>
              )}
            </p>

            {/* README 1.9: o comentário fica logo abaixo da resposta. */}
            {revealed.explanation ? (
              <div className="mt-3 flex gap-3 rounded-xl border border-primary/30 bg-primary-soft p-4">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-[0.1em] text-primary uppercase">
                    Comentário
                  </p>
                  <p className="mt-1 text-sm text-pretty whitespace-pre-line text-muted-foreground">
                    {revealed.explanation}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Surface>
  );
}
