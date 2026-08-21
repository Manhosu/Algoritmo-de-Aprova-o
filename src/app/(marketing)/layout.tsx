import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/config/app";

/**
 * Moldura das páginas públicas: landing, política de privacidade, termos.
 *
 * Sem menu lateral e sem barra inferior — quem está aqui ainda não é aluno.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:h-20 sm:px-6">
          <Link href="/" aria-label={APP_NAME}>
            <Logo width={172} priority />
          </Link>

          <nav className="ml-auto flex items-center gap-2 sm:gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link href="/entrar">Entrar</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/cadastrar">Criar conta</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} {APP_NAME}</p>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/politica-de-privacidade" className="hover:text-foreground">
              Política de Privacidade
            </Link>
            <Link href="/termos-de-uso" className="hover:text-foreground">
              Termos de Uso
            </Link>
            <Link href="/planos" className="hover:text-foreground">
              Planos
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
