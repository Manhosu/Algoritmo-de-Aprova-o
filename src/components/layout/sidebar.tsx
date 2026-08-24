"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SIDEBAR_ITEMS } from "@/config/navigation";
import { cn } from "@/lib/utils";

/**
 * Menu lateral do desktop.
 *
 * Escondido abaixo de `lg` — no celular a navegação é a barra inferior fixa.
 * O produto é mobile-first (exigência da cliente), então esta coluna é o
 * acréscimo para telas grandes, não o contrário.
 *
 * O estado ativo segue o mockup: caixa arredondada com borda ciano e brilho.
 */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação principal"
      className="hidden w-[104px] shrink-0 flex-col items-center gap-1 border-r border-border bg-sidebar py-6 lg:flex"
    >
      {SIDEBAR_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);

        const content = (
          <>
            <span className="[&>svg]:size-6" aria-hidden>
              {item.icon}
            </span>
            <span className="text-[0.65rem] leading-tight font-medium tracking-wide uppercase">
              {item.label}
            </span>
          </>
        );

        const shared =
          "group flex w-[84px] flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center transition-colors";

        /**
         * Tela que ainda não existe: aparece apagada e NÃO linka.
         *
         * O menu comunica o que o produto vai ser; sumir com metade dele daria
         * a impressão de um produto menor. Mas link que leva a 404 faz o aluno
         * concluir que a plataforma quebrou, e isso é pior que a espera.
         */
        if (item.soon) {
          return (
            <span
              key={item.href}
              aria-disabled="true"
              title="Em breve"
              className={cn(shared, "border border-transparent text-muted-foreground/40")}
            >
              {content}
            </span>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              shared,
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              active
                ? "border border-primary/60 bg-primary-soft text-primary glow-ring"
                : "border border-transparent text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
            )}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Um item está ativo na própria rota e nas rotas abaixo dela.
 *
 * `/questoes/123` mantém "Questões" aceso. Sem isso, entrar numa questão
 * apagaria o menu inteiro e o aluno perderia a referência de onde está.
 *
 * A exceção é a Home: `/inicio` só acende em `/inicio`, senão ela ficaria
 * acesa em tudo que começasse com essa string.
 */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/inicio") return pathname === "/inicio";
  return pathname === href || pathname.startsWith(`${href}/`);
}
