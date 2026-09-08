/**
 * A RODADA DE FLASHCARDS, no estilo Anki (pedido da cliente em 08/09/2026).
 *
 * Palavras dela: "os flashcards poderiam funcionar como no Anki: fácil e
 * difícil, e o difícil volta para o fim do baralho".
 *
 * ⚠️ A FILA É O MECANISMO INTEIRO, e por isso ela é pura e testada aqui.
 *
 * O que estava no lugar era "anterior / próximo": o aluno passava os cartões e
 * chegava ao fim, tendo acertado ou não. Isso é folhear, não estudar. O que faz
 * o flashcard funcionar é o cartão errado VOLTAR — a repetição é a parte que
 * ensina, e sem ela o baralho é uma lista de perguntas.
 *
 * ⚠️ "DIFÍCIL" VAI PARA O FIM, E NÃO PARA UMA POSIÇÃO SORTEADA OU PRÓXIMA.
 *
 * Reinserir logo adiante devolve o cartão enquanto a resposta ainda está na
 * memória de curto prazo, e acertar assim não prova nada. O fim da fila é o
 * intervalo mais longo que uma rodada consegue oferecer.
 */

export type FlashcardSession<T extends { id: string }> = {
  /** O que está na tela agora. Nulo quando a rodada acabou. */
  current: T | null;
  /** A fila, do próximo ao último. Inclui o atual na primeira posição. */
  queue: T[];
  /** Quantos cartões foram marcados como fáceis e saíram da fila. */
  learned: number;
  /** O tamanho do baralho, que não muda durante a rodada. */
  total: number;
  /** Quantas vezes um cartão voltou por ter sido marcado como difícil. */
  repeats: number;
};

export function startSession<T extends { id: string }>(cards: T[]): FlashcardSession<T> {
  return {
    current: cards[0] ?? null,
    queue: [...cards],
    learned: 0,
    total: cards.length,
    repeats: 0,
  };
}

export type CardRating = "easy" | "hard";

/**
 * Responde o cartão atual e devolve a rodada seguinte.
 *
 * Não muda a rodada recebida: quem chama guarda o retorno. Mutar no lugar faria
 * o React não perceber a mudança e a tela ficaria parada no mesmo cartão — o
 * defeito mais comum de fila em estado de componente.
 */
export function answerCard<T extends { id: string }>(
  session: FlashcardSession<T>,
  rating: CardRating,
): FlashcardSession<T> {
  if (session.current === null) return session;

  const [atual, ...resto] = session.queue;

  if (rating === "easy") {
    return {
      ...session,
      queue: resto,
      current: resto[0] ?? null,
      learned: session.learned + 1,
    };
  }

  /*
    ⚠️ COM UM CARTÃO SÓ NA FILA, ELE CONTINUA NA TELA — e isso é correto.

    Mandar o único cartão restante "para o fim" o traz de volta na hora, o que
    parece um botão que não fez nada. A alternativa seria encerrar a rodada com
    um cartão que o aluno acabou de dizer que não sabe, que é pior: o baralho
    fecharia exatamente sobre a lacuna que ele veio resolver. A tela avisa que
    é o último.
  */
  const fila = [...resto, atual];

  return {
    ...session,
    queue: fila,
    current: fila[0],
    repeats: session.repeats + 1,
  };
}

/** Quantos cartões distintos ainda faltam dominar. */
export function remaining<T extends { id: string }>(session: FlashcardSession<T>): number {
  return new Set(session.queue.map((card) => card.id)).size;
}

/** A rodada acabou quando todo cartão foi marcado como fácil. */
export function isFinished<T extends { id: string }>(session: FlashcardSession<T>): boolean {
  return session.total > 0 && session.queue.length === 0;
}
