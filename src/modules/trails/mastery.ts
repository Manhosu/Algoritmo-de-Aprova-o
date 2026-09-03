/**
 * PROVA DE DOMÍNIO — o veredito (pedido da cliente em 02/09/2026).
 * ============================================================================
 *
 * Palavras dela:
 *
 *   [COMPROVAR DOMÍNIO]
 *   Ao clicar:
 *   → Gerar 20 ou 30 questões aleatórias
 *   → Todas relacionadas ao assunto
 *   → Registrar o resultado
 *   → Confirmar ou não o domínio
 *
 *   "Mesmo que o Banco de Questões ainda esteja em expansão, gostaria que essa
 *    funcionalidade já fosse estruturada para funcionar quando tivermos um
 *    volume maior de questões."
 *
 * ⚠️ O VEREDITO É PURO, e é a parte que precisa ser confiável.
 *
 * Marcar um assunto como dominado tira ele da fila do Motor 1: o aluno para de
 * receber esse conteúdo na Tarefa do Dia. Errar para cima faz alguém deixar de
 * estudar o que não sabe, e a descoberta vem na prova. Por isso a regra mora
 * aqui, testada, e não espalhada num handler.
 */

/** Quantas questões a prova pede, no ideal. */
export const MASTERY_TARGET_QUESTIONS = 20;

/**
 * O mínimo para a prova valer.
 *
 * ⚠️ ABAIXO DISTO A PROVA NÃO ACONTECE, em vez de acontecer menor.
 *
 * Uma "prova de domínio" com 4 questões mede sorte: acertar 4 de 4 tem 0,4% de
 * chance no chute puro com 4 alternativas, mas 4 questões não cobrem um assunto.
 * Dizer "ainda não temos questões suficientes" é honesto; carimbar domínio com
 * uma amostra dessas seria mentir com número.
 */
export const MASTERY_MIN_QUESTIONS = 10;

/** Percentual de acerto exigido. */
export const MASTERY_PASS_PERCENT = 80;

export type MasteryVerdict = {
  total: number;
  correct: number;
  accuracyPercent: number;
  passed: boolean;
  /** Frase pronta para a tela. */
  message: string;
};

export function judgeMastery(input: {
  total: number;
  correct: number;
  passPercent?: number;
}): MasteryVerdict {
  const alvo = input.passPercent ?? MASTERY_PASS_PERCENT;

  if (input.total <= 0) {
    return {
      total: 0,
      correct: 0,
      accuracyPercent: 0,
      passed: false,
      message: "Nenhuma questão respondida.",
    };
  }

  const correct = Math.max(0, Math.min(input.total, input.correct));
  const accuracyPercent = Math.round((correct / input.total) * 100);
  const passed = accuracyPercent >= alvo;

  return {
    total: input.total,
    correct,
    accuracyPercent,
    passed,
    message: passed
      ? `Domínio comprovado: ${correct} de ${input.total} (${accuracyPercent}%).`
      : /*
           A frase do reprovado diz QUANTO FALTOU, não só que falhou. "Você
           errou" encerra; "faltaram 2 acertos" mostra que o alvo está perto e
           é o que faz a pessoa tentar de novo.
         */
        `Faltou pouco: ${correct} de ${input.total} (${accuracyPercent}%). ` +
        `São necessários ${alvo}% para comprovar o domínio.`,
  };
}

/**
 * Quantas questões a prova terá, dado o que existe no acervo.
 *
 * `null` significa que ainda não dá para provar nada — a tela mostra quantas
 * faltam em vez de abrir uma prova sem sentido.
 */
export function masterySize(available: number): number | null {
  if (available < MASTERY_MIN_QUESTIONS) return null;
  return Math.min(available, MASTERY_TARGET_QUESTIONS);
}
