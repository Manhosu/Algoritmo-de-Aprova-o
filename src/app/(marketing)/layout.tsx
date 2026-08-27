import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { APP_NAME, APP_TAGLINE, SUPPORT_EMAIL } from "@/config/app";

/**
 * Moldura das páginas públicas: landing, política de privacidade, termos.
 *
 * Sem menu lateral e sem barra inferior — quem está aqui ainda não é aluno.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
{/*
        Cabeçalho de vidro, em três âncoras: marca à esquerda, navegação ao
        centro, ações à direita.

        O centro é conquistado com `grid-cols-3`, não com `justify-between`:
        as três áreas têm larguras diferentes, e com `justify-between` o menu
        do meio se desloca conforme o tamanho dos botões da direita — fica
        "quase centralizado", que é pior do que assumidamente à esquerda.

        O fio de luz na base (o `after`) dá presença sem peso: em vez de uma
        borda cinza reta, uma linha que acende no meio e some nas pontas, como
        reflexo. É a diferença entre "tem uma borda ali" e "aquilo é uma
        superfície".
      */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-gradient-to-r after:from-transparent after:via-primary/40 after:to-transparent">
        <div className="mx-auto grid h-16 w-full max-w-6xl grid-cols-[auto_1fr_auto] items-center gap-4 px-4 sm:h-20 sm:px-6">
          <Link
            href="/"
            aria-label={APP_NAME}
            className="shrink-0 transition-opacity hover:opacity-80"
          >
            <Logo width={172} mobileWidth={124} priority />
          </Link>

          {/*
            Some no celular em vez de virar menu-sanduíche: são dois links, e
            um menu que esconde dois links atrás de um toque é cerimônia. Eles
            continuam alcançáveis pelo rodapé e pela própria página.
          */}
          <nav
            className="hidden items-center justify-center gap-8 lg:flex"
            aria-label="Seções do site"
          >
            <Link
              href="/#como-funciona"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Como funciona
            </Link>
            <Link
              href="/planos"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Planos
            </Link>
          </nav>

          <nav
            className="col-start-3 flex items-center gap-1 sm:gap-2"
            aria-label="Ações da conta"
          >
            <Button asChild variant="ghost" size="sm">
              <Link href="/entrar">Entrar</Link>
            </Button>
            {/* O CTA primário é o único elemento com brilho no cabeçalho. */}
            <Button asChild size="sm" className="glow-ring">
              <Link href="/cadastrar">Criar conta</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/*
        Rodapé em três colunas de larguras diferentes, não uma linha de links
        soltos. E com contato REAL: rodapé com endereço de exemplo é pior que
        rodapé sem contato — quem escreve e não recebe resposta conclui que a
        empresa não existe.

        ⚠️ O CTA fixo do celular ocupa a base da tela. O `pb` extra em telas
        pequenas evita que ele cubra a última linha do rodapé.
      */}
      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-4 pt-12 pb-28 sm:px-6 sm:pb-12">
          <div className="grid gap-8 sm:grid-cols-12">
            <div className="sm:col-span-6">
              <Logo width={152} mobileWidth={132} />
              <p className="mt-4 max-w-xs text-sm text-pretty text-muted-foreground">
                {APP_TAGLINE}
              </p>
            </div>

            <nav className="sm:col-span-3" aria-label="Produto">
              <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-foreground uppercase">
                Produto
              </p>
              <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/planos" className="transition-colors hover:text-foreground">
                    Planos
                  </Link>
                </li>
                <li>
                  <Link href="/entrar" className="transition-colors hover:text-foreground">
                    Entrar
                  </Link>
                </li>
                <li>
                  <Link href="/cadastrar" className="transition-colors hover:text-foreground">
                    Criar conta
                  </Link>
                </li>
              </ul>
            </nav>

            <div className="sm:col-span-3">
              <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-foreground uppercase">
                Suporte e jurídico
              </p>
              <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
                <li>
                  <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="break-all transition-colors hover:text-foreground"
                  >
                    {SUPPORT_EMAIL}
                  </a>
                </li>
                <li>
                  <Link
                    href="/politica-de-privacidade"
                    className="transition-colors hover:text-foreground"
                  >
                    Política de Privacidade
                  </Link>
                </li>
                <li>
                  <Link
                    href="/termos-de-uso"
                    className="transition-colors hover:text-foreground"
                  >
                    Termos de Uso
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <p className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
            © {new Date().getFullYear()} {APP_NAME}
          </p>
        </div>
      </footer>
    </div>
  );
}
