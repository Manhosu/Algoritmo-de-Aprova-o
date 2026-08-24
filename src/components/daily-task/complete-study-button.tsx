"use client";

import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { completeStudyAction } from "@/components/reviews/actions";
import { cn } from "@/lib/utils";

/**
 * "Já estudei" — o gatilho do Motor 2.
 *
 * Concluir um estudo é o que FAZ NASCER a série de revisões (24h / 7 / 30 / 60 /
 * 90 dias). Por isso o botão confirma o que aconteceu em vez de sumir em
 * silêncio: o aluno precisa entender que aquele clique agendou algo, senão a
 * revisão que aparece amanhã parece ter vindo do nada.
 *
 * É um alvo de toque separado dentro da linha da missão. A linha inteira leva ao
 * material; só este quadradinho marca como feito. Misturar os dois faria o aluno
 * concluir o estudo por engano ao tentar abrir o conteúdo — e a série de
 * revisões nasceria de um clique que ele não quis dar.
 */
export function CompleteStudyButton({
  itemId,
  done,
  topicName,
}: {
  itemId: string;
  done: boolean;
  topicName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [completed, setCompleted] = useState(done);
  const [firstReview, setFirstReview] = useState<string | null>(null);

  function complete(event: React.MouseEvent) {
    // A linha inteira é um link; sem isto o clique navegaria em vez de concluir.
    event.preventDefault();
    event.stopPropagation();

    if (pending || completed) return;

    startTransition(async () => {
      const result = await completeStudyAction(itemId);
      if (!result.ok) return;

      setCompleted(true);
      setFirstReview(result.firstReviewOn);
      router.refresh();
    });
  }

  return (
    <span className="flex shrink-0 flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={complete}
        disabled={pending || completed}
        aria-label={completed ? `${topicName} concluído` : `Marcar ${topicName} como estudado`}
        className={cn(
          "flex size-9 items-center justify-center rounded-lg border transition-colors",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          completed
            ? "border-success/50 bg-success/15 text-success"
            : "border-border text-muted-foreground hover:border-success/50 hover:text-success",
        )}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Check className="size-4" aria-hidden />
        )}
      </button>

      {firstReview ? (
        <span className="text-[0.6rem] whitespace-nowrap text-success">
          revisar {formatShort(firstReview)}
        </span>
      ) : null}
    </span>
  );
}

function formatShort(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}
