import { Flame, Trophy, User } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ProfileForm } from "@/components/account/account-forms";
import { CancelarAssinatura } from "@/components/account/cancel-subscription";
import { AchievementList } from "@/components/gamification/achievement-list";
import { SectionTitle, Surface } from "@/components/shared/surface";
import { APP_TIMEZONE } from "@/config/app";
import { LOGIN_ROUTE } from "@/config/routes";
import { getStudentContext } from "@/server/auth/current-user";
import { getMinhaAssinatura, type MinhaAssinatura } from "@/server/billing/cancel";
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

  const [progresso, conquistas, contato, assinatura] = await Promise.all([
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
    getMinhaAssinatura(context.user.id),
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

      {/*
        Seu plano, com o botão de cancelar (pedido da cliente em 11/09/2026:
        "pode incluir o botão 'Cancelar assinatura' no perfil do aluno").
      */}
      {assinatura ? (
        <Surface className="flex flex-col gap-3 p-5">
          <SectionTitle>Seu plano</SectionTitle>
          <SeuPlano assinatura={assinatura} />
        </Surface>
      ) : null}

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

/**
 * O plano do aluno e o que ele pode fazer com ele.
 *
 * ⚠️ SÓ ASSINATURA PAGA PELO MERCADO PAGO TEM BOTÃO DE CANCELAR. O Free não tem
 * o que cancelar, e um plano liberado pela equipe no painel não passa pelo
 * Mercado Pago — cancelar ali não pararia cobrança nenhuma, porque não há.
 */
function SeuPlano({ assinatura }: { assinatura: MinhaAssinatura }) {
  const data = assinatura.fimDoPeriodo ? formatarData(assinatura.fimDoPeriodo) : null;
  const periodo =
    assinatura.billingPeriod === "annual"
      ? "anual"
      : assinatura.billingPeriod === "monthly"
        ? "mensal"
        : null;

  if (!assinatura.paga) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-pretty text-sm text-muted-foreground">
          {assinatura.planCode === "free"
            ? "Você está no plano Gratuito."
            : `Você está no ${assinatura.planName}, liberado pela equipe.`}
        </p>
        {assinatura.planCode === "free" ? (
          <Link href="/planos" className="text-sm text-primary underline-offset-4 hover:underline">
            Ver os planos
          </Link>
        ) : null}
      </div>
    );
  }

  if (assinatura.cancelada) {
    return (
      <p className="text-pretty text-sm text-muted-foreground">
        Assinatura cancelada.{" "}
        {data
          ? `Você continua no ${assinatura.planName} até ${data}, e não haverá novas cobranças.`
          : "Não haverá novas cobranças."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-pretty text-sm text-muted-foreground">
        <span className="font-medium text-foreground">
          {assinatura.planName}
          {periodo ? ` ${periodo}` : ""}
        </span>
        {data ? ` · próxima cobrança em ${data}` : ""}
      </p>
      <CancelarAssinatura planName={assinatura.planName} acessoAte={data} />
    </div>
  );
}

function formatarData(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone: APP_TIMEZONE,
  }).format(data);
}

