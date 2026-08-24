import { describe, expect, it } from "vitest";

import {
  MATCH_THRESHOLDS,
  normalizeText,
  slugify,
  stripEnumeration,
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

/* ========================================================================== *
 * MARCADOR DE ENUMERAÇÃO
 * ========================================================================== */

describe("stripEnumeration", () => {
  /**
   * ⚠️ Estes casos vieram de um edital REAL lido pela IA em 23/08/2026.
   *
   * Sem a remoção do marcador, o casamento daquele edital ficou em 21% — e o
   * aluno teria subido o documento para não receber questão quase nenhuma,
   * enquanto a fila do painel enchia de itens que JÁ tinham correspondência no
   * catálogo. É o pior tipo de falha: silenciosa dos dois lados.
   */
  it("remove a numeração que os editais colocam antes do assunto", () => {
    expect(stripEnumeration("1 Ortografia oficial")).toBe("Ortografia oficial");
    expect(stripEnumeration("2. Ortografia oficial")).toBe("Ortografia oficial");
    expect(stripEnumeration("8.1 Substantivo e adjetivo")).toBe("Substantivo e adjetivo");
    expect(stripEnumeration("2.3.1 Verbo: flexão")).toBe("Verbo: flexão");
    expect(stripEnumeration("1) Licitações")).toBe("Licitações");
    expect(stripEnumeration("1 - Ortografia oficial")).toBe("Ortografia oficial");
  });

  it("remove marcador de letra, romano e traço", () => {
    expect(stripEnumeration("a) Concordância verbal")).toBe("Concordância verbal");
    expect(stripEnumeration("IV - Licitações")).toBe("Licitações");
    expect(stripEnumeration("III. Poderes da administração")).toBe(
      "Poderes da administração",
    );
    expect(stripEnumeration("- Pontuação")).toBe("Pontuação");
    expect(stripEnumeration("• Crase")).toBe("Crase");
  });

  it("NÃO remove número que é conteúdo", () => {
    // Ano tem quatro dígitos e nunca é enumeração de item.
    expect(stripEnumeration("1988 Constituição Federal")).toBe(
      "1988 Constituição Federal",
    );
    // Sem separador, letra solta é palavra.
    expect(stripEnumeration("a crase antes de pronomes")).toBe(
      "a crase antes de pronomes",
    );
    // O número no meio fica: "Arts. 5º ao 17" não é "Arts. 20 ao 30".
    expect(stripEnumeration("Lei 8.112 de 1990")).toBe("Lei 8.112 de 1990");
  });

  it("NÃO remove quando não sobra texto depois", () => {
    // "5" sozinho não é enumeração de nada — é o próprio conteúdo, por
    // estranho que seja. Esvaziar a chave a faria colidir com tudo.
    expect(stripEnumeration("5")).toBe("5");
    expect(stripEnumeration("1.2")).toBe("1.2");
  });
});

describe("normalizeText com enumeração", () => {
  it("faz o item numerado do edital cair na mesma chave do canônico", () => {
    // O caso exato que falhou no edital de teste.
    expect(taxonomyKey("3 Emprego do sinal indicativo de crase.")).toBe(
      taxonomyKey("Emprego do sinal indicativo de crase"),
    );
    expect(taxonomyKey("4 Concordância verbal e nominal.")).toBe(
      taxonomyKey("Concordância verbal e nominal"),
    );
  });
});
