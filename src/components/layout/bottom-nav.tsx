"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BOTTOM_NAV_ITEMS } from "@/config/navigation";
import { cn } from "@/lib/utils";

import { isActive } from "./sidebar";

/**
 * Barra de navegação inferior.
 *
 * ⚠️ FIXA. É requisito explícito do README 2.2 e item 5 do checklist de aceite:
 * "a barra inferior é FIXA — permanece sempre visível conforme a tela rola".
 *
 * Duas coisas que fazem uma barra fixa funcionar de verdade no celular e que
 * costumam faltar:
 *
 *   • `pb-safe` — respeita a área do gesto de home do iPhone. Sem isso, o
 *     último item fica embaixo da barrinha do sistema e não dá para tocar.
 *
 *   • O conteúdo da página reserva a altura dela (`pb-bottom-nav` no shell).
 *     Sem isso, o último bloco de qualquer tela fica escondido atrás da barra —
 *     e o aluno nunca descobre que existe algo ali.
 *
 * O "+" é o botão central elevado que inicia uma preparação (README 1.4).
 */
export function BottomNav() {
  const pathname = usePathname();

  const left = BOTTOM_NAV_ITEMS.slice(0, 2);
  const right = BOTTOM_NAV_ITEMS.slice(2);

  return (
    <nav
      aria-label="Navegação rápida"
      className={cn(
        // ⚠️ Sem `lg:hidden`: a cliente pediu a barra fixa também no
        // desktop. O botão "+" de nova preparação vive aqui, e escondê-lo em
        // tela grande obrigava a passar por Minhas preparações.
        "fixed inset-x-0 bottom-0 z-40",
        "border-t border-border/60 bg-card/80 backdrop-blur-xl",
        "pb-safe",
      )}
    >
      <ul className="mx-auto flex h-[var(--spacing-bottom-nav)] max-w-lg items-center justify-around">
        {left.map((item) => (
          <NavCell key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}

        <li className="relative -mt-8 flex w-16 justify-center">
          <Link
            href="/preparacoes/nova"
            aria-label="Criar nova preparação"
            className={cn(
              "flex size-14 items-center justify-center rounded-full",
              "border-2 border-primary bg-card text-primary",
              "glow-ring-strong transition-transform active:scale-95",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "focus-visible:ring-offset-background focus-visible:outline-none",
            )}
          >
            <Plus className="size-7" aria-hidden />
          </Link>
        </li>

        {right.map((item) => (
          <NavCell key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}
      </ul>
    </nav>
  );
}

function NavCell({
  item,
  active,
}: {
  item: (typeof BOTTOM_NAV_ITEMS)[number];
  active: boolean;
}) {
  const content = (
    <>
      <span className="[&>svg]:size-5" aria-hidden>
        {item.icon}
      </span>
      <span className="text-[0.65rem] leading-none font-medium tracking-wide uppercase">
        {item.label}
      </span>
    </>
  );

  // 44px de altura mínima: alvo de toque confortável.
  const shared =
    "flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 transition-colors";

  return (
    <li className="flex-1">
      {item.soon ? (
        /* Tela do Marco 2: aparece apagada e não linka. Ver a nota em
           `config/navigation`. */
        <span aria-disabled="true" className={cn(shared, "text-muted-foreground/40")}>
          {content}
        </span>
      ) : (
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            shared,
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            active ? "text-primary" : "text-muted-foreground",
          )}
        >
          {content}
        </Link>
      )}
    </li>
  );
}
