"use client";

import { ChevronLeft, ChevronRight, Lightbulb, RotateCcw } from "lucide-react";
import { useState } from "react";

/**
 * O BARALHO DE FLASHCARDS (README 2.2).
 * ============================================================================
 *
 * Um cartão por vez, frente e verso.
 *
 * ⚠️ O VERSO SÓ APARECE DEPOIS DE VIRAR, e isso não é estética.
 *
 * Flashcard funciona por RECUPERAÇÃO ATIVA: o esforço de tentar lembrar é o
 * que fixa, e ver a resposta junto com a pergunta anula o exercício inteiro.
 * Por isso o verso não está escondido com CSS — ele não é renderizado até o
 * aluno virar. Um `display: none` continuaria no DOM, visível para quem
 * inspeciona e, pior, lido pelo leitor de tela antes da hora.
 */
export function FlashcardDeck({
  cards,
}: {
  cards: Array<{ id: string; front: string; back: string; hint: string | null }>;
}) {
  const [indice, setIndice] = useState(0);
  const [virado, setVirado] = useState(false);
  const [dicaAberta, setDicaAberta] = useState(false);

  if (cards.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Este baralho ainda não tem cartões.
      </p>
    );
  }

  const cartao = cards[indice];

  const ir = (passo: number) => {
    setIndice((atual) => Math.min(cards.length - 1, Math.max(0, atual + passo)));
    setVirado(false);
    setDicaAberta(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-muted-foreground">
          Cartão <span className="text-metric text-foreground">{indice + 1}</span> de{" "}
          {cards.length}
        </p>

        {cartao.hint && !virado ? (
          <button
            type="button"
            onClick={() => setDicaAberta((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
          >
            <Lightbulb className="size-4 shrink-0" aria-hidden />
            {dicaAberta ? "Esconder dica" : "Ver dica"}
          </button>
        ) : null}
      </div>

      <div
        className="h-1.5 overflow-hidden rounded-full bg-card"
        role="progressbar"
        aria-valuenow={indice + 1}
        aria-valuemin={1}
        aria-valuemax={cards.length}
        aria-label="Progresso no baralho"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${((indice + 1) / cards.length) * 100}%` }}
        />
      </div>

      <button
        type="button"
        onClick={() => setVirado((v) => !v)}
        aria-live="polite"
        className="flex min-h-56 w-full flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card p-6 text-center transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <p className="text-eyebrow">{virado ? "Resposta" : "Pergunta"}</p>

        <p className="text-pretty text-lg text-foreground">
          {virado ? cartao.back : cartao.front}
        </p>

        {dicaAberta && cartao.hint && !virado ? (
          <p className="text-pretty text-sm text-muted-foreground">{cartao.hint}</p>
        ) : null}

        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RotateCcw className="size-3.5 shrink-0" aria-hidden />
          {virado ? "Toque para ver a pergunta" : "Toque para ver a resposta"}
        </span>
      </button>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => ir(-1)}
          disabled={indice === 0}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border text-sm text-foreground transition-colors hover:border-primary/40 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ChevronLeft className="size-4 shrink-0" aria-hidden />
          Anterior
        </button>

        <button
          type="button"
          onClick={() => ir(1)}
          disabled={indice === cards.length - 1}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border text-sm text-foreground transition-colors hover:border-primary/40 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Próximo
          <ChevronRight className="size-4 shrink-0" aria-hidden />
        </button>
      </div>
    </div>
  );
}
