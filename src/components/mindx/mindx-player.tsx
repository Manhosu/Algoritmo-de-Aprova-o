"use client";

import { Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { MindXItem } from "@/server/engine/mindx";

import { markSeenAction } from "./mindx-actions";

/**
 * O PLAYER DO MIND-X.
 * ============================================================================
 *
 * A cliente pediu "uma espécie de Stories do Algoritmo da Aprovação". As
 * convenções de stories não são enfeite: elas são o que faz a pessoa saber o
 * que fazer sem instrução nenhuma.
 *
 * ⚠️ TOQUE NA DIREITA AVANÇA, NA ESQUERDA VOLTA.
 *
 * É o gesto que todo mundo já tem no dedo. Um botão "próximo" no rodapé
 * funcionaria e obrigaria a pessoa a aprender a nossa versão de algo que ela já
 * sabe fazer.
 *
 * ⚠️ O ÁUDIO COMEÇA LIGADO, e isso só é possível por causa do gesto de entrada.
 *
 * Navegador bloqueia vídeo com som que começa sozinho. Como o aluno TOCA no "+"
 * para abrir o Mind-X, esse toque autoriza a reprodução com áudio. Sem contar
 * com isso, o feed nasceria mudo e ninguém entenderia por quê.
 *
 * Ainda assim há o botão de silenciar: quem está estudando no ônibus precisa
 * dele, e a barra de progresso continua contando.
 */

export function MindXPlayer({ items }: { items: MindXItem[] }) {
  const [indice, setIndice] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [mudo, setMudo] = useState(false);
  const [progresso, setProgresso] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const atual = items[indice];
  const proximo = items[indice + 1];

  const avancar = useCallback(() => {
    setIndice((i) => (i + 1 < items.length ? i + 1 : i));
    setProgresso(0);
  }, [items.length]);

  const voltar = useCallback(() => {
    setIndice((i) => Math.max(0, i - 1));
    setProgresso(0);
  }, []);

  /*
    ⚠️ O "VISTO" É GRAVADO AO ABRIR, não ao terminar.

    Quem pula no primeiro segundo viu o vídeo o suficiente para ele não voltar
    amanhã. Gravar só no fim faria o feed repetir tudo que a pessoa não quis
    assistir — exatamente o oposto da rotação.
  */
  useEffect(() => {
    if (!atual) return;
    void markSeenAction(atual.id);
  }, [atual]);

  /* Teclado: quem está no computador espera as setas. */
  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "ArrowRight") avancar();
      if (evento.key === "ArrowLeft") voltar();
      if (evento.key === " ") {
        evento.preventDefault();
        setPausado((p) => !p);
      }
    }

    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [avancar, voltar]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (pausado) video.pause();
    else void video.play().catch(() => {
      /*
        Se o navegador recusar mesmo assim, o vídeo fica parado com o botão de
        play visível. Melhor que um erro: a pessoa toca e resolve.
      */
      setPausado(true);
    });
  }, [pausado, indice]);

  if (!atual) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      {/* As barrinhas de progresso, uma por vídeo, como nos stories. */}
      <div className="absolute inset-x-0 top-0 z-20 flex gap-1 p-3 pt-safe">
        {items.map((item, i) => (
          <span
            key={item.id}
            className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30"
          >
            <span
              className="block h-full rounded-full bg-white"
              style={{
                width: i < indice ? "100%" : i === indice ? `${progresso}%` : "0%",
                transition: i === indice ? "width 120ms linear" : "none",
              }}
            />
          </span>
        ))}
      </div>

      <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-4 pt-10">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-white/70 uppercase">
            Mind-X
          </p>
          {atual.topicName || atual.subjectName ? (
            <p className="mt-0.5 truncate text-sm font-medium text-white">
              {atual.topicName ?? atual.subjectName}
            </p>
          ) : null}

          {/*
            Dizer POR QUE este vídeo apareceu é o que separa um feed de um
            sorteio. "Você errou 62% aqui" transforma a dica em resposta.
          */}
          {atual.reason === "lacuna" ? (
            <p className="mt-0.5 text-xs text-white/60">
              Escolhido pelas suas lacunas
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setMudo((m) => !m)}
            aria-label={mudo ? "Ativar som" : "Silenciar"}
            className="flex size-10 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10"
          >
            {mudo ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </button>

          <a
            href="/inicio"
            aria-label="Fechar"
            className="flex size-10 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10"
          >
            <X className="size-5" />
          </a>
        </div>
      </div>

      {/*
        ⚠️ `object-contain`, e não `cover`.

        Os vídeos vêm em 9:16, mas nada garante que o próximo venha. `cover`
        cortaria o texto que a cliente queima no vídeo, e o texto é o conteúdo.
      */}
      <video
        ref={videoRef}
        key={atual.id}
        src={atual.src ?? undefined}
        className="h-full w-full object-contain"
        playsInline
        autoPlay
        muted={mudo}
        onTimeUpdate={(evento) => {
          const v = evento.currentTarget;
          if (v.duration > 0) setProgresso((v.currentTime / v.duration) * 100);
        }}
        onEnded={avancar}
      />

      {/*
        ⚠️ O PRÓXIMO VÍDEO JÁ VEM BAIXANDO, e é o que faz o feed parecer contínuo.

        Cada story tem cerca de 2 MB. Sem isto, tocar na metade direita da tela
        começa um download do zero: o aluno vê preto por alguns segundos, no
        celular, a cada transição — e um feed que trava a cada toque ninguém
        percorre até o fim.

        `preload="auto"` num elemento escondido é o jeito de pedir os bytes sem
        montar um segundo player. Ele não toca: não tem `autoPlay`, e o
        `muted` existe porque navegador nenhum pré-carrega vídeo com som.

        Só UM à frente. Dez elementos baixariam 20 MB do plano de dados do aluno
        para um feed que ele pode fechar no segundo vídeo.
      */}
      {proximo?.src ? (
        <video
          key={`proximo-${proximo.id}`}
          src={proximo.src}
          preload="auto"
          muted
          playsInline
          aria-hidden
          className="pointer-events-none absolute size-px opacity-0"
        />
      ) : null}

      {/*
        As duas metades invisíveis que recebem o toque. Ficam ABAIXO da barra de
        cima na ordem de empilhamento, senão engoliriam o botão de fechar.
      */}
      <button
        type="button"
        aria-label="Vídeo anterior"
        onClick={voltar}
        className="absolute inset-y-0 left-0 z-10 w-1/3 cursor-default"
      />
      <button
        type="button"
        aria-label="Próximo vídeo"
        onClick={avancar}
        className="absolute inset-y-0 right-0 z-10 w-1/3 cursor-default"
      />

      {/* Toque no meio pausa, como nos stories. */}
      <button
        type="button"
        aria-label={pausado ? "Continuar" : "Pausar"}
        onClick={() => setPausado((p) => !p)}
        className="absolute inset-y-0 left-1/3 z-10 w-1/3 cursor-default"
      />

      {pausado ? (
        <span
          className="pointer-events-none absolute z-20 flex size-16 items-center justify-center rounded-full bg-black/50"
          aria-hidden
        >
          <Play className="size-8 text-white" />
        </span>
      ) : null}

      {atual.description ? (
        <p
          className={cn(
            "absolute inset-x-0 bottom-0 z-20 p-5 pb-safe",
            "bg-gradient-to-t from-black/80 to-transparent",
            "text-pretty text-sm text-white/90",
          )}
        >
          {atual.description}
        </p>
      ) : null}

      {/* Último vídeo: em vez de travar, oferece a saída. */}
      {indice === items.length - 1 ? (
        <a
          href="/inicio"
          className="absolute bottom-20 z-20 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black"
        >
          Voltar aos estudos
        </a>
      ) : null}

      <span className="sr-only" aria-live="polite">
        Vídeo {indice + 1} de {items.length}: {atual.title}
      </span>

      {/* Ícone de pausa fora da tela, só para o leitor de tela ter o par. */}
      <Pause className="sr-only" aria-hidden />
    </div>
  );
}
