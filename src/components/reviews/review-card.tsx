"use client";

import { AlertTriangle, Check, Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DueReviewView } from "@/server/engine/review";

import { completeReviewAction } from "./actions";

/**
 * Uma revisão pendente, com o botão REVISAR do README 1.7.
 *
 * A percepção do aluno ("fácil / ok / difícil") é coletada mas NÃO altera o
 * ciclo no Marco 1 — decisão registrada no schema. Ela existe para que a
 * calibração futura tenha dado histórico com que trabalhar, em vez de começar
 * do zero no dia em que alguém quiser ajustar os intervalos.
 */

const RATINGS = [
  { value: "easy", label: "Fácil" },
  { value: "ok", label: "Ok" },
  { value: "hard", label: "Difícil" },
] as const;

/** Rótulo da etapa, do jeito que o aluno entende. */
const STAGE_LABEL = ["1ª revisão", "2ª revisão", "3ª revisão", "4ª revisão", "5ª revisão"];

export function ReviewCard({ review }: { review: DueReviewView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<{ nextOn: string | null; xp: number } | null>(null);
  const [rating, setRating] = useState<"easy" | "ok" | "hard" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function complete() {
    if (pending || done) return;
    setError(null);

    startTransition(async () => {
      const result = await completeReviewAction({
        occurrenceId: review.occurrenceId,
        performanceRating: rating ?? undefined,
      });

      if (!result.ok) {
        setError(
          result.reason === "already_done"
            ? "Esta revisão já foi concluída."
            : "Não conseguimos registrar. Tente de novo.",
        );
        return;
      }

      setDone({ nextOn: result.nextReviewOn, xp: result.xpEarned });
      router.refresh();
    });
  }

  if (done) {
    return (
      <li className="rounded-2xl border border-success/40 bg-success/10 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-success">
          <Check className="size-4" aria-hidden />
          {review.topicName} revisado
          {done.xp > 0 ? ` · +${done.xp} XP` : ""}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {done.nextOn
            ? `Próxima revisão em ${formatDate(done.nextOn)}.`
            : "Série completa. Este assunto passou por todo o ciclo de revisões."}
        </p>
      </li>
    );
  }

  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            {review.subjectName}
          </p>
          <p className="mt-0.5 text-sm font-medium text-pretty text-foreground">
            {review.topicName}
          </p>
        </div>

        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">
          {STAGE_LABEL[review.stageIndex] ?? `Etapa ${review.stageIndex + 1}`}
        </span>
      </div>

      {/*
        O atraso é MOSTRADO, não escondido. Uma revisão que some por não ter
        sido feita no dia certo transformaria o esquecimento em silêncio — que
        é exatamente o que este motor existe para combater.
      */}
      {review.isLate ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-warning">
          <AlertTriangle className="size-3.5" aria-hidden />
          {review.daysLate === 1 ? "1 dia de atraso" : `${review.daysLate} dias de atraso`}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Vence hoje</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Como foi?</span>
        {RATINGS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={rating === option.value}
            onClick={() => setRating(option.value)}
            className={cn(
              "min-h-9 rounded-lg border px-3 text-xs transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              rating === option.value
                ? "border-primary bg-primary-soft text-primary"
                : "border-border text-muted-foreground hover:border-primary/40",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground">
          {error}
        </p>
      ) : null}

      <Button onClick={complete} disabled={pending} className="mt-3 w-full" size="lg">
        {pending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            Registrando…
          </>
        ) : (
          <>
            <RotateCcw aria-hidden />
            Revisar
          </>
        )}
      </Button>
    </li>
  );
}

function formatDate(date: string): string {
  // A data já vem como data civil no fuso do aluno; o meio-dia UTC evita que a
  // formatação a jogue para o dia anterior.
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}
