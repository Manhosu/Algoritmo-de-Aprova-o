"use client";

import {
  Bell,
  CircleHelp,
  Flame,
  LogOut,
  MessageSquare,
  Settings,
  User,
} from "lucide-react";
import Link from "next/link";

import { Logo, LogoSymbol } from "@/components/brand/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { APP_TAGLINE } from "@/config/app";
import { cn } from "@/lib/utils";

/**
 * Cabeçalho da área do aluno.
 *
 * Segue o mockup: logo à esquerda, saudação e tagline no centro, e à direita o
 * sino, o streak com a chama e o avatar.
 *
 * DUAS CORREÇÕES SOBRE O MOCKUP, que são decisões fechadas:
 *   • "BOM DIA, CONCURSEIRO!" vira o NOME DO ALUNO;
 *   • abaixo dele aparece "Faltam X dias para a prova".
 *
 * No celular a saudação some e fica só o símbolo da marca — a tagline inteira
 * não cabe em 390px sem espremer os controles da direita, que são os que a
 * pessoa toca.
 */

export type AppHeaderProps = {
  userName: string | null;
  avatarUrl?: string | null;
  /** Frase pronta vinda de `examCountdown()`. Nulo esconde a linha. */
  countdownLabel?: string | null;
  streakDays?: number;
  unreadNotifications?: number;
};

export function AppHeader({
  userName,
  avatarUrl,
  countdownLabel,
  streakDays = 0,
  unreadNotifications = 0,
}: AppHeaderProps) {
  const firstName = userName?.trim().split(/\s+/)[0] ?? null;

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/75 backdrop-blur-xl after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-gradient-to-r after:from-transparent after:via-primary/35 after:to-transparent">
      <div className="flex h-16 items-center gap-3 px-4 sm:h-20 sm:gap-5 sm:px-6">
        <Link href="/inicio" className="shrink-0" aria-label="Ir para a Home">
          <Logo width={168} className="hidden sm:block" priority />
          <LogoSymbol size={36} className="sm:hidden" />
        </Link>

{/*
          As DUAS coisas que o README pede no topo da Home convivem aqui:
          o nome do aluno com a contagem regressiva (2.1) e a saudação da
          identidade visual.

          A versão anterior trocava uma pela outra — quando o aluno informava a
          data da prova, a frase da cliente sumia da tela. Era o texto que ela
          escreveu para ser a voz do produto, e ele desaparecia justamente para
          quem estava mais engajado.
        */}
        <div className="hidden min-w-0 flex-1 flex-col justify-center sm:flex">
          <p className="flex items-baseline gap-2 text-sm font-semibold tracking-wide text-foreground uppercase sm:text-base">
            <span className="truncate">{firstName ? `Olá, ${firstName}!` : "Olá!"}</span>
            {countdownLabel ? (
              <span className="shrink-0 text-xs font-medium normal-case text-primary">
                {countdownLabel}
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">{APP_TAGLINE}</p>
        </div>

        <div className="ml-auto flex items-center gap-1 sm:gap-3">
{/*
            O sino aparece porque está no mockup e comunica o que o produto vai
            ter — mas NÃO linka: a tela de notificações é do Marco 2. Um sino
            que leva a 404 faz o aluno concluir que a plataforma quebrou.
            Mesma regra do menu lateral e do menu do avatar.
          */}
          <span
            aria-label="Notificações (em breve)"
            title="Em breve"
            className="relative flex size-11 items-center justify-center rounded-full text-muted-foreground/40"
          >
            <Bell className="size-5" aria-hidden />
            {unreadNotifications > 0 ? (
              <span
                className="absolute top-2 right-2 flex size-4 items-center justify-center rounded-full bg-destructive text-[0.6rem] font-bold text-destructive-foreground"
                aria-hidden
              >
                {unreadNotifications > 9 ? "9+" : unreadNotifications}
              </span>
            ) : null}
          </span>

          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1.5",
              streakDays > 0 ? "text-warning" : "text-muted-foreground",
            )}
            aria-label={`Sequência de ${streakDays} ${streakDays === 1 ? "dia" : "dias"}`}
          >
            <Flame className="size-5" aria-hidden />
            <span className="text-metric text-sm">{streakDays}</span>
          </span>

          <AvatarMenu userName={userName} avatarUrl={avatarUrl} />
        </div>
      </div>
    </header>
  );
}

/** Os 6 itens exigidos pelo README 2.2, com o separador antes de Sair. */
function AvatarMenu({
  userName,
  avatarUrl,
}: {
  userName: string | null;
  avatarUrl?: string | null;
}) {
  const initials = (userName ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label="Abrir menu da conta"
      >
        <Avatar className="size-10 border-2 border-primary/60">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
          <AvatarFallback className="bg-secondary text-sm font-semibold text-foreground">
            {initials || <User className="size-4" aria-hidden />}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {/*
          Só "Configurações" existe hoje. Os outros quatro são do Marco 2 e
          ficam DESABILITADOS em vez de linkar para 404 — um item de menu que
          leva a "página não encontrada" faz o aluno concluir que a plataforma
          está quebrada, não que a tela ainda não chegou.

          ⚠️ Ao construir cada uma, troque o `disabled` por `asChild` + `Link`.
        */}
        <DropdownMenuItem disabled>
          <User aria-hidden />
          Meu Perfil
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/configuracoes">
            <Settings aria-hidden />
            Configurações
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Bell aria-hidden />
          Notificações
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <MessageSquare aria-hidden />
          Feedback &amp; Suporte
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <CircleHelp aria-hidden />
          Central de Ajuda
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild variant="destructive">
          <Link href="/sair" prefetch={false}>
            <LogOut aria-hidden />
            Sair
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
