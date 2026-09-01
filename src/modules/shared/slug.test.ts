import { describe, expect, it } from "vitest";

import { toSlug } from "./slug";

describe("toSlug", () => {
  it("transforma nome em código", () => {
    expect(toSlug("Mentoria de 30 minutos")).toBe("mentoria-de-30-minutos");
  });

  it("ACENTO VIRA A LETRA SEM ACENTO, nunca hífen", () => {
    /*
      É o caso que motivou a função. Sem o `normalize("NFD")`, "ã" não é um
      diacrítico e escapa do filtro — `[^a-z0-9]` então o troca por hífen e
      "Revisão" vira "revis-o", diferente de "revisao". Como o código é a chave
      natural do item, dois códigos para o mesmo nome criam duas linhas iguais
      na vitrine.
    */
    expect(toSlug("Revisão")).toBe("revisao");
    expect(toSlug("Revisao")).toBe("revisao");
    expect(toSlug("Simulado de Português")).toBe("simulado-de-portugues");
    expect(toSlug("Sessão com a Coordenação")).toBe("sessao-com-a-coordenacao");
  });

  it("colapsa separadores em um hífen só", () => {
    expect(toSlug("Curso  —  avançado / extra")).toBe("curso-avancado-extra");
  });

  it("não começa nem termina com hífen", () => {
    expect(toSlug("  ...Bônus!  ")).toBe("bonus");
  });

  it("respeita o limite sem estourar a coluna do banco", () => {
    // `store_items.code` é varchar(60); um nome longo não pode derrubar o insert.
    expect(toSlug("a".repeat(200)).length).toBe(60);
  });

  it("devolve string vazia quando não sobra nada utilizável", () => {
    // A tela trata vazio como "código obrigatório"; o importante é não explodir.
    expect(toSlug("!!! ??? ---")).toBe("");
  });
});
