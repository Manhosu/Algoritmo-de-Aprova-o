import Image from "next/image";

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
  /** Largura em pixels. A altura acompanha a proporção. */
  width?: number;
  className?: string;
  priority?: boolean;
};

export function Logo({ width = 220, className, priority = false }: LogoProps) {
  const shared = "h-auto w-full select-none";

  return (
    <span
      className={cn("inline-block", className)}
      style={{ width }}
      role="img"
      aria-label={APP_NAME}
    >
      <Image
        src={logoLight}
        alt=""
        aria-hidden
        priority={priority}
        className={cn(shared, "dark:hidden")}
        sizes={`${width}px`}
      />
      <Image
        src={logoDark}
        alt=""
        aria-hidden
        priority={priority}
        className={cn(shared, "hidden dark:block")}
        sizes={`${width}px`}
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
