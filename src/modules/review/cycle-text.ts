/**
 * O TEXTO DO CICLO DE REVISÃO, A PARTIR DO QUE ESTÁ NO PAINEL.
 * ============================================================================
 *
 * Pedido da cliente em 15/09/2026: o texto da tela de Revisões "precisa
 * atualizar conforme eu altero a periodicidade no painel administrativo".
 *
 * Ele era escrito à mão ("24 horas, 7, 30, 60 e 90 dias"). Com a periodicidade
 * trocada no painel, o motor agendava de um jeito e a tela dizia outro — o
 * aluno planejaria a semana por uma regra que não vale mais.
 */

/** [1, 7, 30, 60, 90] → "24 horas, 7, 30, 60 e 90 dias". */
export function descreverIntervalos(intervalsInDays: readonly number[]): string {
  if (intervalsInDays.length === 0) return "";

  /* O primeiro dia vira "24 horas", que é como a cliente e o README o chamam. */
  const comecaEmUmDia = intervalsInDays[0] === 1;
  const dias = comecaEmUmDia ? intervalsInDays.slice(1) : [...intervalsInDays];

  const trechoDosDias =
    dias.length === 0
      ? ""
      : dias.length === 1
        ? `${dias[0]} ${dias[0] === 1 ? "dia" : "dias"}`
        : `${dias.slice(0, -1).join(", ")} e ${dias[dias.length - 1]} dias`;

  if (!comecaEmUmDia) return trechoDosDias;
  if (dias.length === 0) return "24 horas";
  if (dias.length === 1) return `24 horas e ${trechoDosDias}`;
  return `24 horas, ${trechoDosDias}`;
}

export function textoDoCiclo(config: {
  intervalsInDays: readonly number[];
  countNextFromCompletion: boolean;
}): string {
  const regra = config.countNextFromCompletion
    ? "O intervalo seguinte conta a partir do dia em que você revisa de verdade."
    : "O intervalo seguinte conta a partir da data prevista, mesmo que você revise depois.";

  return `O ciclo é ${descreverIntervalos(config.intervalsInDays)} depois de cada estudo. ${regra}`;
}
