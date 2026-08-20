import { describe, expect, it } from "vitest";

import {
  addDays,
  civilDaysSince,
  daysBetween,
  isCivilDate,
  startOfCivilDay,
  toCivilDate,
  toLocalHour,
  weekdayOf,
  type CivilDate,
} from "./dates";

const SP = "America/Sao_Paulo";

describe("isCivilDate", () => {
  it("aceita data válida", () => {
    expect(isCivilDate("2026-08-20")).toBe(true);
  });

  it("rejeita data que não existe no calendário", () => {
    expect(isCivilDate("2026-02-31")).toBe(false);
    expect(isCivilDate("2025-02-29")).toBe(false);
  });

  it("aceita 29 de fevereiro em ano bissexto", () => {
    expect(isCivilDate("2028-02-29")).toBe(true);
  });

  it("rejeita formato errado", () => {
    expect(isCivilDate("20/08/2026")).toBe(false);
    expect(isCivilDate("2026-8-20")).toBe(false);
  });
});

describe("toCivilDate", () => {
  it("converte instante para o dia civil no fuso do aluno", () => {
    // 20/08/2026 às 12:00 UTC = 09:00 em São Paulo
    expect(toCivilDate(new Date("2026-08-20T12:00:00Z"), SP)).toBe("2026-08-20");
  });

  it("ainda é ontem em São Paulo quando já é hoje em UTC", () => {
    // 21/08 às 02:00 UTC = 20/08 às 23:00 em São Paulo.
    // É por isso que a Tarefa do Dia não pode usar UTC: ela viraria três
    // horas antes da meia-noite do aluno.
    expect(toCivilDate(new Date("2026-08-21T02:00:00Z"), SP)).toBe("2026-08-20");
  });

  it("vira o dia exatamente à meia-noite local", () => {
    expect(toCivilDate(new Date("2026-08-21T02:59:59Z"), SP)).toBe("2026-08-20");
    expect(toCivilDate(new Date("2026-08-21T03:00:00Z"), SP)).toBe("2026-08-21");
  });
});

describe("toLocalHour", () => {
  it("devolve a hora local, não a UTC", () => {
    expect(toLocalHour(new Date("2026-08-20T12:00:00Z"), SP)).toBe(9);
  });

  it("trata a meia-noite como 0, nunca como 24", () => {
    expect(toLocalHour(new Date("2026-08-21T03:00:00Z"), SP)).toBe(0);
  });

  it("cobre as 24 faixas do Horário de Ouro", () => {
    const horas = new Set<number>();
    for (let h = 0; h < 24; h++) {
      const instante = new Date(Date.UTC(2026, 7, 20, h, 30));
      horas.add(toLocalHour(instante, SP));
    }
    expect(horas.size).toBe(24);
  });
});

describe("addDays", () => {
  it("soma dias simples", () => {
    expect(addDays("2026-08-20" as CivilDate, 1)).toBe("2026-08-21");
    expect(addDays("2026-08-20" as CivilDate, 7)).toBe("2026-08-27");
  });

  it("atravessa a virada de mês", () => {
    expect(addDays("2026-08-31" as CivilDate, 1)).toBe("2026-09-01");
  });

  it("atravessa a virada de ano", () => {
    expect(addDays("2026-12-31" as CivilDate, 1)).toBe("2027-01-01");
  });

  it("aceita valores negativos", () => {
    expect(addDays("2026-09-01" as CivilDate, -1)).toBe("2026-08-31");
  });

  it("acerta o ano bissexto", () => {
    expect(addDays("2028-02-28" as CivilDate, 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28" as CivilDate, 1)).toBe("2027-03-01");
  });

  it("os intervalos de revisão caem nos dias certos", () => {
    const estudo = "2026-08-20" as CivilDate;
    expect([1, 7, 30, 60, 90].map((d) => addDays(estudo, d))).toEqual([
      "2026-08-21",
      "2026-08-27",
      "2026-09-19",
      "2026-10-19",
      "2026-11-18",
    ]);
  });

  it("não pula nem repete dia na mudança de horário de verão", () => {
    // O horário de verão brasileiro foi extinto, mas a aritmética precisa
    // continuar correta caso volte ou caso o aluno esteja em outro fuso.
    // Somar 1 dia 400 vezes tem que dar exatamente 400 dias de diferença.
    let data = "2026-01-01" as CivilDate;
    for (let i = 0; i < 400; i++) data = addDays(data, 1);
    expect(daysBetween("2026-01-01" as CivilDate, data)).toBe(400);
  });
});

describe("daysBetween", () => {
  it("conta dias inteiros", () => {
    expect(daysBetween("2026-08-20" as CivilDate, "2026-08-27" as CivilDate)).toBe(7);
  });

  it("é negativo quando a segunda data é anterior", () => {
    expect(daysBetween("2026-08-27" as CivilDate, "2026-08-20" as CivilDate)).toBe(-7);
  });

  it("é zero para a mesma data", () => {
    expect(daysBetween("2026-08-20" as CivilDate, "2026-08-20" as CivilDate)).toBe(0);
  });

  it("calcula a contagem regressiva para a prova", () => {
    expect(daysBetween("2026-08-20" as CivilDate, "2026-11-15" as CivilDate)).toBe(87);
  });
});

describe("weekdayOf", () => {
  it("usa a convenção 0 = domingo", () => {
    // 20/08/2026 é uma quinta-feira.
    expect(weekdayOf("2026-08-20" as CivilDate)).toBe(4);
    expect(weekdayOf("2026-08-23" as CivilDate)).toBe(0); // domingo
    expect(weekdayOf("2026-08-22" as CivilDate)).toBe(6); // sábado
  });
});

describe("startOfCivilDay", () => {
  it("devolve a meia-noite local, não a UTC", () => {
    const inicio = startOfCivilDay("2026-08-20" as CivilDate, SP);
    expect(toCivilDate(inicio, SP)).toBe("2026-08-20");
    expect(toLocalHour(inicio, SP)).toBe(0);
  });

  it("o instante anterior ainda pertence ao dia anterior", () => {
    const inicio = startOfCivilDay("2026-08-20" as CivilDate, SP);
    const umMsAntes = new Date(inicio.getTime() - 1);
    expect(toCivilDate(umMsAntes, SP)).toBe("2026-08-19");
  });

  it("funciona em fuso com horário de verão ativo", () => {
    const inicio = startOfCivilDay("2026-06-15" as CivilDate, "America/New_York");
    expect(toCivilDate(inicio, "America/New_York")).toBe("2026-06-15");
    expect(toLocalHour(inicio, "America/New_York")).toBe(0);
  });

  it("acerta o próprio dia da virada do horário de verão", () => {
    // 8/3/2026 é o domingo em que os EUA adiantam o relógio às 2h.
    const inicio = startOfCivilDay("2026-03-08" as CivilDate, "America/New_York");
    expect(toCivilDate(inicio, "America/New_York")).toBe("2026-03-08");
    expect(toLocalHour(inicio, "America/New_York")).toBe(0);
  });
});

describe("civilDaysSince", () => {
  it("mede em dias civis, não em horas", () => {
    // Ontem às 23h e hoje às 1h distam 2 horas, mas são 1 dia civil —
    // que é como o aluno percebe "estudei ontem".
    const ontemTarde = new Date("2026-08-21T01:00:00Z"); // 20/08 22:00 em SP
    const hojeCedo = new Date("2026-08-21T04:00:00Z"); // 21/08 01:00 em SP
    expect(civilDaysSince(ontemTarde, hojeCedo, SP)).toBe(1);
  });

  it("é zero dentro do mesmo dia civil", () => {
    const manha = new Date("2026-08-20T12:00:00Z");
    const noite = new Date("2026-08-21T01:00:00Z");
    expect(civilDaysSince(manha, noite, SP)).toBe(0);
  });
});
