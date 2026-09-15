import { Flame, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AchievementList } from "@/components/gamification/achievement-list";
import { EmptyState, Surface } from "@/components/shared/surface";
import { LOGIN_ROUTE } from "@/config/routes";
import { cn } from "@/lib/utils";
import { getStudentContext } from "@/server/auth/current-user";
import { listAchievements } from "@/server/engine/achievements";
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

type Params = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Quantos alunos aparecem antes do "ver mais".
 *
 * ⚠️ Dez, e não todos. A cliente perguntou o que acontece com mil alunos: com a
 * lista inteira, as Conquistas — que ficam abaixo — seriam empurradas para
 * fora de qualquer tela. Dez cabem numa dobra e o resto continua a um clique.
 */
const VISIVEIS = 10;

export default async function RankingPage({ searchParams }: Params) {
  const context = await getStudentContext();
  if (!context) redirect(LOGIN_ROUTE);

  const params = await searchParams;
  const verTodos = params.todos === "1";

  const [ranking, conquistas] = await Promise.all([
    getRanking({ userId: context.user.id, limit: verTodos ? 100 : VISIVEIS }),
    listAchievements(context.user.id),
  ]);

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
            {/*
              ⚠️ A CHAVE É O ÍNDICE, contra o conselho de sempre, e por dois
              motivos.

              Posição + XP + sequência NÃO é único: `rank()` dá a mesma posição a
              quem tem exatamente os mesmos números, de propósito, e dois alunos
              empatados produziam a mesma chave. O React reclamou em produção
              ("Encountered two children with the same key, 1-6610-30") e a
              segunda linha corria risco de ser omitida.

              O id do aluno resolveria e é justamente o que não pode ir: chave de
              React viaja no payload do servidor, e mandar o id de todo mundo
              nesta tela desfaria o anonimato que ela existe para manter.

              O índice é seguro aqui porque a lista é estática dentro de um
              render: ninguém insere, remove ou reordena no cliente.
            */}
            {ranking.top.map((linha, indice) => (
              <li key={indice}>
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

          {ranking.hasMore && !verTodos ? (
            <Link
              href="/ranking?todos=1"
              className="self-center rounded-lg border border-border px-4 py-2 text-sm text-primary transition-colors hover:border-primary/40"
            >
              Ver mais
            </Link>
          ) : null}
        </>
      )}

      {/*
        ⚠️ As conquistas ficam ANTES do resto da lista, não no fim da página.

        Elas respondem à mesma pergunta do ranking — como estou indo — e a
        cliente notou o risco: com muitos alunos, uma lista longa empurraria as
        conquistas para fora da tela e ninguém as veria. Por isso o ranking
        mostra dez e esconde o resto atrás de "ver mais".
      */}
      {conquistas.length > 0 ? <AchievementList conquistas={conquistas} /> : null}
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

      {/*
        ⚠️ "VOCÊ" GANHA DO NOME na própria linha, e o nível desce para a
        segunda.

        Ver o próprio nome no meio de uma lista não ajuda a se achar nela: o
        aluno já sabe como se chama. "Você" é o rótulo que o olho encontra.

        Para os outros, o primeiro nome vem primeiro e o nível fica embaixo.
        Quem desligou a exibição vira "Aluno" — a linha continua ali, com a
        posição e os números, porque escondê-la mudaria a colocação de todo
        mundo abaixo.
      */}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {linha.isMe ? "Você" : (linha.firstName ?? "Aluno")}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {linha.levelName}
        </span>
      </span>

      {/*
        Acerto ao lado da sequência (pedido da cliente). Some quando o aluno
        ainda não respondeu nada: "0%" diria que ele erra tudo, e o certo é que
        ele ainda não começou.
      */}
      {linha.accuracyPercent !== null ? (
        <span className="text-metric hidden shrink-0 text-xs text-muted-foreground sm:inline">
          {linha.accuracyPercent}%<span className="sr-only"> de acerto</span>
        </span>
      ) : null}

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
