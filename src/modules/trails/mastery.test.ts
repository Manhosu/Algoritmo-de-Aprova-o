import { describe, expect, it } from "vitest";

import {
  judgeMastery,
  masterySize,
  MASTERY_MIN_QUESTIONS,
  MASTERY_PASS_PERCENT,
  MASTERY_TARGET_QUESTIONS,
} from "./mastery";

/**
 * ⚠️ ESTE VEREDITO TIRA UM ASSUNTO DA FILA DO MOTOR 1.
 *
 * Aprovar por engano faz o aluno parar de receber um conteúdo que ele não sabe,
 * e a descoberta vem na prova. É a razão de a regra ser pura e testada em vez
 * de ficar espalhada num handler.
 */

describe("prova de domínio", () => {
  it("aprova a partir do percentual exigido, e não acima dele", () => {
    /* 16 de 20 são exatos 80%: a fronteira precisa APROVAR, não recusar. */
    expect(judgeMastery({ total: 20, correct: 16 }).passed).toBe(true);
    expect(judgeMastery({ total: 20, correct: 15 }).passed).toBe(false);
  });

  it("a mensagem do reprovado diz o alvo, não só que falhou", () => {
    const v = judgeMastery({ total: 20, correct: 15 });

    expect(v.message).toContain("15 de 20");
    expect(v.message).toContain(`${MASTERY_PASS_PERCENT}%`);
  });

  it("não deixa o acerto passar do total", () => {
    /*
      Se um bug de contagem mandasse 25 acertos em 20 questões, o percentual
      passaria de 100 e a tela mostraria "125%". Prender aqui é mais barato que
      confiar em quem chama.
    */
    const v = judgeMastery({ total: 20, correct: 25 });

    expect(v.correct).toBe(20);
    expect(v.accuracyPercent).toBe(100);
  });

  it("zero questões não vira aprovação", () => {
    /*
      0/0 é NaN em divisão, e `NaN >= 80` é falso — então o caso já sairia
      reprovado por acidente. O teste trava o comportamento de propósito: um dia
      alguém troca a comparação e o acidente vira aprovação silenciosa.
    */
    const v = judgeMastery({ total: 0, correct: 0 });

    expect(v.passed).toBe(false);
    expect(Number.isNaN(v.accuracyPercent)).toBe(false);
  });

  it("acervo pequeno demais não abre prova", () => {
    /*
      ⚠️ A REGRA QUE A CLIENTE VAI ENCONTRAR HOJE.

      O acervo está em expansão e a maioria dos assuntos tem menos de dez
      questões. Abrir uma prova de 4 questões carimbaria domínio com uma amostra
      que não cobre nada.
    */
    expect(masterySize(MASTERY_MIN_QUESTIONS - 1)).toBeNull();
    expect(masterySize(0)).toBeNull();
    expect(masterySize(MASTERY_MIN_QUESTIONS)).toBe(MASTERY_MIN_QUESTIONS);
  });

  it("não pede mais questões do que o alvo, nem mais do que existe", () => {
    expect(masterySize(500)).toBe(MASTERY_TARGET_QUESTIONS);
    expect(masterySize(14)).toBe(14);
  });
});
