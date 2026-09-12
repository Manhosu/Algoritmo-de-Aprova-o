import { describe, expect, it } from "vitest";

import type { CivilDate } from "@/modules/shared/dates";

import {
  lerPrecoEmCentavos,
  promocaoVigente,
  situacaoDaPromocao,
  validarPromocao,
  type Promocao,
} from "./promotions";

const d = (v: string) => v as CivilDate;
const HOJE = d("2026-09-15");

function promocao(parcial: Partial<Promocao> = {}): Promocao {
  return {
    id: "p1",
    planId: "premium",
    billingPeriod: "monthly",
    amountCents: 6990,
    startsOn: d("2026-09-10"),
    endsOn: d("2026-09-20"),
    canceledAt: null,
    ...parcial,
  };
}

describe("situacaoDaPromocao", () => {
  it("vale nas duas pontas, o dia do fim inteiro", () => {
    expect(situacaoDaPromocao(promocao(), d("2026-09-10"))).toBe("vigente");
    expect(situacaoDaPromocao(promocao(), d("2026-09-20"))).toBe("vigente");
  });

  it("antes é agendada, depois é encerrada, e cancelada vence tudo", () => {
    expect(situacaoDaPromocao(promocao(), d("2026-09-09"))).toBe("agendada");
    expect(situacaoDaPromocao(promocao(), d("2026-09-21"))).toBe("encerrada");
    expect(situacaoDaPromocao(promocao({ canceledAt: new Date() }), HOJE)).toBe("cancelada");
  });
});

describe("promocaoVigente", () => {
  it("acha a do plano e do período certos", () => {
    const lista = [
      promocao({ id: "anual", billingPeriod: "annual" }),
      promocao({ id: "outro", planId: "intermediario" }),
      promocao({ id: "certa" }),
    ];

    expect(promocaoVigente(lista, "premium", "monthly", HOJE)?.id).toBe("certa");
  });

  it("encerrada ou cancelada não vale", () => {
    expect(promocaoVigente([promocao({ endsOn: d("2026-09-14") })], "premium", "monthly", HOJE)).toBeNull();
    expect(
      promocaoVigente([promocao({ canceledAt: new Date() })], "premium", "monthly", HOJE),
    ).toBeNull();
  });
});

describe("validarPromocao", () => {
  const contexto = {
    nomeDoPlano: "Premium",
    precoNormalCents: 8990,
    hoje: HOJE,
    existentes: [] as Promocao[],
  };
  const nova = {
    planId: "premium",
    billingPeriod: "monthly" as const,
    amountCents: 6990,
    startsOn: d("2026-09-15"),
    endsOn: d("2026-09-30"),
  };

  it("promoção boa passa", () => {
    expect(validarPromocao(nova, contexto)).toEqual([]);
  });

  it("preço promocional precisa ser menor que o normal", () => {
    expect(validarPromocao({ ...nova, amountCents: 8990 }, contexto)[0]).toMatch(/menor que o normal/);
  });

  it("fim antes do início, ou no passado, é recusado", () => {
    expect(
      validarPromocao({ ...nova, startsOn: d("2026-09-20"), endsOn: d("2026-09-18") }, contexto),
    ).toContain("A data de fim vem antes da de início.");
    expect(
      validarPromocao({ ...nova, startsOn: d("2026-09-01"), endsOn: d("2026-09-10") }, contexto),
    ).toContain("A promoção terminaria no passado.");
  });

  it("⚠️ duas promoções do mesmo plano e período não se sobrepõem", () => {
    const problemas = validarPromocao(nova, {
      ...contexto,
      existentes: [promocao({ startsOn: d("2026-09-25"), endsOn: d("2026-10-05") })],
    });

    expect(problemas.join(" ")).toMatch(/Já existe uma promoção do Premium mensal/);
  });

  it("promoção cancelada não bloqueia uma nova nas mesmas datas", () => {
    expect(
      validarPromocao(nova, {
        ...contexto,
        existentes: [promocao({ canceledAt: new Date(), startsOn: d("2026-09-15"), endsOn: d("2026-09-30") })],
      }),
    ).toEqual([]);
  });
});

describe("lerPrecoEmCentavos", () => {
  it.each([
    ["69,90", 6990],
    ["R$ 69,90", 6990],
    ["69.90", 6990],
    ["69", 6900],
    ["1.234,56", 123456],
  ])("%s → %i centavos", (texto, centavos) => {
    expect(lerPrecoEmCentavos(texto)).toBe(centavos);
  });

  it("o que não é preço vira nulo", () => {
    expect(lerPrecoEmCentavos("")).toBeNull();
    expect(lerPrecoEmCentavos("abc")).toBeNull();
    expect(lerPrecoEmCentavos("69,999")).toBeNull();
  });
});
