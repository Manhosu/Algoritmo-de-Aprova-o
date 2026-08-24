/**
 * Para onde cada item da Tarefa do Dia leva quando o aluno clica.
 *
 * Pedido da cliente em 21/08/2026:
 *
 *     🧠 Estude: Flash Cards — Crase   → abre os flash cards de Crase
 *     🎯 Pratique: Questões — Crase    → abre o banco de questões, já filtrado
 *
 * A REGRA DO DESTINO — corrigida em 21/08/2026
 * ----------------------------------------------------------------------------
 * A cliente perguntou: "e se tiver vários mapas mentais sobre crase, não teria
 * que ter uma lista?"
 *
 * Tinha, sim. A versão anterior ia DIRETO ao material sempre que o motor
 * tivesse escolhido um — o que escondia os outros. Um aluno que já viu aquele
 * mapa mental ficaria preso a ele, sem descobrir que existiam mais três.
 *
 * A regra passa a depender de QUANTOS materiais existem:
 *
 *   • exatamente 1 → vai direto a ele. Mostrar uma lista de um item só é um
 *     clique jogado fora.
 *   • 2 ou mais   → vai para a lista já filtrada por técnica e assunto. Não é
 *     um monte de conteúdo para garimpar: é a lista curta do que serve.
 *   • nenhum       → não linka.
 *
 * E rota que ainda não existe devolve `null`: o componente renderiza texto em
 * vez de link. Link que leva a 404 é pior que ausência de link — o aluno
 * conclui que a plataforma está quebrada, não que a página ainda não chegou.
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

export const QUESTIONS_ROUTE = "/questoes";
export const CONTENT_ITEM_ROUTE = "/conteudo";

/**
 * Rotas de conteúdo que JÁ EXISTEM.
 *
 * ⚠️ Ao construir uma dessas páginas, mova a entrada para cá. Enquanto ela
 * estiver fora, o bloco correspondente aparece sem link — que é o
 * comportamento correto, não uma limitação.
 *
 * ⚠️ As constantes de rota são declaradas ACIMA deste conjunto de propósito:
 * `const` fica na zona morta temporal até a linha executar, e este `new Set`
 * roda na avaliação do módulo. Declarar depois quebraria em runtime, não na
 * compilação.
 */
const IMPLEMENTED_ROUTES = new Set<string>([
  /**
   * Banco de questões — entrou em 23/08/2026.
   *
   * É o que torna clicável a metade "Pratique" de cada missão, como a cliente
   * pediu. A metade "Estude" continua sem link enquanto o acervo de material
   * (mapas mentais, flashcards, resumos) não tiver tela: um link para uma
   * página que não existe faz o aluno concluir que a plataforma está quebrada.
   */
  QUESTIONS_ROUTE,
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

export type StudyLinkInput = {
  technique: LinkableTechnique | null;
  /** Material específico prescrito pelo motor, quando existe. */
  contentItemId?: string | null;
  /** Slug do assunto canônico, para filtrar a listagem. */
  topicSlug?: string | null;
  /**
   * Quantos materiais daquela técnica existem para o assunto.
   *
   * É o que decide entre ir direto ao item e abrir a lista. Sem esse número, o
   * link direto esconderia os demais materiais do aluno.
   */
  materialCount?: number;
};

/**
 * Destino do item de ESTUDO de um bloco.
 * `null` significa "não linkar" — a página ainda não existe.
 */
export function studyLink(input: StudyLinkInput): string | null {
  const count = input.materialCount ?? (input.contentItemId ? 1 : 0);

  // Um único material: abrir uma lista de um item só seria um clique a mais.
  if (count === 1 && input.contentItemId) {
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
