import {
  BookOpen,
  CircleHelp,
  Compass,
  Home,
  RefreshCw,
  Route,
  ShoppingBag,
  Sparkles,
  Trophy,
} from "lucide-react";
import type { ReactNode } from "react";

/**
 * Os itens de navegação, num lugar só.
 *
 * ⚠️ Esta lista foi montada a partir do mockup MENOS os itens que a cliente
 * riscou. Não acrescente nada aqui sem conferir a seção "FORA DO ESCOPO" do
 * README: Simulados, Desempenho, Treinamento Cognitivo, Mentoria, Consultoria,
 * Aprovados e Sessão NeuroCognitiva aparecem no mockup e **não entram**.
 *
 * "Desempenho" foi removido porque as métricas ficam na Home — decisão fechada.
 * Recolocá-lo criaria um link para uma página que não existe.
 */

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  /**
   * A tela ainda não existe (Marco 2). O item aparece no menu, apagado e sem
   * link.
   *
   * Aparecer é deliberado: o menu comunica o que o produto vai ser, e sumir com
   * metade dele na demonstração daria a impressão de um produto menor do que é.
   * Não linkar também é deliberado: um item que leva a 404 faz o aluno concluir
   * que a plataforma está quebrada, não que a página ainda não chegou.
   *
   * ⚠️ Ao construir uma dessas telas, remova a marca daqui.
   */
  soon?: boolean;
};

/**
 * Menu lateral.
 *
 * A ordem saiu do README 2.2 e mudou a pedido da cliente em 28/08/2026:
 * Cronograma Adaptativo subiu para logo abaixo de Home.
 *
 * ⚠️ O CRITÉRIO É FREQUÊNCIA DE USO, não a ordem do fluxo de cadastro. O aluno
 * abre o cronograma quase toda sessão, e ele estava embaixo de dois itens
 * apagados ("em breve") — o olho batia primeiro no que não funciona.
 *
 * Estudos e Entenda o Algoritmo continuam desabilitados até o Marco 2.
 */
export const SIDEBAR_ITEMS: NavItem[] = [
  { href: "/inicio", label: "Home", icon: <Home /> },
  { href: "/cronograma", label: "Cronograma Adaptativo", icon: <Compass /> },
  { href: "/questoes", label: "Questões", icon: <CircleHelp /> },
  { href: "/revisoes", label: "Revisões", icon: <RefreshCw /> },
  { href: "/estudos", label: "Estudos", icon: <BookOpen />, soon: true },
  {
    href: "/entenda-o-algoritmo",
    label: "Entenda o Algoritmo",
    icon: <Sparkles />,
    soon: true,
  },
];

/**
 * Barra inferior: Home | Trilhas | [ + ] | Ranking | Loja.
 *
 * O "+" não está nesta lista porque não é um item de navegação comum — é o
 * botão central elevado que inicia uma preparação (README 1.4). Ele é
 * renderizado à parte, entre o segundo e o terceiro item.
 */
export const BOTTOM_NAV_ITEMS: NavItem[] = [
  { href: "/inicio", label: "Home", icon: <Home /> },
  { href: "/trilhas", label: "Trilhas", icon: <Route />, soon: true },
  { href: "/ranking", label: "Ranking", icon: <Trophy />, soon: true },
  { href: "/loja", label: "Loja", icon: <ShoppingBag />, soon: true },
];

/** Onde o botão "+" entra na barra inferior. */
export const BOTTOM_NAV_CENTER_INDEX = 2;

/**
 * Menu do avatar.
 *
 * ⚠️ "Notificações" saiu junto com o sino do cabeçalho (pedido da cliente em
 * 27/08/2026). A tela é do Marco 2, e um item apagado no menu comunica defeito,
 * não "vem depois". Volta quando a tela existir.
 */
export const AVATAR_MENU_ITEMS = [
  { href: "/perfil", label: "Meu Perfil", icon: "user" },
  { href: "/configuracoes", label: "Configurações", icon: "settings" },
  { href: "/suporte", label: "Feedback & Suporte", icon: "message" },
  { href: "/ajuda", label: "Central de Ajuda", icon: "help" },
] as const;
