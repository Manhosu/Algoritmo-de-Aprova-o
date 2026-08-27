import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { APP_NAME, APP_TAGLINE } from "@/config/app";

/**
 * Moldura das telas de autenticação.
 *
 * Coluna única, centralizada, sem navegação. Quem chega aqui tem uma tarefa
 * só — entrar ou criar conta — e qualquer link a mais é um convite a desistir
 * no meio.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-4 py-10">
      <Link
        href="/"
        aria-label={APP_NAME}
        className="rise rise-1 mb-8 transition-opacity hover:opacity-80"
      >
        <Logo width={228} mobileWidth={168} priority />
      </Link>

      {/*
        A moldura só posiciona. O vidro é do `Surface` de cada página — elas já
        trazem o próprio card, e empilhar um segundo aqui dobrava a borda e o
        respiro interno.
      */}
      <div className="rise rise-2 w-full max-w-md">{children}</div>

      <p className="rise rise-3 mt-8 max-w-sm text-center text-xs text-balance text-muted-foreground">
        {APP_TAGLINE}
      </p>
    </div>
  );
}
