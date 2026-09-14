import { Gamepad2, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState, Surface } from "@/components/shared/surface";
import { LOGIN_ROUTE } from "@/config/routes";
import { getStudentContext } from "@/server/auth/current-user";
import { listarJogosDoAluno } from "@/server/games/service";

export const metadata: Metadata = { title: "Jogos" };

export const dynamic = "force-dynamic";

/**
 * JOGOS — o botão do menu lateral (pedido da cliente em 14/09/2026).
 *
 * Os cartões vêm do painel. Jogo de um plano acima do do aluno aparece com o
 * cadeado e o nome do plano que libera: esconder faria o aluno nunca saber que
 * ele existe, que é o contrário do que um jogo bloqueado deveria fazer.
 */
export default async function JogosPage() {
  const context = await getStudentContext();
  if (!context) redirect(LOGIN_ROUTE);

  const jogos = await listarJogosDoAluno(context.user.id);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <Gamepad2 className="size-5 shrink-0 text-primary" aria-hidden />
          Jogos
        </h1>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          Aprenda jogando. Cada jogo abre aqui mesmo, e tem botão de tela cheia.
        </p>
      </header>

      {jogos.length === 0 ? (
        <Surface>
          <EmptyState
            icon={<Gamepad2 />}
            title="Os jogos estão chegando"
            description="Assim que o primeiro jogo for publicado, ele aparece aqui."
          />
        </Surface>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          {jogos.map((jogo) => {
            const conteudo = (
              <>
                <span className="flex aspect-video w-full items-center justify-center overflow-hidden bg-background">
                  {jogo.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={jogo.imageUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <Gamepad2 className="size-10 text-primary" aria-hidden />
                  )}
                </span>

                <span className="flex flex-col gap-1 p-4">
                  <span className="text-pretty font-semibold text-foreground">{jogo.title}</span>
                  {jogo.description ? (
                    <span className="text-sm text-pretty text-muted-foreground">
                      {jogo.description}
                    </span>
                  ) : null}
                  {jogo.liberado ? (
                    <span className="mt-1 text-sm font-medium text-primary">Jogar</span>
                  ) : (
                    <span className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Lock className="size-3.5" aria-hidden />
                      Disponível no plano {jogo.planoMinimo}
                    </span>
                  )}
                </span>
              </>
            );

            return (
              <li key={jogo.id}>
                <Link
                  href={jogo.liberado ? `/jogos/${jogo.id}` : "/planos"}
                  className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {conteudo}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
