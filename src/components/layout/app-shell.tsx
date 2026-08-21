import type { ReactNode } from "react";

import { AppHeader, type AppHeaderProps } from "./app-header";
import { BottomNav } from "./bottom-nav";
import { Sidebar } from "./sidebar";

/**
 * Moldura da área do aluno: cabeçalho, menu lateral e barra inferior.
 *
 * `pb-bottom-nav` no conteúdo é o que impede o último bloco de qualquer tela de
 * ficar escondido atrás da barra fixa — o tipo de bug que não aparece em
 * desenvolvimento, porque a tela do desenvolvedor é grande e a página raramente
 * chega a rolar até o fim.
 */
export function AppShell({
  children,
  ...headerProps
}: AppHeaderProps & { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader {...headerProps} />

      <div className="flex flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 pb-bottom-nav lg:pb-6">
          <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-6">{children}</div>
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
