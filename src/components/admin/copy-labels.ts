/**
 * Os nomes em português de cada campo do editor de textos.
 *
 * ⚠️ SEM RÓTULO, A CLIENTE VÊ A CHAVE CRUA — `titleLine1`, `secondaryCta`. É o
 * tipo de vazamento que não quebra nada e faz a tela parecer inacabada para
 * quem não programa.
 *
 * DOIS MAPAS, E O MOTIVO DO SEGUNDO
 * ----------------------------------------------------------------------------
 * O mapa por CHAVE cobre a maioria: `title` é "Título" em qualquer lugar. Mas
 * há chaves que se repetem em seções diferentes e querem dizer coisas
 * diferentes:
 *
 *   `review`  é o passo 2 ("Você confere") E o bloco de revisões do diferencial
 *   `label`   é a palavra em maiúsculas do painel E o texto do botão fixo
 *
 * Com um mapa só, o bloco de revisões aparecia rotulado "2 · Confere" e o botão
 * do celular, "Palavra em maiúsculas". A cliente leria um nome que não tem nada
 * a ver com o texto ao lado e editaria achando que mexe em outra coisa.
 *
 * Por isso o mapa por CAMINHO vem primeiro e vence.
 */

/** Por chave. Vale onde o nome não é ambíguo. */
export const ROTULOS_POR_CHAVE: Record<string, string> = {
  seo: "Google e compartilhamento",
  title: "Título",
  socialTitle: "Título ao compartilhar o link",

  hero: "Primeira dobra",
  eyebrow: "Linha pequena acima do título",
  titleLine1: "Título — primeira linha",
  titleLine2: "Título — segunda linha (em azul)",
  subtitle: "Parágrafo de apoio",
  primaryCta: "Botão principal",
  secondaryCta: "Botão secundário",
  note: "Frase abaixo dos botões",

  mockup: "Painel de exemplo",
  badge: "Etiqueta do canto",
  tasks: "Linhas do exemplo",
  label: "Palavra em maiúsculas",
  value: "Assunto",
  done: "Aparecer como concluída",
  footnote: "Frase do rodapé do painel",

  howItWorks: "Como funciona",
  steps: "Os quatro passos",
  upload: "1 · Sobe o edital",
  review: "2 · Confere",
  diagnosis: "3 · Diagnóstico",
  daily: "4 · Abre todo dia",
  body: "Texto",

  differential: "O diferencial",
  engines: "Bloco grande",
  metrics: "Os três números",
  cards: "Blocos menores",
  schedule: "Bloco do cronograma",

  closing: "Encerramento",
  cta: "Botão",

  stickyCta: "Botão fixo do celular",

  /* ---------------------------------------------------------------------- *
   * A copy de 04/09/2026
   * ---------------------------------------------------------------------- */

  pains: "Você já passou por isso?",
  audience: "Para quem é",
  comparison: "Comparativo",
  game: "Virou um jogo",
  mission: "A missão do dia",
  system: "Um sistema só",
  science: "Neurociência e IA",
  materials: "Formas de estudar",
  cycle: "O ciclo",
  evolution: "Sua evolução",
  time: "Seu tempo",
  better: "Estudar melhor",
  worth: "Quanto vale",
  faq: "Perguntas frequentes",

  items: "Itens",
  rows: "Linhas",
  badges: "Etiquetas",
  lines: "Linhas de texto",
  denials: "O que ele não é",
  steps2: "Etapas",
  questions: "Perguntas",
  question: "Pergunta",
  answer: "Resposta",
  intro: "Texto de abertura",
  chaosLabel: "Coluna da esquerda",
  chaosNote: "Legenda da esquerda",
  smartLabel: "Coluna da direita",
  smartNote: "Legenda da direita",
  chaos: "Lado do estudo caótico",
  smart: "Lado do Algoritmo",
  closing1: "Fecho, linha 1",
  closing2: "Fecho, linha 2",
  closing3: "Fecho, linha 3",
};

/** Por caminho completo. Vence o mapa por chave. */
export const ROTULOS_POR_CAMINHO: Record<string, string> = {
  "differential.cards.review": "Bloco das revisões",
  "differential.cards.schedule": "Bloco do cronograma",
  "stickyCta.label": "Texto do botão",
  "stickyCta.note": "Frase abaixo do botão",
  "closing.note": "Frase abaixo do botão",

  /*
    `steps` já significa "os quatro passos" em `howItWorks`. No ciclo ele é
    outra coisa, e o mapa por caminho existe justamente para esses choques.
  */
  "cycle.steps": "As nove etapas do ciclo",
  "pains.closing1": "Fecho, linha 1",
  "science.subtitle": "Frase que apresenta a lista",
};

export function rotular(chave: string, caminho?: string): string {
  if (caminho && ROTULOS_POR_CAMINHO[caminho]) return ROTULOS_POR_CAMINHO[caminho];
  return ROTULOS_POR_CHAVE[chave] ?? chave;
}
