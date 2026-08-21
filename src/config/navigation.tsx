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
};

/**
 * Menu lateral, na ordem exata do README 2.2.
 *
 * Os dois últimos não estão no mockup e foram acrescentados pela cliente:
 * Cronograma Adaptativo e Entenda o Algoritmo.
 */
export const SIDEBAR_ITEMS: NavItem[] = [
  { href: "/inicio", label: "Home", icon: <Home /> },
  { href: "/estudos", label: "Estudos", icon: <BookOpen /> },
  { href: "/questoes", label: "Questões", icon: <CircleHelp /> },
  { href: "/revisoes", label: "Revisões", icon: <RefreshCw /> },
  { href: "/cronograma", label: "Cronograma Adaptativo", icon: <Compass /> },
  { href: "/entenda-o-algoritmo", label: "Entenda o Algoritmo", icon: <Sparkles /> },
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
  { href: "/trilhas", label: "Trilhas", icon: <Route /> },
  { href: "/ranking", label: "Ranking", icon: <Trophy /> },
  { href: "/loja", label: "Loja", icon: <ShoppingBag /> },
];

/** Onde o botão "+" entra na barra inferior. */
export const BOTTOM_NAV_CENTER_INDEX = 2;

/** Menu do avatar, os 6 itens do README 2.2. */
export const AVATAR_MENU_ITEMS = [
  { href: "/perfil", label: "Meu Perfil", icon: "user" },
  { href: "/configuracoes", label: "Configurações", icon: "settings" },
  { href: "/notificacoes", label: "Notificações", icon: "bell" },
  { href: "/suporte", label: "Feedback & Suporte", icon: "message" },
  { href: "/ajuda", label: "Central de Ajuda", icon: "help" },
] as const;
