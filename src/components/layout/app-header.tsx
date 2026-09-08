"use client";

import {
  CircleHelp,
  CreditCard,
  Flame,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Settings,
  User,
} from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { MobileNav } from "./mobile-nav";
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

import { Pomodoro } from "./pomodoro";
import { ThemeToggle } from "./theme-toggle";

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
  /**
   * Verdadeiro quando quem está olhando é da equipe.
   *
   * ⚠️ Só controla a EXIBIÇÃO do atalho de volta ao painel. Quem barra o acesso
   * a `/admin` é o `proxy.ts` e o `requireAdmin` de cada página — esconder o
   * link não protege nada, e mostrá-lo por engano não daria acesso a ninguém.
   */
  isAdmin?: boolean;
};

export function AppHeader({
  userName,
  avatarUrl,
  countdownLabel,
  streakDays = 0,
  isAdmin = false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- volta com a tela de notificações (Marco 2)
  unreadNotifications = 0,
}: AppHeaderProps) {
  const firstName = userName?.trim().split(/\s+/)[0] ?? null;

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/75 backdrop-blur-xl after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-gradient-to-r after:from-transparent after:via-primary/35 after:to-transparent">
      <div className="flex h-16 items-center gap-3 px-4 sm:h-20 sm:gap-5 sm:px-6">
        {/*
          O menu que dá acesso ao lado esquerdo no celular.
          
          A coluna lateral é `lg:flex`, então em telas menores Questões,
          Revisões e Cronograma ficavam alcançáveis só pela barra inferior —
          que não tem esses itens. O aluno de celular não tinha como chegar
          neles a não ser pela URL.
        */}
        <MobileNav />

        <Link href="/inicio" className="shrink-0" aria-label="Ir para a Home">
          {/*
            ⚠️ A ASSINATURA COMPLETA TAMBÉM NO CELULAR (pedido da cliente).
            Antes só o símbolo aparecia em telas pequenas, e ela não reconhecia
            a marca dela na própria plataforma. `mobileWidth` deixa a assinatura
            legível sem tomar a largura toda.
          */}
          <Logo width={168} mobileWidth={132} priority />
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
            ⚠️ O SINO SAIU (pedido da cliente em 27/08/2026).
            
            Ele estava no mockup e ficava apagado, sem link, porque a tela de
            notificações é do Marco 2. Só que um ícone morto no cabeçalho não
            comunica "vem depois": comunica que alguma coisa não funciona. Ele
            volta junto com a tela.
          */}
          {/*
            Pomodoro (pedido da cliente em 02/09/2026): "um cronômetro de tempo
            na barra superior, com a função pomodoro".

            Fica antes da sequência porque é um CONTROLE, e controle vem antes
            de indicador: o dedo procura o que dá para tocar.
          */}
          <Pomodoro />

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

          <AvatarMenu userName={userName} avatarUrl={avatarUrl} isAdmin={isAdmin} />
        </div>
      </div>
    </header>
  );
}

/** Os 6 itens exigidos pelo README 2.2, com o separador antes de Sair. */
function AvatarMenu({
  userName,
  avatarUrl,
  isAdmin,
}: {
  userName: string | null;
  avatarUrl?: string | null;
  isAdmin: boolean;
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
        className="neon-hover rounded-full transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label="Abrir menu da conta"
      >
        <Avatar className="size-10 border-2 border-primary/60">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
          <AvatarFallback className="bg-secondary text-sm font-semibold text-foreground">
            {initials || <User className="size-4" aria-hidden />}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      {/*
        ⚠️ LARGURA COM TETO NA TELA, e não fixa.

        `w-56` são 238px com a fonte base de 106,25%. Num aparelho estreito isso
        cobre quase a tela inteira: a cliente mandou uma captura em que o menu
        ocupava tudo à direita e sobrava uma faixa de uns 90px do conteúdo.

        O `max-w` deixa a folga de uma margem de cada lado, então o menu encolhe
        junto com a tela em vez de dominá-la.
      */}
      <DropdownMenuContent
        align="end"
        className="w-56 max-w-[calc(100vw-2rem)]"
      >
        {/*
          Os quatro existem. Ficaram DESABILITADOS enquanto as telas não
          chegavam, porque um item de menu que leva a "página não encontrada" faz
          o aluno concluir que a plataforma está quebrada, não que a tela ainda
          não veio.
        */}
        {/*
          ⚠️ A VOLTA AO PAINEL — pergunta da cliente em 02/09/2026: "depois que
          entro na Área de Estudo, como faço para retornar ao Painel? É
          necessário fazer logout?"

          Era, e a resposta certa é que não deveria ser. O caminho de ida existia
          (o link "Área de estudo" na navegação do painel) e o de volta, não.
          Fica no topo do menu porque, para quem é da equipe, é o item mais
          usado de todos.
        */}
        {isAdmin ? (
          <>
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <LayoutDashboard aria-hidden />
                Voltar ao Painel
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}

        <DropdownMenuItem asChild>
          <Link href="/perfil">
            <User aria-hidden />
            Meu Perfil
          </Link>
        </DropdownMenuItem>
        {/*
          ⚠️ PLANOS ENTROU AQUI EM 08/09/2026, e a causa fui eu.

          Palavras da cliente: "passando o botão para o Mind X, o botão para
          mudar de plano ficou meio sumido". O "+" da barra inferior levava a
          nova preparação, e a tela de planos era alcançada por ali. Troquei o
          botão pelo Mind-X e não reparei que levei junto o único caminho de
          quem quer assinar.

          O menu do avatar é onde a pessoa procura conta, e plano é conta.
        */}
        <DropdownMenuItem asChild>
          <Link href="/planos">
            <CreditCard aria-hidden />
            Planos
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/configuracoes">
            <Settings aria-hidden />
            Configurações
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/suporte">
            <MessageSquare aria-hidden />
            Feedback &amp; Suporte
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/ajuda">
            <CircleHelp aria-hidden />
            Central de Ajuda
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/*
          ⚠️ FORA DE `DropdownMenuItem`, de propósito.

          Um item de menu fecha o menu ao ser clicado. Aqui a pessoa quer VER o
          tema mudar e talvez experimentar o outro; fechar a cada clique a
          obrigaria a reabrir o menu três vezes para comparar.

          `onSelect` cancelado no wrapper mantém o menu aberto durante a escolha.
        */}
        <div
          className="px-2 py-2"
          onClick={(evento) => evento.stopPropagation()}
          onKeyDown={(evento) => evento.stopPropagation()}
          role="presentation"
        >
          <p className="mb-1.5 px-1 text-xs text-muted-foreground">Tema</p>
          <ThemeToggle />
        </div>

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
