"use client";

import { Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * O JOGO DENTRO DO SITE, NUMA JANELA COM BOTÃO DE TELA CHEIA.
 * ============================================================================
 *
 * Pedido da cliente em 14/09/2026: "queria que abrisse conforme abre os mapas
 * mentais, em uma janela pequena que depois tem o botão de maximizar em tela
 * cheia, sem abrir nova janela. Dessa forma não sai do site."
 *
 * ⚠️ A TELA CHEIA TEM DOIS CAMINHOS, e os dois ligam juntos.
 *
 * O primeiro é a tela cheia do navegador (`requestFullscreen`), que esconde até
 * a barra de endereço. O iPhone não oferece isso para um quadro da página, e é
 * lá que muita gente estuda. Então a caixa também passa a cobrir a tela inteira
 * por CSS: no iPhone é esse que funciona, e nos outros ele fica por baixo, sem
 * efeito visível. A barra com o botão de sair fica EM CIMA, e não sobre o jogo:
 * o jogo usa a tela toda, e um botão flutuando por cima esconderia uma peça.
 *
 * ⚠️ O NAVEGADOR É QUEM SABE SE SAIU DA TELA CHEIA. O Esc e o gesto do sistema
 * saem sem passar pelo nosso botão; ouvir `fullscreenchange` mantém o rótulo
 * certo — o mesmo cuidado do visualizador de mapa mental.
 */
export function GameFrame({ src, title }: { src: string; title: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [cheia, setCheia] = useState(false);

  useEffect(() => {
    const aoMudar = () => {
      if (!document.fullscreenElement) setCheia(false);
    };
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, []);

  useEffect(() => {
    if (!cheia) return;

    /* No modo por CSS (iPhone), o Esc também precisa sair. */
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setCheia(false);
    };
    window.addEventListener("keydown", aoTeclar);

    /*
      Com a caixa cobrindo a tela, a página de trás não pode rolar junto.

      ⚠️ A RAIZ TAMBÉM, e não só o `body`. A tela cheia do navegador mede 100%
      da largura SEM a barra de rolagem da página, que mora no `html`: o jogo
      ficava 15 px mais estreito, com uma faixa da página aparecendo à direita.
    */
    const raiz = document.documentElement;
    const anteriores = [raiz.style.overflow, document.body.style.overflow] as const;
    raiz.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", aoTeclar);
      raiz.style.overflow = anteriores[0];
      document.body.style.overflow = anteriores[1];
    };
  }, [cheia]);

  function alternar() {
    if (cheia) {
      setCheia(false);
      if (document.fullscreenElement) void document.exitFullscreen?.();
      return;
    }

    setCheia(true);
    void caixa.current?.requestFullscreen?.().catch(() => {
      /* iPhone: fica a tela cheia por CSS. */
    });
  }

  return (
    <div
      ref={caixa}
      className={cn(
        "flex flex-col overflow-hidden border-border bg-card",
        cheia ? "fixed inset-0 z-[70] h-dvh w-screen" : "relative rounded-xl border",
      )}
    >
      <div className="flex items-center gap-2 border-b border-border bg-background/80 px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{title}</span>
        <button
          type="button"
          onClick={alternar}
          aria-label={cheia ? "Sair da tela cheia" : "Tela cheia"}
          title={cheia ? "Sair da tela cheia" : "Tela cheia"}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm text-foreground transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&>svg]:size-4"
        >
          {cheia ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
          {cheia ? "Sair" : "Tela cheia"}
        </button>
      </div>

      {/*
        `sandbox` libera o que um jogo precisa (script, o armazenamento do
        próprio jogo, formulários) e nada que deixe o quadro navegar a NOSSA
        página. `allow="fullscreen"` deixa o próprio jogo pedir tela cheia, se
        ele tiver um botão para isso.
      */}
      <iframe
        src={src}
        title={title}
        allow="fullscreen; autoplay; clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups"
        referrerPolicy="no-referrer"
        className={cn(
          "w-full border-0 bg-background",
          cheia ? "min-h-0 flex-1" : "h-[70vh] min-h-[420px]",
        )}
      />
    </div>
  );
}
