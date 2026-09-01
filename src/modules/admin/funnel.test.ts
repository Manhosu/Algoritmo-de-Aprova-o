import { describe, expect, it } from "vitest";

import { findDropOff, toStage, type FunnelStage } from "./funnel";

const etapa = (label: string, count: number): FunnelStage => ({
  label,
  count,
  percent: 0,
});

describe("findDropOff", () => {
  it("aponta o passo com a maior perda, e não o de menor percentual", () => {
    /*
      A etapa final é a menor de todas em número absoluto. Quem olhasse só o
      percentual concluiria que o problema está no fim. A maior PERDA, porém,
      acontece entre a primeira e a segunda: 60 pessoas contra 15.
    */
    const quedas = findDropOff([
      etapa("Cadastro", 100),
      etapa("Edital", 40),
      etapa("Diagnóstico", 25),
      etapa("Primeira questão", 10),
    ]);

    expect(quedas[0]).toEqual({ stage: "Cadastro → Edital", lost: 60 });
  });

  it("ordena da maior perda para a menor", () => {
    const quedas = findDropOff([
      etapa("A", 100),
      etapa("B", 90),
      etapa("C", 40),
      etapa("D", 38),
    ]);

    expect(quedas.map((q) => q.lost)).toEqual([50, 10, 2]);
  });

  it("omite passos sem perda em vez de listar zero", () => {
    const quedas = findDropOff([etapa("A", 10), etapa("B", 10), etapa("C", 4)]);

    expect(quedas).toEqual([{ stage: "B → C", lost: 6 }]);
  });

  it("não inventa queda quando uma etapa posterior tem mais gente", () => {
    /*
      Acontece de verdade: "voltou no dia seguinte" pode superar "fez a primeira
      revisão", porque as marcas de tempo são gravadas por eventos diferentes e
      não formam uma cadeia estrita. Um subtraendo maior daria número negativo,
      e "-4 pessoas pararam aqui" não é leitura, é ruído.
    */
    const quedas = findDropOff([etapa("A", 10), etapa("B", 14)]);

    expect(quedas).toEqual([]);
  });

  it("não quebra com funil vazio", () => {
    expect(findDropOff([])).toEqual([]);
    expect(findDropOff([etapa("Só uma", 3)])).toEqual([]);
  });
});

describe("toStage", () => {
  it("mede o percentual sobre o total, não sobre a etapa anterior", () => {
    expect(toStage("Edital", 40, 100).percent).toBe(40);
    expect(toStage("Diagnóstico", 25, 100).percent).toBe(25);
  });

  it("devolve zero em vez de NaN quando ainda não há cadastros", () => {
    /*
      Sem cadastro, `count / total` seria 0/0 = NaN, e `width: NaN%` faz a barra
      do funil desaparecer sem erro no console — o pior tipo de falha, porque a
      tela fica plausível.
    */
    const primeiroDia = toStage("Cadastro", 0, 0);

    expect(primeiroDia.percent).toBe(0);
    expect(Number.isNaN(primeiroDia.percent)).toBe(false);
  });
});
