"use client";

import { Pause, Play, RotateCcw, Timer } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * POMODORO NA BARRA SUPERIOR (pedido da cliente em 02/09/2026).
 * ============================================================================
 *
 * ⚠️ O TEMPO É CALCULADO A PARTIR DE UM INSTANTE, e não decrementado.
 *
 * Um `setInterval` que faz `segundos - 1` erra sempre: o navegador estrangula
 * o temporizador em aba de fundo, e no celular ele para junto com a tela. O
 * aluno voltaria depois de 25 minutos reais e veria 18 no relógio.
 *
 * Guardando o instante do FIM e comparando com `Date.now()`, o relógio está
 * certo em qualquer situação — o intervalo só serve para repintar.
 *
 * ⚠️ E SOBREVIVE À NAVEGAÇÃO, no `localStorage`.
 *
 * O aluno inicia o ciclo e vai estudar: abre o material, o banco de questões,
 * a revisão. Cada navegação remonta o componente. Sem persistir, o pomodoro
 * zeraria no primeiro clique — e um pomodoro que não atravessa a sessão de
 * estudo não serve para nada.
 */

const CHAVE = "pomodoro";

const CICLOS = {
  foco: { minutos: 25, rotulo: "Foco", proximo: "pausa" },
  pausa: { minutos: 5, rotulo: "Pausa", proximo: "foco" },
} as const;

type Ciclo = keyof typeof CICLOS;

type Estado = {
  ciclo: Ciclo;
  /** Instante do fim, em ms. Nulo quando pausado. */
  terminaEm: number | null;
  /** Quando pausado, quanto restava. */
  restanteMs: number;
};

function inicial(ciclo: Ciclo = "foco"): Estado {
  return { ciclo, terminaEm: null, restanteMs: CICLOS[ciclo].minutos * 60_000 };
}

function ler(): Estado {
  /*
    ⚠️ Em try/catch: `localStorage` LANÇA em janela anônima com cookies
    bloqueados e em alguns WebViews. Uma exceção aqui derrubaria o cabeçalho
    inteiro, em todas as telas.
  */
  try {
    const cru = localStorage.getItem(CHAVE);
    if (!cru) return inicial();

    const salvo = JSON.parse(cru) as Estado;
    if (salvo.ciclo !== "foco" && salvo.ciclo !== "pausa") return inicial();

    return salvo;
  } catch {
    return inicial();
  }
}

function gravar(estado: Estado) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado));
  } catch {
    /* Sem persistência o pomodoro ainda funciona dentro da tela. */
  }
}

export function Pomodoro() {
  /*
    ⚠️ O ESTADO NASCE JÁ LIDO DO `localStorage`, e o `montado` esconde a
    diferença até a hidratação terminar.

    Ler dentro de um efeito e chamar `setEstado` seria uma renderização a mais
    e um aviso do lint — com razão: o valor já existe no primeiro render do
    cliente, não há por que fingir que não.

    `useSyncExternalStore` devolvendo `false` no servidor e `true` no cliente é
    a forma suportada de perguntar "já montou?", e é a mesma que o seletor de
    tema usa. Enquanto for `false`, nada que dependa do `localStorage` chega à
    tela, então o HTML do servidor e o do navegador coincidem.
  */
  const [estado, setEstado] = useState<Estado>(() =>
    typeof window === "undefined" ? inicial() : ler(),
  );
  const [agora, setAgora] = useState(() => Date.now());
  const avisou = useRef(false);

  const montado = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!estado.terminaEm) return;

    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [estado.terminaEm]);

  const restanteMs = estado.terminaEm
    ? Math.max(0, estado.terminaEm - agora)
    : estado.restanteMs;

  const trocarCiclo = useCallback((proximo: Ciclo) => {
    const novo = inicial(proximo);
    setEstado(novo);
    gravar(novo);
  }, []);

  /* Fim do ciclo: troca sozinho e avisa uma vez só. */
  useEffect(() => {
    if (!estado.terminaEm || restanteMs > 0) {
      avisou.current = false;
      return;
    }

    if (avisou.current) return;
    avisou.current = true;

    trocarCiclo(CICLOS[estado.ciclo].proximo);
  }, [restanteMs, estado.terminaEm, estado.ciclo, trocarCiclo]);

  function alternar() {
    const novo: Estado = estado.terminaEm
      ? { ...estado, terminaEm: null, restanteMs }
      : { ...estado, terminaEm: Date.now() + restanteMs };

    setEstado(novo);
    setAgora(Date.now());
    gravar(novo);
  }

  const minutos = Math.floor(restanteMs / 60_000);
  const segundos = Math.floor((restanteMs % 60_000) / 1000);
  const relogio = `${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}`;

  const rodando = Boolean(estado.terminaEm);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-1.5 rounded-full px-2.5 py-1.5 transition-colors",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          rodando ? "text-primary" : "text-muted-foreground hover:text-foreground",
        )}
        aria-label={`Pomodoro: ${rodando ? relogio : "parado"}`}
      >
        <Timer className="size-5 shrink-0" aria-hidden />
        {/*
          O relógio só aparece DEPOIS de montar e quando há ciclo em andamento.
          Um "25:00" fixo na barra ocupa espaço no celular sem informar nada.
        */}
        {montado && rodando ? (
          <span className="text-metric text-sm tabular-nums">{relogio}</span>
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56 max-w-[calc(100vw-2rem)] p-3">
        <p className="text-xs text-muted-foreground">{CICLOS[estado.ciclo].rotulo}</p>

        <p className="text-metric mt-1 text-3xl tabular-nums text-foreground">
          {montado ? relogio : "--:--"}
        </p>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={alternar}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
          >
            {rodando ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
            {rodando ? "Pausar" : "Iniciar"}
          </button>

          <button
            type="button"
            onClick={() => trocarCiclo(estado.ciclo)}
            aria-label="Reiniciar o ciclo"
            className="rounded-lg border border-border px-3 py-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="size-4" aria-hidden />
          </button>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1">
          {(Object.keys(CICLOS) as Ciclo[]).map((ciclo) => (
            <button
              key={ciclo}
              type="button"
              onClick={() => trocarCiclo(ciclo)}
              className={cn(
                "rounded-md px-2 py-1.5 text-xs transition-colors",
                estado.ciclo === ciclo
                  ? "bg-primary-soft text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {CICLOS[ciclo].rotulo} · {CICLOS[ciclo].minutos}min
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
