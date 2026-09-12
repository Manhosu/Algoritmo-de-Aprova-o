/**
 * QUANDO UMA ASSINATURA CANCELADA PELO ALUNO DEIXA DE VALER.
 * ============================================================================
 *
 * Pedido da cliente em 11/09/2026: "pode incluir o botão 'Cancelar assinatura'
 * no perfil do aluno".
 *
 * ⚠️ CANCELAR PARA A COBRANÇA, E NÃO O ACESSO QUE JÁ FOI PAGO.
 *
 * Quem paga o mês no dia 5 e cancela no dia 6 continua com o plano até o dia 5
 * seguinte. Tirar o acesso na hora cobraria por trinta dias e entregaria um — é
 * o motivo mais comum de reclamação e de estorno em assinatura.
 *
 * Sem período registrado (assinatura antiga, ou dado incompleto), não há o que
 * preservar: o encerramento é imediato.
 */

export type Encerramento = { quando: "fim_do_periodo"; ate: Date } | { quando: "agora" };

export function quandoEncerrar(input: { currentPeriodEnd: Date | null; now: Date }): Encerramento {
  if (input.currentPeriodEnd && input.currentPeriodEnd.getTime() > input.now.getTime()) {
    return { quando: "fim_do_periodo", ate: input.currentPeriodEnd };
  }

  return { quando: "agora" };
}

/** A assinatura cancelada pelo aluno já passou do período pago. */
export function jaVenceu(input: {
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  now: Date;
}): boolean {
  if (!input.cancelAtPeriodEnd) return false;
  if (input.currentPeriodEnd === null) return true;
  return input.currentPeriodEnd.getTime() <= input.now.getTime();
}
