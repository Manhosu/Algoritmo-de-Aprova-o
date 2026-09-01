import { Flame, Trophy } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EmptyState, Surface } from "@/components/shared/surface";
import { LOGIN_ROUTE } from "@/config/routes";
import { cn } from "@/lib/utils";
import { getStudentContext } from "@/server/auth/current-user";
import { getRanking, type RankingRow } from "@/server/engine/ranking";

export const metadata: Metadata = {
  title: "Ranking",
  description: "Onde você está entre os alunos, por XP e por constância.",
};

/**
 * RANKING (README 2.4) — comparativo entre alunos por XP e consistência.
 *
 * ⚠️ NINGUÉM APARECE COM NOME. A Política de Privacidade aceita no cadastro não
 * prevê exibir o nome de um aluno para outro, e sob a LGPD isso não se resolve
 * com um aviso depois. A leitura em `server/engine/ranking.ts` explica o
 * caminho para mudar isso, se a cliente quiser.
 */
export const dynamic = "force-dynamic";

export default async function RankingPage() {
  const context = await getStudentContext();
  if (!context) redirect(LOGIN_ROUTE);

  const ranking = await getRanking({ userId: context.user.id });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <Trophy className="size-5 shrink-0 text-primary" aria-hidden />
          Ranking
        </h1>
        <p className="mt-2 text-pretty text-sm text-muted-foreground">
          {ranking.totalStudents === 0
            ? "A comparação começa quando houver alunos estudando."
            : `Você entre ${ranking.totalStudents} ${
                ranking.totalStudents === 1 ? "aluno" : "alunos"
              }, por XP acumulado e dias seguidos de estudo.`}
        </p>
      </header>

      {ranking.top.length === 0 ? (
        <EmptyState
          title="Ninguém pontuou ainda"
          description="Conclua um estudo, responda questões ou faça uma revisão para entrar no ranking."
        />
      ) : (
        <>
          <ol className="flex flex-col gap-2">
            {ranking.top.map((linha) => (
              <li key={`${linha.position}-${linha.totalXp}-${linha.currentStreak}`}>
                <Row linha={linha} />
              </li>
            ))}
          </ol>

          {ranking.me ? (
            <>
              <p className="text-center text-xs text-muted-foreground">⋯</p>
              <Row linha={ranking.me} />
            </>
          ) : null}
        </>
      )}

      <p className="text-pretty text-xs text-muted-foreground">
        Os outros alunos aparecem sem nome. O ranking existe para você se
        comparar, não para saber quem é quem.
      </p>
    </div>
  );
}

function Row({ linha }: { linha: RankingRow }) {
  return (
    <Surface
      className={cn(
        "flex items-center gap-3 p-3",
        // Sem o destaque, achar a própria linha numa lista de vinte números
        // iguais exige ler item por item.
        linha.isMe && "border-primary/50 bg-primary/5",
      )}
    >
      <span
        className={cn(
          "text-metric w-8 shrink-0 text-center text-sm",
          linha.position <= 3 ? "text-primary" : "text-muted-foreground",
        )}
      >
        {linha.position}º
      </span>

      <span className="shrink-0 text-lg" aria-hidden>
        {linha.levelEmoji}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {linha.isMe ? "Você" : linha.levelName}
        </span>
        {linha.isMe ? (
          <span className="block truncate text-xs text-muted-foreground">
            {linha.levelName}
          </span>
        ) : null}
      </span>

      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <Flame className="size-3.5" aria-hidden />
        <span className="text-metric">{linha.currentStreak}</span>
        <span className="sr-only">dias seguidos</span>
      </span>

      <span className="text-metric w-16 shrink-0 text-right text-sm text-foreground">
        {linha.totalXp}
        <span className="ml-1 text-xs text-muted-foreground">XP</span>
      </span>
    </Surface>
  );
}
