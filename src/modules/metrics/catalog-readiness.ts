/**
 * ACERVO DE ESTUDOS — quanto do edital do aluno já tem material (pedido de 03/09/2026).
 * ============================================================================
 *
 * Palavras da cliente, no card que ela desenhou:
 *
 *   Materiais disponíveis: 40%   (percentual do material do edital dele que
 *                                 está pronto, considerando questões / mapas
 *                                 mentais / flashcards / resumo)
 *   Materiais em produção:  60%
 *
 * ⚠️ A CONTA É POR PAR (ASSUNTO × TIPO), não por assunto.
 *
 * "Considerando questões, mapas mentais, flashcards e resumo" é a definição do
 * que conta como pronto. Um assunto com só um resumo não está no mesmo estado
 * que um com os quatro, e uma contagem por assunto trataria os dois como 100%.
 * O denominador é `assuntos × 4`, e cada par vale um ponto quando existe pelo
 * menos um item publicado daquele tipo naquele assunto.
 *
 * ⚠️ E O UNIVERSO É O EDITAL DELE, não o catálogo inteiro.
 *
 * O card responde "quanto do MEU material está pronto". Medir contra tudo o que
 * existe na plataforma daria um número menor e sem relação com a prova que ele
 * vai fazer.
 *
 * Puro de propósito: nenhuma consulta aqui dentro. O chamador traz os pares que
 * existem, e este módulo só divide.
 */

/** Os quatro tipos que a cliente listou, na ordem em que ela escreveu. */
export const READINESS_KINDS = ["questions", "mind_map", "flashcard_deck", "study_text"] as const;

export type ReadinessKind = (typeof READINESS_KINDS)[number];

export type CatalogReadiness = {
  /** Percentual pronto, arredondado. */
  availablePercent: number;
  /** O complemento. Sempre soma 100 com o de cima. */
  inProductionPercent: number;
  /** Pares (assunto × tipo) com pelo menos um item publicado. */
  readyPairs: number;
  /** `assuntos × 4`. Zero quando o aluno ainda não tem edital. */
  totalPairs: number;
  /** Quantos assuntos entraram na conta. */
  topicCount: number;
};

export function computeCatalogReadiness(input: {
  /** Um por assunto ATIVO do edital do aluno. */
  topics: Array<{
    planTopicId: string;
    /** Os tipos que já têm material publicado neste assunto. */
    availableKinds: ReadinessKind[];
  }>;
}): CatalogReadiness {
  const assuntos = input.topics.length;
  const totalPairs = assuntos * READINESS_KINDS.length;

  if (totalPairs === 0) {
    /*
      Sem edital não há denominador. Devolver 0% de disponível sugeriria que
      falta tudo, quando na verdade não há nada a medir — quem decide o que
      mostrar nesse caso é a tela.
    */
    return {
      availablePercent: 0,
      inProductionPercent: 0,
      readyPairs: 0,
      totalPairs: 0,
      topicCount: 0,
    };
  }

  const readyPairs = input.topics.reduce((soma, assunto) => {
    /*
      `Set` para o caso de o chamador repetir um tipo. Sem ele, um assunto com
      dois mapas mentais contaria duas vezes e o percentual poderia passar de
      100 — o tipo de erro que só aparece no dia em que a cliente cadastra o
      segundo material do mesmo tipo.
    */
    const tipos = new Set(assunto.availableKinds);
    return soma + [...tipos].filter((t) => READINESS_KINDS.includes(t)).length;
  }, 0);

  const availablePercent = Math.round((readyPairs / totalPairs) * 100);

  return {
    availablePercent,
    /*
      Subtração, e não um segundo arredondamento. Duas contas arredondadas em
      separado dariam 40% e 61% num dia qualquer, e o card mostraria dois
      números que não fecham.
    */
    inProductionPercent: 100 - availablePercent,
    readyPairs,
    totalPairs,
    topicCount: assuntos,
  };
}
