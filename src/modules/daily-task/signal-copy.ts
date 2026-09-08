import type { SignalName } from "./signals";

/**
 * O QUE CADA SINAL DO MOTOR 1 SIGNIFICA, EM PORTUGUÊS DE ALUNO.
 * ============================================================================
 *
 * Alimenta a tela "Entenda o Algoritmo" (README 2.5).
 *
 * ⚠️ Texto voltado ao ALUNO, não à operação.
 *
 * "editalWeight = 20%" não explica nada para quem está estudando. O que explica
 * é a frase que diz o que aquilo mede sobre ELE. Os rótulos internos ficam no
 * painel administrativo; aqui a linguagem é outra de propósito.
 *
 * Separado de `signals.ts` porque aquele arquivo é o CÁLCULO — funções puras
 * que decidem a fila do dia — e este é texto de interface. Misturar os dois
 * faria uma correção de vírgula tocar o módulo mais testado do produto.
 */

export const SIGNAL_COPY: Record<SignalName, { label: string; explanation: string }> = {
  hardReviews: {
    label: "Revisões difíceis",
    explanation:
      "Quantas revisões deste assunto você marcou como Difícil. Você pode acertar as " +
      "questões e ainda sentir que o assunto custa, e é isso que este sinal enxerga.",
  },
  editalWeight: {
    label: "Peso no edital",
    explanation:
      "Quantas questões o tema costuma valer na sua prova. Assunto que cai muito vem antes.",
  },
  urgency: {
    label: "Tempo até a prova",
    explanation:
      "Com a prova perto, o que ainda não foi visto passa na frente do que já está sólido.",
  },
  recency: {
    label: "Há quanto tempo você não vê",
    explanation:
      "O esquecimento é previsível. Assunto parado há semanas volta antes de você perdê-lo.",
  },
  knowledgeGap: {
    label: "Suas lacunas",
    explanation:
      "Onde você erra de forma repetida — diferente de errar uma vez por descuido.",
  },
};

/**
 * A ordem fixa em que os cinco sinais aparecem na tela.
 *
 * ⚠️ Uma lista escrita à mão pode ficar incompleta sem que nada reclame: o
 * TypeScript garante que cada item é um `SignalName`, não que todos estão lá.
 *
 * Um sexto sinal acrescentado ao motor entraria na conta da nota e ficaria de
 * fora da explicação — as barras somariam menos que o número exibido ao lado, e
 * a tela que existe para provar que a conta é honesta mostraria uma conta que
 * não fecha. O teste ao lado cobre exatamente isso.
 */
export const SIGNAL_ORDER: SignalName[] = [
  "hardReviews",
  "editalWeight",
  "urgency",
  "recency",
  "knowledgeGap",
];
