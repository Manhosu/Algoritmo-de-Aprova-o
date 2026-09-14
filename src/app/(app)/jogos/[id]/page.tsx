import { ArrowLeft, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { GameFrame } from "@/components/games/game-frame";
import { Surface } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import { LOGIN_ROUTE } from "@/config/routes";
import { getStudentContext } from "@/server/auth/current-user";
import { obterJogoParaJogar } from "@/server/games/service";

export const metadata: Metadata = { title: "Jogo" };

export const dynamic = "force-dynamic";

/** Um jogo, aberto dentro do site. O plano é conferido no servidor. */
export default async function JogoPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getStudentContext();
  if (!context) redirect(LOGIN_ROUTE);

  const { id } = await params;
  const resultado = await obterJogoParaJogar(context.user.id, id);

  if (!resultado.ok && resultado.motivo === "nao_encontrado") notFound();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 py-4">
      <Link
        href="/jogos"
        className="flex items-center gap-1.5 self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Voltar aos jogos
      </Link>

      {resultado.ok ? (
        <>
          <header>
            <h1 className="text-xl font-bold text-pretty text-foreground">{resultado.jogo.title}</h1>
            {resultado.jogo.description ? (
              <p className="mt-1 text-sm text-pretty text-muted-foreground">
                {resultado.jogo.description}
              </p>
            ) : null}
          </header>

          <GameFrame src={resultado.jogo.gameUrl} title={resultado.jogo.title} />
        </>
      ) : (
        <Surface className="flex flex-col items-start gap-3 p-5">
          <p className="flex items-center gap-2 font-semibold text-foreground">
            <Lock className="size-4 text-primary" aria-hidden />
            {resultado.motivo === "plano" ? resultado.title : "Jogo"}
          </p>
          <p className="text-sm text-pretty text-muted-foreground">
            Este jogo faz parte do plano{" "}
            {resultado.motivo === "plano" ? resultado.planoMinimo : ""}.
          </p>
          <Button asChild>
            <Link href="/planos">Ver os planos</Link>
          </Button>
        </Surface>
      )}
    </div>
  );
}
