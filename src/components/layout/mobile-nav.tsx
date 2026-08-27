"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { SIDEBAR_ITEMS } from "@/config/navigation";
import { cn } from "@/lib/utils";

import { isActive } from "./sidebar";

/**
 * O menu lateral, alcançável no celular.
 *
 * POR QUE ELE EXISTE
 * ----------------------------------------------------------------------------
 * A coluna da esquerda é `lg:flex`. Em telas menores, Questões, Revisões e
 * Cronograma ficavam acessíveis apenas pela barra inferior — que não tem esses
 * itens, porque a barra segue o mockup (Home, Trilhas, +, Ranking, Loja).
 *
 * O aluno de celular, que é a maioria destes candidatos, não tinha como chegar
 * às três telas centrais do produto a não ser digitando a URL. A cliente
 * apontou isso no primeiro teste.
 *
 * ⚠️ Só aparece abaixo de `lg`. No desktop a coluna já está na tela, e um
 * segundo caminho para o mesmo lugar só ocupa espaço.
 */
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  /*
   * Fecha ao navegar, comparando a rota em vez de chamar `setOpen` num efeito.
   *
   * `useEffect(() => setOpen(false), [pathname])` faz o painel renderizar
   * aberto na tela nova e sumir logo depois — um piscar visível, e o React
   * avisa que é cascata de render. Guardando a rota de quando abriu, o painel
   * simplesmente não abre na rota seguinte.
   */
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const visible = open && openedAt === pathname;

  /*
   * `document.body` não existe no servidor, então o portal só pode montar no
   * cliente. `useSyncExternalStore` responde `false` na renderização do
   * servidor e `true` no cliente sem precisar de efeito — que aqui o React
   * acusa como cascata de render.
   */
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Enquanto o painel está aberto, o fundo não rola junto.
  useEffect(() => {
    if (!visible) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [visible]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setOpenedAt(pathname);
        }}
        aria-label="Abrir menu"
        aria-expanded={visible}
        className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      {/*
        ⚠️ O PAINEL SAI POR PORTAL, DIRETO NO `<body>`.
        
        Ele vive dentro do `<header>`, que tem `backdrop-filter`. E
        `backdrop-filter` cria bloco de contenção para `position: fixed`: em
        vez de cobrir a tela, o painel ficava preso aos 64px de altura do
        cabeçalho, com os itens vazando por cima do conteúdo.
        
        Levar o painel para o body devolve o `fixed` à viewport. O botão que
        abre continua no cabeçalho, onde deve estar.
      */}
      {visible && mounted
        ? createPortal(
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Tocar fora fecha: é o gesto que a pessoa tenta primeiro. */}
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          />

          <nav
            // ⚠️ Rótulo diferente do da coluna do desktop: dois `nav` com o
            // mesmo nome deixam o leitor de tela anunciar "Navegação principal"
            // duas vezes, sem dizer qual é qual.
            aria-label="Menu de navegação"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-card shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-4">
              <span className="text-sm font-semibold tracking-[0.12em] text-foreground uppercase">
                Menu
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>

            <ul className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
              {SIDEBAR_ITEMS.map((item) => {
                const active = isActive(pathname, item.href);

                /*
                 * Item do Marco 2 aparece apagado e SEM link, igual à coluna do
                 * desktop. Some do menu seria pior: o aluno não saberia que
                 * aquilo existe e está por vir.
                 */
                if (item.soon) {
                  return (
                    <li key={item.href}>
                      <span
                        title="Em breve"
                        className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-muted-foreground/40"
                      >
                        <span className="[&>svg]:size-5" aria-hidden>
                          {item.icon}
                        </span>
                        {item.label}
                        <span className="ml-auto text-[0.6rem] tracking-wider uppercase">
                          em breve
                        </span>
                      </span>
                    </li>
                  );
                }

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors",
                        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        active
                          ? "bg-primary-soft text-primary"
                          : "text-foreground hover:bg-accent/40",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className="[&>svg]:size-5" aria-hidden>
                        {item.icon}
                      </span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="border-t border-border p-3">
              <Link
                href="/configuracoes"
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
              >
                Configurações
              </Link>
            </div>
          </nav>
        </div>,
            document.body,
          )
        : null}
    </>
  );
}
