/**
 * ALTERNÂNCIA DE DISCIPLINAS — compartilhada pela Tarefa do Dia e pelo Cronograma.
 * ============================================================================
 *
 * ⚠️ ESTE ARQUIVO EXISTE PORQUE OS DOIS DISCORDAVAM NA TELA.
 *
 * A cliente reportou em 02/09/2026: "no cronograma está marcando apenas um
 * assunto para o dia 02/09. Na Missão do dia aparecem 7 conteúdos e nenhum
 * desses 7 é o que está no cronograma para o dia 02/09".
 *
 * A causa não era prioridade errada em nenhum dos dois. Era ordenação
 * diferente do MESMO conjunto: a Tarefa do Dia alternava disciplinas para não
 * empilhar seis blocos de Português seguidos, e o Cronograma empacotava os dias
 * em prioridade pura. Cada um estava certo sozinho, e juntos na tela um
 * desmentia o outro.
 *
 * Com a regra num lugar só, as duas telas passam a contar a mesma história.
 *
 * ⚠️ NÃO MUDA A PRIORIDADE, muda a ORDEM DE ENTREGA.
 *
 * Todo assunto continua na lista, e um assunto de score alto não é empurrado
 * para depois de um de score baixo — a alternância só escolhe, entre os
 * próximos, o de disciplina diferente da última. A diferença de score entre o
 * 3º e o 4º colocados costuma ser pequena demais para justificar a monotonia.
 */

/** O mínimo que a regra precisa saber sobre um item. */
export type HasSubject = { planSubjectId: string | null };

export function spreadAcrossSubjects<T>(
  itens: T[],
  disciplinaDe: (item: T) => string | null,
): T[] {
  const restantes = [...itens];
  const resultado: T[] = [];
  let ultima: string | null = null;

  while (restantes.length > 0) {
    let indice = restantes.findIndex((item) => disciplinaDe(item) !== ultima);

    /*
      Só sobrou a mesma disciplina: aceita a repetição em vez de descartar. Sem
      este `-1`, `splice(-1, 1)` removeria o ÚLTIMO item da fila — o de menor
      prioridade — e a ordem final ficaria invertida no fim da lista.
    */
    if (indice === -1) indice = 0;

    const [escolhido] = restantes.splice(indice, 1);
    resultado.push(escolhido);
    ultima = disciplinaDe(escolhido);
  }

  return resultado;
}
