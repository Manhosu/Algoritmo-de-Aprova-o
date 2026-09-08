import { describe, expect, it } from "vitest";

import {
  answerCard,
  isFinished,
  remaining,
  startSession,
  type FlashcardSession,
} from "./flashcard-session";

const BARALHO = [{ id: "a" }, { id: "b" }, { id: "c" }];

/** Aplica várias respostas em sequência, para ler o teste como uma rodada. */
function responder(
  sessao: FlashcardSession<{ id: string }>,
  ...notas: Array<"easy" | "hard">
) {
  return notas.reduce((atual, nota) => answerCard(atual, nota), sessao);
}

describe("rodada de flashcards", () => {
  it("começa no primeiro cartão", () => {
    const sessao = startSession(BARALHO);
    expect(sessao.current?.id).toBe("a");
    expect(sessao.total).toBe(3);
    expect(isFinished(sessao)).toBe(false);
  });

  it("FÁCIL tira o cartão da fila de vez", () => {
    const sessao = responder(startSession(BARALHO), "easy");
    expect(sessao.current?.id).toBe("b");
    expect(sessao.learned).toBe(1);
    expect(remaining(sessao)).toBe(2);
  });

  it("DIFÍCIL manda para o FIM, não para a próxima posição", () => {
    /*
      Reinserir logo adiante devolve o cartão com a resposta ainda na memória de
      curto prazo, e acertar assim não prova nada.
    */
    const sessao = responder(startSession(BARALHO), "hard");
    expect(sessao.queue.map((c) => c.id)).toEqual(["b", "c", "a"]);
    expect(sessao.current?.id).toBe("b");
    expect(sessao.learned).toBe(0);
    expect(remaining(sessao)).toBe(3);
  });

  it("o cartão difícil VOLTA, e é isso que faz o baralho ensinar", () => {
    const sessao = responder(startSession(BARALHO), "hard", "easy", "easy");
    expect(sessao.current?.id).toBe("a");
    expect(isFinished(sessao)).toBe(false);
  });

  it("a rodada só acaba quando TODO cartão foi marcado como fácil", () => {
    const quaseLa = responder(startSession(BARALHO), "easy", "easy", "hard");
    expect(isFinished(quaseLa)).toBe(false);

    const fim = answerCard(quaseLa, "easy");
    expect(isFinished(fim)).toBe(true);
    expect(fim.current).toBeNull();
    expect(fim.learned).toBe(3);
  });

  it("conta as repetições, para a tela saber que o baralho está resistindo", () => {
    const sessao = responder(startSession(BARALHO), "hard", "hard", "hard");
    expect(sessao.repeats).toBe(3);
    expect(sessao.learned).toBe(0);
  });

  it("com UM cartão na fila, difícil o mantém na tela", () => {
    /*
      Encerrar a rodada com um cartão que o aluno acabou de dizer que não sabe
      fecharia o baralho exatamente sobre a lacuna que ele veio resolver.
    */
    const umSo = responder(startSession(BARALHO), "easy", "easy");
    expect(umSo.current?.id).toBe("c");

    const depois = answerCard(umSo, "hard");
    expect(depois.current?.id).toBe("c");
    expect(isFinished(depois)).toBe(false);
  });

  it("baralho vazio não quebra e não se diz terminado", () => {
    const vazio = startSession<{ id: string }>([]);
    expect(vazio.current).toBeNull();
    /* Zero cartões não é "tudo dominado" — é baralho sem conteúdo. */
    expect(isFinished(vazio)).toBe(false);
  });

  it("responder depois do fim não faz nada", () => {
    const fim = responder(startSession(BARALHO), "easy", "easy", "easy");
    expect(answerCard(fim, "hard")).toBe(fim);
  });

  it("não muda a rodada recebida", () => {
    /*
      Mutar no lugar faria o React não perceber a mudança, e a tela ficaria
      parada no mesmo cartão — o defeito mais comum de fila em estado.
    */
    const antes = startSession(BARALHO);
    const copia = [...antes.queue];

    answerCard(antes, "hard");

    expect(antes.queue).toEqual(copia);
    expect(antes.current?.id).toBe("a");
  });
});
