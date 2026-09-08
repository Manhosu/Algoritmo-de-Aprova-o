import { describe, expect, it } from "vitest";

import { buildLevelRanges, formatLevelRange } from "./level-ranges";

const NIVEIS = [
  { levelNumber: 1, name: "Semente", minXp: 0 },
  { levelNumber: 2, name: "Broto", minXp: 1000 },
  { levelNumber: 3, name: "Árvore", minXp: 5000 },
];

describe("buildLevelRanges", () => {
  it("deriva o teto de cada nível do começo do seguinte", () => {
    const r = buildLevelRanges(NIVEIS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.ranges.map((f) => f.maxXp)).toEqual([999, 4999, null]);
  });

  it("o último nível NÃO tem teto", () => {
    /* É o que faz "10.000+" existir sem um número mágico no código. */
    const r = buildLevelRanges(NIVEIS);
    if (!r.ok) throw new Error("deveria ter passado");
    expect(r.ranges.at(-1)?.maxXp).toBeNull();
  });

  it("EXIGE que o primeiro comece em zero", () => {
    /*
      `levelProgress` toma o nível de menor minXp como o de quem não alcançou
      nenhum. Começando em 100, um aluno com 40 XP cairia nele mesmo assim: a
      tela diria "100 a 999" para quem tem 40, e a barra ficaria negativa.
    */
    const r = buildLevelRanges([{ levelNumber: 1, name: "Semente", minXp: 100 }]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems[0]).toContain("0 XP");
  });

  it("recusa nível que não sobe em relação ao anterior", () => {
    const r = buildLevelRanges([
      { levelNumber: 1, name: "Semente", minXp: 0 },
      { levelNumber: 2, name: "Broto", minXp: 1000 },
      { levelNumber: 3, name: "Árvore", minXp: 1000 },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems[0]).toContain("Árvore");
  });

  it("recusa XP negativo ou quebrado", () => {
    const r = buildLevelRanges([
      { levelNumber: 1, name: "Semente", minXp: 0 },
      { levelNumber: 2, name: "Broto", minXp: -5 },
      { levelNumber: 3, name: "Árvore", minXp: 1.5 },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems).toHaveLength(3); // dois inválidos + o que não sobe
  });

  it("junta TODOS os problemas, não só o primeiro", () => {
    /*
      Quem ajusta cinco níveis de uma vez precisa ver quais linhas estão erradas.
      Parar no primeiro erro obriga a descobrir uma por tentativa.
    */
    const r = buildLevelRanges([
      { levelNumber: 1, name: "Semente", minXp: 50 },
      { levelNumber: 2, name: "Broto", minXp: 40 },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems.length).toBeGreaterThan(1);
  });

  it("aceita reordenar: valida pela numeração, não pela ordem recebida", () => {
    const r = buildLevelRanges([...NIVEIS].reverse());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ranges.map((f) => f.levelNumber)).toEqual([1, 2, 3]);
  });
});

describe("formatLevelRange", () => {
  it("escreve a faixa como o aluno lê", () => {
    expect(
      formatLevelRange({ levelNumber: 1, name: "x", minXp: 0, maxXp: 999 }),
    ).toBe("0 a 999");

    expect(
      formatLevelRange({ levelNumber: 5, name: "x", minXp: 10000, maxXp: null }),
    ).toBe("10.000+");
  });
});
