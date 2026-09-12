import { describe, expect, it } from "vitest";

import { jaVenceu, quandoEncerrar } from "./cancel-policy";

const AGORA = new Date("2026-09-11T15:00:00Z");
const DAQUI_A_20_DIAS = new Date("2026-10-01T15:00:00Z");
const ONTEM = new Date("2026-09-10T15:00:00Z");

describe("quandoEncerrar", () => {
  it("⚠️ com período pago pela frente, o plano vai até o fim dele", () => {
    expect(quandoEncerrar({ currentPeriodEnd: DAQUI_A_20_DIAS, now: AGORA })).toEqual({
      quando: "fim_do_periodo",
      ate: DAQUI_A_20_DIAS,
    });
  });

  it("período já vencido, ou sem período registrado, encerra na hora", () => {
    expect(quandoEncerrar({ currentPeriodEnd: ONTEM, now: AGORA })).toEqual({ quando: "agora" });
    expect(quandoEncerrar({ currentPeriodEnd: null, now: AGORA })).toEqual({ quando: "agora" });
  });
});

describe("jaVenceu", () => {
  it("só vence a assinatura que o aluno cancelou", () => {
    expect(jaVenceu({ cancelAtPeriodEnd: false, currentPeriodEnd: ONTEM, now: AGORA })).toBe(false);
  });

  it("cancelada, vence no fim do período", () => {
    expect(jaVenceu({ cancelAtPeriodEnd: true, currentPeriodEnd: DAQUI_A_20_DIAS, now: AGORA })).toBe(false);
    expect(jaVenceu({ cancelAtPeriodEnd: true, currentPeriodEnd: ONTEM, now: AGORA })).toBe(true);
  });
});
