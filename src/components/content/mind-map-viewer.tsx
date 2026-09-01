"use client";

import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useRef, useState } from "react";

/**
 * O VISUALIZADOR DE MAPA MENTAL, COM ZOOM (README 2.2).
 * ============================================================================
 *
 * Mapa mental é uma imagem larga e densa. Numa tela de 390px ele chega
 * ilegível, e "abra em outra aba" empurra o aluno para fora do produto no
 * momento em que ele estava estudando.
 *
 * ⚠️ ZOOM POR `transform`, NUNCA POR `width`.
 *
 * Mudar a largura da imagem obriga o navegador a refazer layout da página
 * inteira a cada passo — em imagem grande, isso trava visivelmente no celular.
 * `transform: scale()` é composto na GPU e não invalida layout nenhum.
 *
 * ⚠️ ARRASTAR USA EVENTOS DE PONTEIRO, não de mouse.
 *
 * `pointerdown/move/up` cobrem dedo, caneta e mouse com um código só, e o
 * `setPointerCapture` garante que soltar o dedo fora da caixa ainda encerre o
 * arraste — sem ele, o mapa fica "grudado" no cursor.
 */

const MIN = 1;
const MAX = 4;
const PASSO = 0.5;

export function MindMapViewer({
  src,
  alt,
  width,
  height,
}: {
  src: string;
  alt: string;
  width: number | null;
  height: number | null;
}) {
  const [escala, setEscala] = useState(1);
  const [posicao, setPosicao] = useState({ x: 0, y: 0 });
  const caixa = useRef<HTMLDivElement>(null);

  /**
   * A origem do arraste vive num ref; o FATO de estar arrastando vive em estado.
   *
   * ⚠️ São coisas diferentes e a distinção importa. A origem muda a cada
   * `pointermove` e não deve provocar renderização — seria uma por quadro. Já o
   * "está arrastando" precisa APARECER: é ele que desliga a transição de 150ms,
   * que durante o arraste faria o mapa perseguir o dedo com atraso. Ref não
   * re-renderiza, então lê-lo no `style` daria uma transição que nunca some.
   */
  const origem = useRef<{ x: number; y: number } | null>(null);
  const [arrastando, setArrastando] = useState(false);

  const ajustar = useCallback((proxima: number) => {
    const limitada = Math.min(MAX, Math.max(MIN, proxima));
    setEscala(limitada);
    // Voltar ao tamanho natural recentraliza: um mapa reduzido e deslocado
    // deixaria faixas vazias na caixa sem motivo.
    if (limitada === 1) setPosicao({ x: 0, y: 0 });
  }, []);

  const iniciarArrasto = (evento: React.PointerEvent<HTMLDivElement>) => {
    if (escala === 1) return;
    origem.current = { x: evento.clientX - posicao.x, y: evento.clientY - posicao.y };
    setArrastando(true);
    evento.currentTarget.setPointerCapture(evento.pointerId);
  };

  const moverArrasto = (evento: React.PointerEvent<HTMLDivElement>) => {
    if (!origem.current) return;
    setPosicao({
      x: evento.clientX - origem.current.x,
      y: evento.clientY - origem.current.y,
    });
  };

  const encerrarArrasto = (evento: React.PointerEvent<HTMLDivElement>) => {
    origem.current = null;
    setArrastando(false);
    if (evento.currentTarget.hasPointerCapture(evento.pointerId)) {
      evento.currentTarget.releasePointerCapture(evento.pointerId);
    }
  };

  const abrirTelaCheia = () => {
    void caixa.current?.requestFullscreen?.().catch(() => {
      /* Safari em iPhone não expõe fullscreen em div; os botões de zoom bastam. */
    });
  };

  return (
    <figure className="flex flex-col gap-2">
      <div
        ref={caixa}
        className="relative flex flex-col overflow-hidden rounded-xl border border-border bg-card"
      >
        {/*
          ⚠️ A ÁREA DA IMAGEM TEM ALTURA PRÓPRIA, e os controles ficam ABAIXO
          dela, não flutuando por cima.

          A primeira versão punha a barra sobre o canto inferior direito do
          mapa. Num mapa mental isso é o pior lugar possível: o canto tem
          conteúdo como qualquer outro, e a barra escondia justamente o que o
          aluno tinha acabado de aproximar para ler. Sobreposição só funciona
          quando há margem morta — e aqui não há.
        */}
        <div
          onPointerDown={iniciarArrasto}
          onPointerMove={moverArrasto}
          onPointerUp={encerrarArrasto}
          onPointerCancel={encerrarArrasto}
          onDoubleClick={() => ajustar(escala >= MAX ? MIN : escala + 1)}
          className="flex max-h-[70vh] min-h-64 touch-none items-center justify-center overflow-hidden"
          style={{ cursor: escala === 1 ? "zoom-in" : arrastando ? "grabbing" : "grab" }}
        >
          {/*
            `<img>` cru, não `next/image`: o endereço é uma URL assinada que
            muda a cada carregamento, então o otimizador não teria o que
            reaproveitar entre visitas — e ainda passaria a imagem inteira pelo
            servidor do Next, que é exatamente o que a URL assinada evita.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            width={width ?? undefined}
            height={height ?? undefined}
            draggable={false}
            className="max-h-[70vh] max-w-full origin-center object-contain select-none"
            style={{
              transform: `translate(${posicao.x}px, ${posicao.y}px) scale(${escala})`,
              transition: arrastando ? "none" : "transform 150ms ease-out",
            }}
          />
        </div>

        <div className="flex items-center justify-center gap-1 border-t border-border bg-background/60 p-1">
          <Botao
            rotulo="Diminuir zoom"
            onClick={() => ajustar(escala - PASSO)}
            desabilitado={escala <= MIN}
          >
            <Minus />
          </Botao>

          <span className="text-metric flex min-w-10 items-center justify-center text-xs text-muted-foreground">
            {Math.round(escala * 100)}%
          </span>

          <Botao
            rotulo="Aumentar zoom"
            onClick={() => ajustar(escala + PASSO)}
            desabilitado={escala >= MAX}
          >
            <Plus />
          </Botao>

          <Botao
            rotulo="Voltar ao tamanho original"
            onClick={() => ajustar(MIN)}
            desabilitado={escala === MIN && posicao.x === 0 && posicao.y === 0}
          >
            <RotateCcw />
          </Botao>

          <Botao rotulo="Tela cheia" onClick={abrirTelaCheia}>
            <Maximize2 />
          </Botao>
        </div>
      </div>

      <figcaption className="text-xs text-muted-foreground">
        Toque duas vezes para aproximar. Com zoom, arraste para mover.
      </figcaption>
    </figure>
  );
}

function Botao({
  rotulo,
  onClick,
  desabilitado,
  children,
}: {
  rotulo: string;
  onClick: () => void;
  desabilitado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      aria-label={rotulo}
      title={rotulo}
      className="flex size-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-card disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&>svg]:size-4"
    >
      {children}
    </button>
  );
}
