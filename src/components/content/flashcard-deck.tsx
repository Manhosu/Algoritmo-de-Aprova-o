"use client";

import { Check, Lightbulb, RotateCcw, Undo2 } from "lucide-react";
import { useState } from "react";

import {
  answerCard,
  isFinished,
  remaining,
  startSession,
} from "@/modules/content/flashcard-session";

/**
 * O BARALHO DE FLASHCARDS (README 2.2), no estilo Anki desde 08/09/2026.
 * ============================================================================
 *
 * ⚠️ O VERSO SÓ APARECE DEPOIS DE VIRAR, e isso não é estética.
 *
 * Flashcard funciona por RECUPERAÇÃO ATIVA: o esforço de tentar lembrar é o que
 * fixa, e ver a resposta junto com a pergunta anula o exercício inteiro. Por
 * isso o verso não está escondido com CSS — ele não é renderizado até o aluno
 * virar. Um `display: none` continuaria no DOM, visível para quem inspeciona e,
 * pior, lido pelo leitor de tela antes da hora.
 *
 * ⚠️ "ANTERIOR / PRÓXIMO" SAIU (pedido da cliente em 08/09/2026).
 *
 * Palavras dela: "os flashcards poderiam funcionar como no Anki: fácil e
 * difícil, e o difícil volta para o fim do baralho".
 *
 * Ela está certa sobre o que faltava. Com setas, o aluno folheava o baralho e
 * chegava ao fim tendo acertado ou não — o cartão que ele não sabia sumia junto
 * com os outros. O que faz o flashcard ensinar é o cartão errado VOLTAR.
 *
 * A fila fica em `modules/content/flashcard-session`, pura e testada. Aqui só
 * mora a tela.
 */
export function FlashcardDeck({
  cards,
}: {
  cards: Array<{ id: string; front: string; back: string; hint: string | null }>;
}) {
  const [sessao, setSessao] = useState(() => startSession(cards));
  const [virado, setVirado] = useState(false);
  const [dicaAberta, setDicaAberta] = useState(false);

  if (cards.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Este baralho ainda não tem cartões.
      </p>
    );
  }

  function responder(nota: "easy" | "hard") {
    setSessao((atual) => answerCard(atual, nota));
    setVirado(false);
    setDicaAberta(false);
  }

  if (isFinished(sessao)) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-success/40 bg-success/10 p-8 text-center">
        <Check className="size-9 text-success" aria-hidden />
        <p className="text-lg font-bold text-foreground">Baralho dominado</p>
        <p className="text-pretty text-sm text-muted-foreground">
          {sessao.repeats === 0
            ? `Você acertou os ${sessao.total} cartões de primeira.`
            : `${sessao.total} cartões, com ${sessao.repeats} ${
                sessao.repeats === 1 ? "repetição" : "repetições"
              } pelo caminho.`}
        </p>
        <button
          type="button"
          onClick={() => {
            setSessao(startSession(cards));
            setVirado(false);
            setDicaAberta(false);
          }}
          className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <RotateCcw className="size-4 shrink-0" aria-hidden />
          Começar de novo
        </button>
      </div>
    );
  }

  const cartao = sessao.current;
  if (!cartao) return null;

  const faltam = remaining(sessao);
  const ultimo = sessao.queue.length === 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {/*
            ⚠️ O CONTADOR MOSTRA O QUE FALTA, e não "cartão 3 de 10".

            A posição não significa mais nada quando um cartão pode voltar: o
            aluno chegaria ao "10 de 10" e continuaria estudando, o que faz o
            número parecer quebrado. Quantos faltam dominar é o que anda numa
            direção só.
          */}
          <span className="text-metric text-foreground">{faltam}</span>{" "}
          {faltam === 1 ? "cartão para dominar" : "cartões para dominar"}
        </p>

        {cartao.hint && !virado ? (
          <button
            type="button"
            onClick={() => setDicaAberta((v) => !v)}
            className="flex shrink-0 items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
          >
            <Lightbulb className="size-4 shrink-0" aria-hidden />
            {dicaAberta ? "Esconder dica" : "Ver dica"}
          </button>
        ) : null}
      </div>

      <div
        className="h-1.5 overflow-hidden rounded-full bg-card"
        role="progressbar"
        aria-valuenow={sessao.learned}
        aria-valuemin={0}
        aria-valuemax={sessao.total}
        aria-label="Cartões dominados"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${(sessao.learned / sessao.total) * 100}%` }}
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

        {!virado ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <RotateCcw className="size-3.5 shrink-0" aria-hidden />
            Toque para ver a resposta
          </span>
        ) : null}
      </button>

      {/*
        ⚠️ OS DOIS BOTÕES SÓ APARECEM DEPOIS DE VIRAR.

        Julgar antes de ver a resposta é julgar a própria confiança, não o
        acerto — e é assim que alguém marca "fácil" num cartão que teria errado.
      */}
      {virado ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => responder("hard")}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-warning/50 bg-warning/10 text-sm font-semibold text-foreground transition-colors hover:bg-warning/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Undo2 className="size-4 shrink-0" aria-hidden />
            Difícil
          </button>

          <button
            type="button"
            onClick={() => responder("easy")}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-success/50 bg-success/10 text-sm font-semibold text-foreground transition-colors hover:bg-success/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Check className="size-4 shrink-0" aria-hidden />
            Fácil
          </button>
        </div>
      ) : null}

      {virado ? (
        <p className="text-center text-xs text-pretty text-muted-foreground">
          {/*
            Com um cartão só na fila, "volta para o fim" o traz de volta na
            hora — e o botão pareceria não ter feito nada. Dizer que é o último
            explica antes de acontecer.
          */}
          {ultimo
            ? "É o último. Marcando como difícil, ele continua aqui até você acertar."
            : "Difícil devolve o cartão ao fim do baralho. Fácil o tira de vez."}
        </p>
      ) : null}
    </div>
  );
}
