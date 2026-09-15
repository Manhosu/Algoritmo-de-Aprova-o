import { describe, expect, it } from "vitest";

import { DEFAULT_REVIEW_INTERVALS } from "@/modules/engine-config/schemas";

import { descreverIntervalos, textoDoCiclo } from "./cycle-text";

describe("descreverIntervalos", () => {
  it("o padrão sai do jeito que a tela sempre disse", () => {
    expect(descreverIntervalos(DEFAULT_REVIEW_INTERVALS.intervalsInDays)).toBe(
      "24 horas, 7, 30, 60 e 90 dias",
    );
  });

  it("⚠️ acompanha o que a cliente muda no painel", () => {
    expect(descreverIntervalos([1, 3, 15, 45])).toBe("24 horas, 3, 15 e 45 dias");
    expect(descreverIntervalos([2, 10])).toBe("2 e 10 dias");
  });

  it("listas curtas", () => {
    expect(descreverIntervalos([1])).toBe("24 horas");
    expect(descreverIntervalos([1, 7])).toBe("24 horas e 7 dias");
    expect(descreverIntervalos([5])).toBe("5 dias");
  });
});

describe("textoDoCiclo", () => {
  it("a regra do intervalo seguinte também vem da configuração", () => {
    expect(textoDoCiclo(DEFAULT_REVIEW_INTERVALS)).toBe(
      "O ciclo é 24 horas, 7, 30, 60 e 90 dias depois de cada estudo. " +
        "O intervalo seguinte conta a partir do dia em que você revisa de verdade.",
    );

    expect(
      textoDoCiclo({ intervalsInDays: [1, 7], countNextFromCompletion: false }),
    ).toMatch(/data prevista/);
  });
});
