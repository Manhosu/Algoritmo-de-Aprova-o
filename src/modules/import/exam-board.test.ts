import { describe, expect, it } from "vitest";

import { casarBanca, type BancaCadastrada } from "./exam-board";

const BANCAS: BancaCadastrada[] = [
  { id: "1", slug: "cebraspe", shortName: "Cebraspe", name: "Cebraspe" },
  { id: "2", slug: "fcc", shortName: "FCC", name: "Fundação Carlos Chagas" },
  { id: "3", slug: "fgv", shortName: "FGV", name: "Fundação Getulio Vargas" },
  { id: "4", slug: "vunesp", shortName: "VUNESP", name: "VUNESP" },
  { id: "5", slug: "autoral", shortName: "Autoral", name: "Autoral" },
];

const nome = (valor: string | null) => casarBanca(valor, BANCAS)?.shortName ?? null;

describe("casarBanca", () => {
  it("casa o nome exato, em qualquer caixa", () => {
    expect(nome("Cebraspe")).toBe("Cebraspe");
    expect(nome("CEBRASPE")).toBe("Cebraspe");
    expect(nome("vunesp")).toBe("VUNESP");
    expect(nome("Fundação Carlos Chagas")).toBe("FCC");
  });

  it("⚠️ o caso que fez 109 questões entrarem como Autoral", () => {
    expect(nome("CEBRASPE - 2026")).toBe("Cebraspe");
    expect(nome("CESPE")).toBe("Cebraspe");
    expect(nome("CESPE/UnB")).toBe("Cebraspe");
    expect(nome("CESPE/CEBRASPE")).toBe("Cebraspe");
    expect(nome("Banca: Cebraspe (2026)")).toBe("Cebraspe");
  });

  it("não inventa banca a partir de um pedaço de palavra", () => {
    expect(nome("FCCX")).toBeNull();
    expect(nome("Instituto Desconhecido")).toBeNull();
    expect(nome("")).toBeNull();
    expect(nome(null)).toBeNull();
  });

  it("com mais de uma banca citada, vence a correspondência mais longa", () => {
    expect(nome("Fundação Getulio Vargas (FGV)")).toBe("FGV");
  });
});
