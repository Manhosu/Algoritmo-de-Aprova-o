import { Flame, Trophy, User } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ProfileForm } from "@/components/account/account-forms";
import { AchievementList } from "@/components/gamification/achievement-list";
import { SectionTitle, Surface } from "@/components/shared/surface";
import { LOGIN_ROUTE } from "@/config/routes";
import { getStudentContext } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { listAchievements } from "@/server/engine/achievements";
import { getLevel } from "@/server/engine/progress";

export const metadata: Metadata = {
  title: "Meu Perfil",
  description: "Seu nível, sua sequência e o que você já conquistou.",
};

/**
 * MEU PERFIL — item 6 do aceite ("menu do avatar tem os 6 itens corretos").
 *
 * ⚠️ NÃO REPETE CONFIGURAÇÕES. Trocar senha, trocar e-mail e excluir conta
 * moram lá, e duplicar um botão de exclusão de conta em duas telas é o tipo de
 * coisa que faz alguém clicar sem procurar.
 *
 * Aqui é o retrato: quem você é na plataforma, onde chegou e o que falta para o
 * próximo nível. Os dados já existiam todos; o que não existia era a tela.
 */
export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const context = await getStudentContext();
  if (!context) redirect(LOGIN_ROUTE);

  const [progresso, conquistas, contato] = await Promise.all([
    getLevel(context.gamification.totalXp),
    listAchievements(context.user.id),
    /*
      O WhatsApp é buscado AQUI, e não carregado na sessão.

      A sessão é lida em toda requisição da aplicação; guardar um telefone nela
      espalharia PII por todo lugar que só precisa saber quem está logado. Uma
      consulta nesta tela, que é a única que edita o dado, é mais barata e mais
      contida.
    */
    db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, context.user.id),
      columns: { whatsapp: true },
    }),
  ]);

  const desbloqueadas = conquistas.filter((c) => c.unlockedAt).length;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <User className="size-5 shrink-0 text-primary" aria-hidden />
          Meu Perfil
        </h1>
        <p className="mt-2 text-pretty text-sm text-muted-foreground">
          {/* `name` é anulável: a anonimização da LGPD o apaga e a conta continua. */}
          {context.user.name ?? "Sua conta"}
          {context.user.email ? ` · ${context.user.email}` : ""}
        </p>
      </header>

      <Surface glow className="flex flex-col gap-3 p-5">
        <div className="flex items-baseline gap-3">
          <span className="text-2xl" aria-hidden>
            {progresso.current.emoji ?? "🌱"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-eyebrow">Nível {progresso.current.levelNumber}</p>
            <p className="text-lg font-bold text-foreground">
              {progresso.current.name}
            </p>
          </div>
          <span className="text-metric shrink-0 text-xl text-primary">
            {context.gamification.totalXp}
            <span className="ml-1 text-sm text-muted-foreground">XP</span>
          </span>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-background" role="presentation">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${progresso.percentToNext}%` }}
          />
        </div>

        <p className="text-pretty text-sm text-muted-foreground">
          {progresso.next
            ? `Faltam ${progresso.xpToNextLevel} XP para ${progresso.next.name}.`
            : "Você chegou ao último nível."}
        </p>
      </Surface>

      <div className="grid grid-cols-2 gap-3">
        <Surface className="flex flex-col gap-1 p-4">
          <span className="flex items-center gap-1.5 text-xs tracking-wider text-muted-foreground uppercase">
            <Flame className="size-3.5" aria-hidden />
            Sequência
          </span>
          <span className="text-metric text-xl text-foreground">
            {context.gamification.currentStreak}
            <span className="ml-1 text-sm text-muted-foreground">dias</span>
          </span>
          <span className="text-xs text-muted-foreground">
            Recorde: {context.gamification?.longestStreak ?? 0}
          </span>
        </Surface>

        <Surface className="flex flex-col gap-1 p-4">
          <span className="flex items-center gap-1.5 text-xs tracking-wider text-muted-foreground uppercase">
            <Trophy className="size-3.5" aria-hidden />
            Conquistas
          </span>
          <span className="text-metric text-xl text-foreground">
            {desbloqueadas}
            <span className="ml-1 text-sm text-muted-foreground">
              de {conquistas.length}
            </span>
          </span>
          <Link
            href="/ranking"
            className="text-xs text-primary underline-offset-4 hover:underline"
          >
            Ver o ranking
          </Link>
        </Surface>
      </div>

      {conquistas.length > 0 ? <AchievementList conquistas={conquistas} /> : null}

      {/*
        Editar nome e WhatsApp (pedido da cliente em 08/09/2026): "no Meu Perfil
        poderia ter a opção de editar nome e telefone".

        ⚠️ FICA AQUI, e não em Configurações, porque é o que ela pediu e porque
        é onde faz sentido: Configurações é onde se mexe em ACESSO — senha,
        e-mail, exclusão. Nome e telefone são o retrato, e o retrato é esta tela.
      */}
      <Surface className="flex flex-col gap-4 p-5">
        <SectionTitle>Meus dados</SectionTitle>
        <ProfileForm name={context.user.name} whatsapp={contato?.whatsapp ?? null} />
      </Surface>

      <Surface className="flex flex-col gap-2 p-5">
        <SectionTitle>Sua conta</SectionTitle>
        <p className="text-pretty text-sm text-muted-foreground">
          Trocar senha, trocar e-mail e excluir a conta ficam em Configurações.
        </p>
        <Link
          href="/configuracoes"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Ir para Configurações
        </Link>
      </Surface>
    </div>
  );
}
