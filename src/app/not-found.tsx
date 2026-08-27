import { ArrowLeft, Compass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/config/app";

export const metadata: Metadata = {
  title: "Página não encontrada",
  // Uma 404 indexada compete com as páginas reais nos resultados de busca.
  robots: { index: false, follow: true },
};

/**
 * 404.
 *
 * ⚠️ Existe porque o produto TINHA links quebrados de verdade — `/planos` e
 * `/termos-de-uso` —, e sem esta página o aluno via a tela padrão do Next: um
 * texto em inglês, sem marca e sem saída. Os dois links foram corrigidos, mas
 * link quebrado é o tipo de coisa que volta, e a rede de segurança precisa
 * existir antes de ser necessária.
 *
 * Oferece caminhos, não desculpas: quem cai aqui quer chegar em algum lugar.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-4 py-16">
      <Link href="/" aria-label={APP_NAME} className="rise rise-1 mb-10">
        <Logo width={200} mobileWidth={156} priority />
      </Link>

      <div className="rise rise-2 glass-panel w-full max-w-md p-8 text-center">
        <span
          className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl border border-primary/40 bg-primary-soft text-primary"
          aria-hidden
        >
          <Compass className="size-7" />
        </span>

        <p className="text-metric text-sm tracking-[0.2em] text-muted-foreground">404</p>

        <h1 className="mt-2 text-2xl font-bold tracking-tight text-balance text-foreground sm:text-3xl">
          Essa página não existe
        </h1>

        <p className="mt-3 text-pretty text-muted-foreground">
          O endereço pode ter mudado, ou o link que te trouxe até aqui está
          desatualizado. Nada do seu estudo foi afetado.
        </p>

        <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Button asChild size="lg">
            <Link href="/inicio">
              <ArrowLeft aria-hidden />
              Ir para a minha Home
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/">Conhecer a plataforma</Link>
          </Button>
        </div>

        {/*
          "Home" leva a `/inicio`, que redireciona quem não tem sessão para o
          login. Um botão só resolve os dois casos, e quem está logado cai
          direto onde quer.
        */}
      </div>
    </main>
  );
}
