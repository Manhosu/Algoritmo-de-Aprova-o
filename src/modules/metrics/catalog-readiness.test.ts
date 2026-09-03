import { describe, expect, it } from "vitest";

import { computeCatalogReadiness, READINESS_KINDS } from "./catalog-readiness";

describe("acervo de estudos", () => {
  it("conta por par assunto × tipo, não por assunto", () => {
    /*
      Dois assuntos, um com os quatro tipos e outro com nenhum. Por assunto isso
      daria 50%; por par dá 50% também, e é coincidência. O caso que separa as
      duas contas é o de baixo.
    */
    const r = computeCatalogReadiness({
      topics: [
        { planTopicId: "a", availableKinds: [...READINESS_KINDS] },
        { planTopicId: "b", availableKinds: [] },
      ],
    });

    expect(r.readyPairs).toBe(4);
    expect(r.totalPairs).toBe(8);
    expect(r.availablePercent).toBe(50);
  });

  it("um assunto com só um tipo não vale um assunto inteiro", () => {
    /*
      ⚠️ ESTE É O TESTE QUE JUSTIFICA A REGRA.

      Uma contagem por assunto marcaria os dois como "tem material" e diria
      100%. O aluno abriria a biblioteca esperando estar servido e encontraria
      um resumo por assunto, sem questão nenhuma para treinar.
    */
    const r = computeCatalogReadiness({
      topics: [
        { planTopicId: "a", availableKinds: ["study_text"] },
        { planTopicId: "b", availableKinds: ["study_text"] },
      ],
    });

    expect(r.availablePercent).toBe(25);
    expect(r.inProductionPercent).toBe(75);
  });

  it("os dois percentuais sempre somam 100", () => {
    /*
      Arredondar as duas pontas em separado dava 40% e 61% em algumas divisões.
      O card mostraria dois números que não fecham, e a cliente veria isso antes
      de qualquer teste.
    */
    for (let prontos = 0; prontos <= 12; prontos++) {
      const topics = Array.from({ length: 3 }, (_, i) => ({
        planTopicId: `t${i}`,
        availableKinds: [] as (typeof READINESS_KINDS)[number][],
      }));

      let restante = prontos;
      for (const assunto of topics) {
        const leva = Math.min(4, restante);
        assunto.availableKinds = READINESS_KINDS.slice(0, leva);
        restante -= leva;
      }

      const r = computeCatalogReadiness({ topics });
      expect(r.availablePercent + r.inProductionPercent).toBe(100);
    }
  });

  it("tipo repetido no mesmo assunto conta uma vez só", () => {
    /*
      Dois mapas mentais do mesmo assunto são dois materiais e um tipo. Sem o
      `Set`, o percentual passaria de 100 no dia em que a cliente cadastrasse o
      segundo material de um tipo que já existia.
    */
    const r = computeCatalogReadiness({
      topics: [{ planTopicId: "a", availableKinds: ["mind_map", "mind_map", "mind_map"] }],
    });

    expect(r.readyPairs).toBe(1);
    expect(r.availablePercent).toBe(25);
  });

  it("sem edital não inventa denominador", () => {
    const r = computeCatalogReadiness({ topics: [] });

    expect(r.totalPairs).toBe(0);
    expect(r.availablePercent).toBe(0);
    expect(r.inProductionPercent).toBe(0);
  });
});
