import { Gamepad2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ExcluirJogo, GameForm } from "@/components/admin/game-form";
import { requireAdmin } from "@/server/auth/guards";
import { listarJogosParaOPainel, listarPlanosParaJogos } from "@/server/games/service";

export const metadata: Metadata = { title: "Jogos" };

export const dynamic = "force-dynamic";

/**
 * Os jogos que a cliente cria no Lovable e publica aqui (pedido de 14/09/2026).
 *
 * Editar é pelo mesmo formulário: `?editar=<id>` o preenche com o jogo.
 */
export default async function AdminJogosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const editar = typeof params.editar === "string" ? params.editar : null;

  const [jogos, planos] = await Promise.all([listarJogosParaOPainel(), listarPlanosParaJogos()]);
  const emEdicao = editar ? (jogos.find((jogo) => jogo.id === editar) ?? null) : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <header>
        <p className="text-eyebrow">Administração</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Jogos</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          Os jogos que aparecem no botão Jogos do menu do aluno. Cada um abre
          dentro do site, numa janela com botão de tela cheia.
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">
          {emEdicao ? `Editando “${emEdicao.title}”` : "Cadastrar jogo"}
        </h2>
        <GameForm
          planos={planos}
          jogo={
            emEdicao
              ? {
                  id: emEdicao.id,
                  title: emEdicao.title,
                  description: emEdicao.description,
                  gameUrl: emEdicao.gameUrl,
                  imageStoragePath: emEdicao.imageStoragePath,
                  minPlanId: emEdicao.minPlanId,
                  isPublished: emEdicao.isPublished,
                }
              : null
          }
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-foreground">Jogos cadastrados</h2>

        {jogos.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            Nenhum jogo ainda.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {jogos.map((jogo) => (
              <li
                key={jogo.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm"
              >
                <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background">
                  {jogo.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={jogo.imageUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <Gamepad2 className="size-6 text-primary" aria-hidden />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-pretty font-medium text-foreground">{jogo.title}</span>
                  <span className="block text-xs text-pretty text-muted-foreground">
                    {jogo.minPlanName ? `Plano ${jogo.minPlanName} ou acima` : "Todos os planos"} ·{" "}
                    {jogo.isPublished ? "visível" : "oculto"}
                  </span>
                </span>

                <span className="flex shrink-0 flex-wrap items-center gap-1">
                  <Link
                    href={`/admin/jogos?editar=${jogo.id}`}
                    className="rounded-md px-3 py-1.5 text-sm text-primary underline-offset-4 hover:underline"
                  >
                    Editar
                  </Link>
                  <ExcluirJogo id={jogo.id} title={jogo.title} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
