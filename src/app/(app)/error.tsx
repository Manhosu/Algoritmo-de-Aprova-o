"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * A TELA DE ERRO DA ÁREA DO ALUNO.
 * ============================================================================
 *
 * ⚠️ NÃO EXISTIA, e é por isso que a cliente viu a tela crua do Next.
 *
 * Sem `error.tsx`, qualquer exceção num Server Component derruba a rota para a
 * página padrão do framework: fundo branco, "Application error: a server-side
 * exception has occurred", e um Digest hexadecimal. Para quem está estudando,
 * isso não diz o que fazer nem que a conta está a salvo.
 *
 * ⚠️ ISTO É REDE, NÃO CONSERTO.
 *
 * A causa específica que ela encontrou (a assinatura da URL do material) foi
 * corrigida na origem. Esta tela existe para a PRÓXIMA falha, que vai existir:
 * o Supabase fica instável, uma consulta estoura o tempo, um dado chega num
 * formato que ninguém previu. Em todos esses casos o aluno precisa de um botão
 * de tentar de novo, não de um Digest.
 *
 * ⚠️ E NÃO MOSTRA A MENSAGEM DO ERRO.
 *
 * Texto de exceção carrega nome de tabela, coluna e às vezes trecho de consulta.
 * O `digest` é o que liga a tela ao log do servidor, e é seguro de exibir.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    /*
      O log do navegador é o único lugar onde este erro aparece para quem está
      olhando a tela. No servidor ele já foi registrado pela Vercel.
    */
    console.error("[app] erro na tela", error.digest, error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5 px-4 py-16 text-center">
      <AlertTriangle className="size-11 text-warning" aria-hidden />

      <h1 className="text-xl font-bold text-foreground">Algo falhou nesta tela</h1>

      <p className="text-pretty text-muted-foreground">
        Seu progresso está salvo. Isso costuma ser instabilidade passageira:
        tentar de novo resolve na maioria das vezes.
      </p>

      <div className="flex flex-wrap justify-center gap-2">
        {/*
          `reset` refaz a renderização do trecho que quebrou, sem recarregar a
          página inteira nem perder a navegação. É o primeiro botão porque é o
          que resolve o caso comum.
        */}
        <Button onClick={reset} size="lg">
          <RotateCcw aria-hidden />
          Tentar de novo
        </Button>

        <Button asChild size="lg" variant="outline">
          <Link href="/inicio">Ir para a Home</Link>
        </Button>
      </div>

      {error.digest ? (
        <p className="text-xs text-muted-foreground">
          Se acontecer de novo, mande este código para o suporte:{" "}
          <span className="text-metric">{error.digest}</span>
        </p>
      ) : null}
    </div>
  );
}
