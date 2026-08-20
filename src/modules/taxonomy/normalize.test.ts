import { describe, expect, it } from "vitest";

import {
  MATCH_THRESHOLDS,
  normalizeText,
  slugify,
  taxonomyKey,
  trigramSimilarity,
} from "./normalize";

describe("normalizeText", () => {
  it("remove acento, caixa e pontuação", () => {
    expect(normalizeText("Acentuação Gráfica!")).toBe("acentuacao grafica");
  });

  it("colapsa espaços e remove sobras nas pontas", () => {
    expect(normalizeText("  Crase   e    regência  ")).toBe("crase e regencia");
  });

  it("preserva números, porque eles distinguem assuntos", () => {
    // "Arts. 5º ao 17" e "Arts. 20 ao 30" não podem virar a mesma coisa.
    expect(normalizeText("Constituição - Arts. 5º ao 17")).toBe("constituicao arts 5 ao 17");
  });
});

describe("taxonomyKey", () => {
  it("iguala as redações que um edital usa para o mesmo assunto", () => {
    const variacoes = [
      "Emprego do sinal indicativo de crase",
      "Emprego do sinal indicativo da crase",
      "EMPREGO DO SINAL INDICATIVO DE CRASE",
      "emprego  do sinal  indicativo de crase.",
    ];
    const chaves = new Set(variacoes.map(taxonomyKey));
    expect(chaves.size).toBe(1);
  });

  it("NÃO junta assuntos que a negação torna opostos", () => {
    // Apagar o "não" faria "casos em que não ocorre crase" virar "casos de crase".
    expect(taxonomyKey("Casos em que não ocorre crase")).not.toBe(
      taxonomyKey("Casos em que ocorre crase"),
    );
  });

  it("distingue assuntos parecidos de disciplinas diferentes", () => {
    expect(taxonomyKey("Princípios da Administração Pública")).not.toBe(
      taxonomyKey("Princípios fundamentais"),
    );
  });

  it("não devolve chave vazia quando o texto só tem palavras de ligação", () => {
    // Chave vazia colidiria com qualquer outra chave vazia.
    expect(taxonomyKey("Das")).not.toBe("");
    expect(taxonomyKey("de a o")).not.toBe("");
  });

  it("devolve string vazia só quando não há nada aproveitável", () => {
    expect(taxonomyKey("---")).toBe("");
  });
});

describe("trigramSimilarity", () => {
  it("é 1 para textos idênticos após normalização", () => {
    expect(trigramSimilarity("Crase", "crase")).toBe(1);
  });

  it("é simétrica", () => {
    const a = trigramSimilarity("Regência verbal", "Regencia verbal e nominal");
    const b = trigramSimilarity("Regencia verbal e nominal", "Regência verbal");
    expect(a).toBeCloseTo(b, 10);
  });

  it("mantém próximas as variações de flexão", () => {
    const score = trigramSimilarity("Direitos constitucionais", "Direito constitucional");
    expect(score).toBeGreaterThan(MATCH_THRESHOLDS.ambiguous);
  });

  it("mantém distantes assuntos de disciplinas diferentes", () => {
    const score = trigramSimilarity("Crase", "Probabilidade");
    expect(score).toBeLessThan(MATCH_THRESHOLDS.ambiguous);
  });

  it("não deixa um nome curto casar com qualquer coisa que o contenha", () => {
    // É o motivo de usarmos Jaccard e não "quantos trigramas do menor cabem no maior".
    const score = trigramSimilarity(
      "Crase",
      "Crase, regência, concordância, colocação pronominal e pontuação",
    );
    expect(score).toBeLessThan(MATCH_THRESHOLDS.confident);
  });

  it("é 0 quando um dos lados não tem conteúdo", () => {
    expect(trigramSimilarity("", "Crase")).toBe(0);
  });
});

describe("slugify", () => {
  it("gera slug estável e legível", () => {
    expect(slugify("Direito Administrativo")).toBe("direito-administrativo");
  });

  it("nunca devolve string vazia", () => {
    expect(slugify("!!!")).toBe("item");
  });
});

describe("limiares de casamento", () => {
  it("são conservadores: falso negativo vai para a fila, falso positivo é silencioso", () => {
    expect(MATCH_THRESHOLDS.confident).toBeGreaterThan(MATCH_THRESHOLDS.ambiguous);
    expect(MATCH_THRESHOLDS.confident).toBeGreaterThanOrEqual(0.8);
  });
});
