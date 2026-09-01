import { describe, expect, it } from "vitest";

import { DEFAULT_DAILY_TASK_WEIGHTS } from "@/modules/engine-config/schemas";

import { SIGNAL_COPY, SIGNAL_ORDER } from "./signal-copy";

describe("os sinais na tela Entenda o Algoritmo", () => {
  const doMotor = Object.keys(DEFAULT_DAILY_TASK_WEIGHTS).sort();

  it("a tela lista TODOS os sinais que o motor usa", () => {
    /*
      ⚠️ O TypeScript não pega isto. `SignalName[]` garante que cada item da
      lista é um sinal válido, não que todos os sinais estão na lista.

      Um sexto sinal acrescentado ao motor entraria na conta da nota e ficaria
      de fora da explicação: as cinco barras somariam menos que o número exibido
      ao lado, e a tela que existe para provar que a conta é honesta passaria a
      mostrar uma conta que não fecha.
    */
    expect([...SIGNAL_ORDER].sort()).toEqual(doMotor);
  });

  it("não repete sinal na ordem", () => {
    expect(new Set(SIGNAL_ORDER).size).toBe(SIGNAL_ORDER.length);
  });

  it("todo sinal tem rótulo e explicação não vazios", () => {
    for (const sinal of SIGNAL_ORDER) {
      expect(SIGNAL_COPY[sinal].label.trim().length).toBeGreaterThan(0);
      expect(SIGNAL_COPY[sinal].explanation.trim().length).toBeGreaterThan(0);
    }
  });

  it("o nome interno do peso não vaza para a tela do aluno", () => {
    /*
      "editalWeight" e "knowledgeGap" são chaves de schema. Escrevê-las na tela
      é o jeito mais fácil de a explicação deixar de explicar — e acontece
      sozinho quando alguém acrescenta um sinal e usa a chave como rótulo
      provisório até pensar num nome.
    */
    for (const sinal of SIGNAL_ORDER) {
      const texto = `${SIGNAL_COPY[sinal].label} ${SIGNAL_COPY[sinal].explanation}`;
      expect(texto).not.toContain(sinal);
    }
  });
});
