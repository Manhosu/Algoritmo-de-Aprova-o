import Image from "next/image";
import type { CSSProperties } from "react";

import logoDark from "@/../public/brand/logo-dark.png";
import logoLight from "@/../public/brand/logo-light.png";
import symbol from "@/../public/brand/symbol.png";
import { APP_NAME } from "@/config/app";
import { cn } from "@/lib/utils";

/**
 * Assinatura da marca.
 *
 * A cliente entregou DUAS versões da assinatura horizontal, que diferem só na
 * cor da palavra "ALGORITMO": branca (para fundo escuro) e preta (para fundo
 * claro). O símbolo é ciano nas duas e funciona nos dois temas.
 *
 * POR QUE AS DUAS IMAGENS SÃO RENDERIZADAS E ALTERNADAS POR CSS
 * ----------------------------------------------------------------------------
 * A alternativa seria ler o tema no cliente com `useTheme()` e escolher a
 * imagem. Isso obriga o componente a ser client-side, exige guarda de
 * montagem e ainda pisca no primeiro render — logo piscando é a primeira
 * coisa que o usuário vê ao abrir o site.
 *
 * Com `dark:` do Tailwind, as duas ficam no HTML e o navegador mostra a certa
 * junto com o resto da página. Zero JavaScript, zero piscada, e o componente
 * continua sendo Server Component. O custo é uma imagem a mais no cache.
 */

type LogoProps = {
  /** Largura em pixels a partir de `sm`. A altura acompanha a proporção. */
  width?: number;
  /**
   * Largura em telas pequenas. Sem isto, cai em `width`.
   *
   * ⚠️ EXISTE PORQUE `style={{ width }}` VENCE QUALQUER CLASSE. Enquanto a
   * largura era um estilo em linha, passar `className="w-32 sm:w-44"` não
   * tinha efeito nenhum — e a assinatura, que tem símbolo mais duas linhas de
   * texto, ficava ocupando quase metade da largura de um celular.
   */
  mobileWidth?: number;
  className?: string;
  priority?: boolean;
};

export function Logo({
  width = 220,
  mobileWidth,
  className,
  priority = false,
}: LogoProps) {
  const shared = "h-auto w-full select-none";
  const small = mobileWidth ?? width;

  return (
    <span
      className={cn("inline-block w-(--logo-sm) sm:w-(--logo)", className)}
      style={
        {
          "--logo": `${width}px`,
          "--logo-sm": `${small}px`,
        } as CSSProperties
      }
      role="img"
      aria-label={APP_NAME}
    >
      {/*
        ⚠️ `priority` SÓ NA VERSÃO ESCURA.

        As duas ficam no HTML e o CSS mostra a certa — mas com `priority` nas
        duas o navegador pré-carregava ambas e avisava no console que uma nunca
        foi usada, além de gastar banda de celular com uma imagem invisível.
        O tema padrão do produto é escuro, então é essa que precisa chegar
        primeiro; a clara carrega normalmente para quem escolheu tema claro.
      */}
      <Image
        src={logoLight}
        alt=""
        aria-hidden
        className={cn(shared, "dark:hidden")}
        // Duas larguras reais, para o navegador não baixar a maior no celular.
        sizes={`(max-width: 639px) ${small}px, ${width}px`}
      />
      <Image
        src={logoDark}
        alt=""
        aria-hidden
        priority={priority}
        className={cn(shared, "hidden dark:block")}
        sizes={`(max-width: 639px) ${small}px, ${width}px`}
      />
    </span>
  );
}

/**
 * Só o símbolo (cérebro + circuito), sem texto.
 *
 * Para onde o espaço é curto: header no celular, menu lateral recolhido,
 * tela de carregamento. Ciano puro, então dispensa versão por tema.
 */
export function LogoSymbol({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <Image
      src={symbol}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={cn("h-auto select-none", className)}
      style={{ width: size }}
    />
  );
}
