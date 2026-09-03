"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * A tela de erro do painel.
 *
 * ⚠️ MOSTRA A MENSAGEM DO ERRO, ao contrário da tela do aluno.
 *
 * Quem está aqui é da equipe e vai me repassar o problema. Esconder o texto
 * transformaria cada falha numa ida ao log da Vercel, que expira. O aluno não
 * vê nada disto — a tela dele fica em `(app)/error.tsx` e mostra só o digest.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin] erro na tela", error.digest, error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-5 px-4 py-16 text-center">
      <AlertTriangle className="size-11 text-warning" aria-hidden />

      <h1 className="text-xl font-bold text-foreground">Esta tela do painel falhou</h1>

      <p className="text-pretty text-muted-foreground">
        Nenhum dado foi perdido. Tente de novo; se repetir, me mande o texto
        abaixo.
      </p>

      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={reset} size="lg">
          <RotateCcw aria-hidden />
          Tentar de novo
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/admin">Voltar ao painel</Link>
        </Button>
      </div>

      <pre className="w-full overflow-x-auto rounded-lg border border-border bg-card p-3 text-left text-xs text-muted-foreground">
        {error.message}
        {error.digest ? `\n\ndigest: ${error.digest}` : ""}
      </pre>
    </div>
  );
}
