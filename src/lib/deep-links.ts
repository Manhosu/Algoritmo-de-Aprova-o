/**
 * Para onde cada item da Tarefa do Dia leva quando o aluno clica.
 *
 * Pedido da cliente em 21/08/2026:
 *
 *     🧠 Estude: Flash Cards — Crase   → abre os flash cards de Crase
 *     🎯 Pratique: Questões — Crase    → abre o banco de questões, já filtrado
 *
 * DUAS REGRAS QUE EVITAM CLIQUE DESPERDIÇADO
 * ----------------------------------------------------------------------------
 * 1. Quando o motor prescreveu um material ESPECÍFICO (`contentItemId`), o
 *    link vai direto para ele. Mandar para uma lista filtrada quando já se sabe
 *    exatamente qual mapa mental foi prescrito é um clique a mais sem motivo.
 *
 * 2. Rota que ainda não existe devolve `null`, e o componente renderiza texto
 *    em vez de link. Link que leva a 404 é pior que ausência de link: o aluno
 *    conclui que a plataforma está quebrada, e não que a página ainda não
 *    chegou.
 */

export type LinkableTechnique =
  | "reading"
  | "video"
  | "flashcard"
  | "mind_map"
  | "summary"
  | "audio"
  | "questions"
  | "other";

/**
 * Rotas de conteúdo que JÁ EXISTEM.
 *
 * ⚠️ Ao construir uma dessas páginas, mova a entrada para cá. Enquanto ela
 * estiver fora, o bloco correspondente aparece sem link — que é o
 * comportamento correto, não uma limitação.
 */
const IMPLEMENTED_ROUTES = new Set<string>([
  // Preenchido conforme as telas forem entrando.
]);

const TECHNIQUE_ROUTES: Record<LinkableTechnique, string> = {
  flashcard: "/flashcards",
  mind_map: "/mapas-mentais",
  summary: "/resumos",
  video: "/videoaulas",
  audio: "/audios",
  reading: "/estudos",
  other: "/estudos",
  // Não deveria acontecer: "questions" é a prática, não uma técnica de estudo.
  questions: "/questoes",
};

export const QUESTIONS_ROUTE = "/questoes";
export const CONTENT_ITEM_ROUTE = "/conteudo";

export type StudyLinkInput = {
  technique: LinkableTechnique | null;
  /** Material específico prescrito pelo motor, quando existe. */
  contentItemId?: string | null;
  /** Slug do assunto canônico, para filtrar a listagem. */
  topicSlug?: string | null;
};

/**
 * Destino do item de ESTUDO de um bloco.
 * `null` significa "não linkar" — a página ainda não existe.
 */
export function studyLink(input: StudyLinkInput): string | null {
  if (input.contentItemId) {
    return routeIfImplemented(`${CONTENT_ITEM_ROUTE}/${input.contentItemId}`, CONTENT_ITEM_ROUTE);
  }

  const base = input.technique ? TECHNIQUE_ROUTES[input.technique] : "/estudos";
  return routeIfImplemented(withTopic(base, input.topicSlug), base);
}

/** Destino do item de PRÁTICA: o banco de questões, já filtrado no assunto. */
export function practiceLink(topicSlug?: string | null): string | null {
  return routeIfImplemented(withTopic(QUESTIONS_ROUTE, topicSlug), QUESTIONS_ROUTE);
}

/** Destino de uma revisão: a prática do assunto, marcada como revisão. */
export function reviewLink(occurrenceId: string): string | null {
  return routeIfImplemented(`/revisoes/${occurrenceId}`, "/revisoes");
}

function withTopic(base: string, topicSlug?: string | null): string {
  if (!topicSlug) return base;
  return `${base}?assunto=${encodeURIComponent(topicSlug)}`;
}

function routeIfImplemented(href: string, baseRoute: string): string | null {
  return IMPLEMENTED_ROUTES.has(baseRoute) ? href : null;
}

/**
 * Rótulo que o aluno lê no item de estudo.
 *
 * Sem técnica prescrita, mostra só o assunto — "Estude: Crase". Nomear uma
 * técnica cujo material não existe seria prometer o que não há, e é o caso
 * comum enquanto o acervo está sendo construído.
 */
export function studyLabel(technique: LinkableTechnique | null, topicName: string): string {
  if (!technique) return topicName;

  const names: Record<LinkableTechnique, string> = {
    flashcard: "Flash Cards",
    mind_map: "Mapa Mental",
    summary: "Resumo",
    video: "Videoaula",
    audio: "Áudio",
    reading: "Leitura",
    other: "Estudo",
    questions: "Questões",
  };

  return `${names[technique]} — ${topicName}`;
}
