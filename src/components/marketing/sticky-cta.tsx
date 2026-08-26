"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * CTA fixo no rodapé, só no celular.
 *
 * POR QUE ELE APARECE DEPOIS, E NÃO DE CARA
 * ----------------------------------------------------------------------------
 * A primeira dobra já tem o botão principal. Uma barra fixa por cima dele
 * seria a mesma oferta duas vezes, tapando conteúdo desde o primeiro segundo —
 * e barra que cobre texto antes de a pessoa ler qualquer coisa é o padrão que
 * ensina a fechar a página.
 *
 * Então ela entra quando o botão da dobra já saiu de vista: a partir daí a
 * pessoa está lendo, e ter o caminho à mão é ajuda, não interrupção.
 *
 * ⚠️ Só em telas pequenas. No desktop o cabeçalho fica fixo e já leva o "Criar
 * conta"; repetir embaixo seria ruído.
 */

/** Rolagem a partir da qual a primeira dobra já saiu da tela. */
const APPEAR_AFTER_PX = 560;

export function StickyCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > APPEAR_AFTER_PX);

    update();
    // `passive`: o ouvinte não cancela o gesto, então a rolagem não engasga.
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pt-3 pb-safe backdrop-blur-sm lg:hidden",
        "transition-transform duration-300",
        visible ? "translate-y-0" : "translate-y-full",
      )}
      // Escondido de leitor de tela enquanto está fora da tela: o link já
      // existe na página, e anunciá-lo duas vezes só atrapalha a navegação.
      aria-hidden={!visible}
    >
      <Button asChild size="lg" className="w-full" tabIndex={visible ? undefined : -1}>
        <Link href="/cadastrar">
          Começar agora, é grátis
          <ArrowRight aria-hidden />
        </Link>
      </Button>

      <p className="pt-2 pb-3 text-center text-xs text-muted-foreground">
        Não pedimos cartão.
      </p>
    </div>
  );
}
