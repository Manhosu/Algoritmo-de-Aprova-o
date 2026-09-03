"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * A navegação do painel.
 *
 * ⚠️ ROLA NA HORIZONTAL EM VEZ DE QUEBRAR EM DUAS LINHAS.
 *
 * São seis seções, e em 390px elas não cabem. Quebrar a linha empurraria o
 * conteúdo da página para baixo da dobra em toda tela do painel. A tira que
 * rola mantém a altura fixa e a primeira aba sempre visível — e o
 * `no-scrollbar` tira a barra que, no desktop, ficaria cortando a borda.
 */
const ABAS = [
  { href: "/admin", rotulo: "Visão geral", exato: true },
  { href: "/admin/alunos", rotulo: "Alunos" },
  { href: "/admin/atividades", rotulo: "Atividades" },
  { href: "/admin/questoes", rotulo: "Questões" },
  { href: "/admin/materiais", rotulo: "Materiais" },
  { href: "/admin/editais", rotulo: "Editais" },
  { href: "/admin/planos", rotulo: "Planos" },
  { href: "/admin/loja", rotulo: "Loja" },
  { href: "/admin/algoritmo", rotulo: "Algoritmo" },
  { href: "/admin/textos", rotulo: "Textos do site" },
];

export function AdminNav() {
  const caminho = usePathname();

  return (
    <nav
      aria-label="Seções do painel"
      className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-5xl items-center gap-1 overflow-x-auto no-scrollbar px-4 py-2">
        {ABAS.map((aba) => {
          const ativa = aba.exato ? caminho === aba.href : caminho.startsWith(aba.href);

          return (
            <Link
              key={aba.href}
              href={aba.href}
              aria-current={ativa ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                ativa
                  ? "bg-primary/15 font-semibold text-primary"
                  : "text-muted-foreground hover:bg-card hover:text-foreground",
              )}
            >
              {aba.rotulo}
            </Link>
          );
        })}

        <Link
          href="/inicio"
          className="ml-auto shrink-0 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Área de estudo
        </Link>
      </div>
    </nav>
  );
}
