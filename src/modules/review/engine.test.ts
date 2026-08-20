import { describe, expect, it } from "vitest";

import { DEFAULT_REVIEW_INTERVALS } from "@/modules/engine-config/schemas";
import type { CivilDate } from "@/modules/shared/dates";

import {
  completeReview,
  countUpcomingReviews,
  reviewAdherence,
  selectDueReviews,
  startReviewSeries,
} from "./engine";

const SP = "America/Sao_Paulo";
const d = (value: string) => value as CivilDate;

/** 20/08/2026, 14h em São Paulo. */
const ESTUDO = new Date("2026-08-20T17:00:00Z");

describe("startReviewSeries", () => {
  it("agenda as 5 etapas do README: 24h, 7, 30, 60 e 90 dias", () => {
    const serie = startReviewSeries({
      studyCompletedAt: ESTUDO,
      intervals: DEFAULT_REVIEW_INTERVALS,
      timeZone: SP,
    });

    expect(serie.totalStages).toBe(5);
    const todas = [serie.firstStage, ...serie.projectedStages];
    expect(todas.map((s) => s.intervalDays)).toEqual([1, 7, 30, 60, 90]);
    expect(todas.map((s) => s.dueDate)).toEqual([
      "2026-08-21",
      "2026-08-27",
      "2026-09-19",
      "2026-10-19",
      "2026-11-18",
    ]);
  });

  it("só a primeira etapa nasce agendada", () => {
    const serie = startReviewSeries({
      studyCompletedAt: ESTUDO,
      intervals: DEFAULT_REVIEW_INTERVALS,
      timeZone: SP,
    });
    expect(serie.firstStage.stageIndex).toBe(0);
    expect(serie.projectedStages).toHaveLength(4);
  });

  it("a revisão vence à meia-noite do fuso do aluno, não em UTC", () => {
    const serie = startReviewSeries({
      studyCompletedAt: ESTUDO,
      intervals: DEFAULT_REVIEW_INTERVALS,
      timeZone: SP,
    });
    // Meia-noite de 21/08 em São Paulo = 03:00Z.
    expect(serie.firstStage.dueAt.toISOString()).toBe("2026-08-21T03:00:00.000Z");
  });

  it("estudar tarde da noite não empurra a revisão para depois de amanhã", () => {
    // 20/08 às 23h em SP = 21/08 02:00Z. Em UTC já é dia 21;
    // a primeira revisão tem que ser dia 21, não dia 22.
    const serie = startReviewSeries({
      studyCompletedAt: new Date("2026-08-21T02:00:00Z"),
      intervals: DEFAULT_REVIEW_INTERVALS,
      timeZone: SP,
    });
    expect(serie.firstStage.dueDate).toBe("2026-08-21");
  });

  it("respeita uma curva configurada diferente da padrão", () => {
    const serie = startReviewSeries({
      studyCompletedAt: ESTUDO,
      intervals: { ...DEFAULT_REVIEW_INTERVALS, intervalsInDays: [2, 10, 45] },
      timeZone: SP,
    });
    expect(serie.totalStages).toBe(3);
    expect([serie.firstStage, ...serie.projectedStages].map((s) => s.dueDate)).toEqual([
      "2026-08-22",
      "2026-08-30",
      "2026-10-04",
    ]);
  });
});

describe("completeReview", () => {
  it("no prazo: não marca atraso e agenda a etapa seguinte", () => {
    const resultado = completeReview({
      occurrence: { stageIndex: 0, dueDate: d("2026-08-21") },
      completedAt: new Date("2026-08-21T15:00:00Z"), // 12h em SP
      intervals: DEFAULT_REVIEW_INTERVALS,
      timeZone: SP,
    });

    expect(resultado.isLate).toBe(false);
    expect(resultado.daysLate).toBe(0);
    expect(resultado.nextStage?.stageIndex).toBe(1);
    expect(resultado.nextStage?.dueDate).toBe("2026-08-28"); // 21/08 + 7
  });

  it("A REGRA DO ATRASO: o próximo intervalo conta da execução real", () => {
    // Vencia 21/08, foi feita 31/08 — 10 dias de atraso.
    const resultado = completeReview({
      occurrence: { stageIndex: 0, dueDate: d("2026-08-21") },
      completedAt: new Date("2026-08-31T15:00:00Z"),
      intervals: DEFAULT_REVIEW_INTERVALS,
      timeZone: SP,
    });

    expect(resultado.daysLate).toBe(10);
    // A etapa 2 é 31/08 + 7 = 07/09. NÃO é 21/08 + 7 = 28/08, que já teria
    // vencido no momento em que foi criada.
    expect(resultado.nextStage?.dueDate).toBe("2026-09-07");
  });

  it("a revisão seguinte de quem atrasou nunca nasce vencida", () => {
    const resultado = completeReview({
      occurrence: { stageIndex: 0, dueDate: d("2026-08-21") },
      completedAt: new Date("2026-10-01T15:00:00Z"), // 41 dias de atraso
      intervals: DEFAULT_REVIEW_INTERVALS,
      timeZone: SP,
    });
    expect(resultado.daysLate).toBe(41);
    expect(resultado.nextStage!.dueDate > "2026-10-01").toBe(true);
  });

  it("com countNextFromCompletion desligado, conta da data prevista", () => {
    const resultado = completeReview({
      occurrence: { stageIndex: 0, dueDate: d("2026-08-21") },
      completedAt: new Date("2026-08-31T15:00:00Z"),
      intervals: { ...DEFAULT_REVIEW_INTERVALS, countNextFromCompletion: false },
      timeZone: SP,
    });
    expect(resultado.nextStage?.dueDate).toBe("2026-08-28");
  });

  it("revisar adiantado não gera atraso negativo", () => {
    const resultado = completeReview({
      occurrence: { stageIndex: 1, dueDate: d("2026-08-27") },
      completedAt: new Date("2026-08-25T15:00:00Z"),
      intervals: DEFAULT_REVIEW_INTERVALS,
      timeZone: SP,
    });
    expect(resultado.daysLate).toBe(0);
    expect(resultado.isLate).toBe(false);
  });

  it("a última etapa encerra a série", () => {
    const resultado = completeReview({
      occurrence: { stageIndex: 4, dueDate: d("2026-11-18") },
      completedAt: new Date("2026-11-18T15:00:00Z"),
      intervals: DEFAULT_REVIEW_INTERVALS,
      timeZone: SP,
    });
    expect(resultado.nextStage).toBeNull();
    expect(resultado.seriesCompleted).toBe(true);
  });

  it("desempenho ruim NÃO reinicia o ciclo no Marco 1", () => {
    const resultado = completeReview({
      occurrence: { stageIndex: 2, dueDate: d("2026-09-19") },
      completedAt: new Date("2026-09-19T15:00:00Z"),
      intervals: DEFAULT_REVIEW_INTERVALS,
      timeZone: SP,
      performanceRating: "hard",
    });
    // Avança para a etapa 3, não volta para a 0.
    expect(resultado.nextStage?.stageIndex).toBe(3);
  });

  it("uma série inteira, do estudo à última revisão, sempre avança no tempo", () => {
    let dueDate = startReviewSeries({
      studyCompletedAt: ESTUDO,
      intervals: DEFAULT_REVIEW_INTERVALS,
      timeZone: SP,
    }).firstStage.dueDate;

    const datas: string[] = [dueDate];
    for (let stage = 0; stage < 4; stage++) {
      const resultado = completeReview({
        occurrence: { stageIndex: stage, dueDate },
        // sempre 2 dias atrasado
        completedAt: new Date(`${dueDate}T15:00:00Z`),
        intervals: DEFAULT_REVIEW_INTERVALS,
        timeZone: SP,
      });
      dueDate = resultado.nextStage!.dueDate;
      datas.push(dueDate);
    }

    for (let i = 1; i < datas.length; i++) {
      expect(datas[i] > datas[i - 1]).toBe(true);
    }
  });
});

describe("selectDueReviews", () => {
  const hoje = d("2026-08-25");

  const ocorrencias = [
    { id: "vence-hoje", dueDate: d("2026-08-25"), status: "scheduled" },
    { id: "atrasada-4", dueDate: d("2026-08-21"), status: "scheduled" },
    { id: "atrasada-1", dueDate: d("2026-08-24"), status: "scheduled" },
    { id: "futura", dueDate: d("2026-08-30"), status: "scheduled" },
    { id: "ja-feita", dueDate: d("2026-08-20"), status: "completed" },
    { id: "cancelada", dueDate: d("2026-08-19"), status: "canceled" },
  ];

  it("inclui as vencidas hoje e as atrasadas — atrasada ACUMULA, não some", () => {
    const devidas = selectDueReviews(ocorrencias, hoje);
    expect(devidas.map((r) => r.occurrence.id)).toEqual([
      "atrasada-4",
      "atrasada-1",
      "vence-hoje",
    ]);
  });

  it("ordena as mais atrasadas primeiro", () => {
    const devidas = selectDueReviews(ocorrencias, hoje);
    expect(devidas.map((r) => r.daysLate)).toEqual([4, 1, 0]);
  });

  it("não inclui futuras, concluídas nem canceladas", () => {
    const ids = selectDueReviews(ocorrencias, hoje).map((r) => r.occurrence.id);
    expect(ids).not.toContain("futura");
    expect(ids).not.toContain("ja-feita");
    expect(ids).not.toContain("cancelada");
  });

  it("marca corretamente o que está atrasado", () => {
    const devidas = selectDueReviews(ocorrencias, hoje);
    expect(devidas.map((r) => r.isLate)).toEqual([true, true, false]);
  });

  it("devolve lista vazia quando não há nada devido", () => {
    expect(selectDueReviews(ocorrencias, d("2026-08-01"))).toEqual([]);
  });
});

describe("countUpcomingReviews", () => {
  it("agrupa por dia dentro do horizonte", () => {
    const contagem = countUpcomingReviews(
      [
        { dueDate: d("2026-08-25"), status: "scheduled" },
        { dueDate: d("2026-08-25"), status: "scheduled" },
        { dueDate: d("2026-08-27"), status: "scheduled" },
        { dueDate: d("2026-09-30"), status: "scheduled" }, // fora do horizonte
      ],
      d("2026-08-25"),
      14,
    );

    expect(contagem.get(d("2026-08-25"))).toBe(2);
    expect(contagem.get(d("2026-08-27"))).toBe(1);
    expect(contagem.has(d("2026-09-30"))).toBe(false);
  });

  it("conta as atrasadas como se vencessem hoje — é quando aparecem na tela", () => {
    const contagem = countUpcomingReviews(
      [
        { dueDate: d("2026-08-10"), status: "scheduled" },
        { dueDate: d("2026-08-12"), status: "scheduled" },
      ],
      d("2026-08-25"),
      14,
    );
    expect(contagem.get(d("2026-08-25"))).toBe(2);
  });
});

describe("reviewAdherence", () => {
  it("conta no prazo e atrasadas separadamente", () => {
    const resultado = reviewAdherence(
      [{ daysLate: 0 }, { daysLate: 0 }, { daysLate: 3 }, { daysLate: 12 }],
      1,
    );
    expect(resultado).toMatchObject({ total: 5, onTime: 2, late: 2, skipped: 1 });
    expect(resultado.percent).toBe(40);
  });

  it("aluno novo começa em 100, não em zero", () => {
    // Um aluno sem nenhuma revisão devida ainda não falhou em nada.
    expect(reviewAdherence([], 0).percent).toBe(100);
  });

  it("100% quando tudo foi feito no prazo", () => {
    expect(reviewAdherence([{ daysLate: 0 }, { daysLate: 0 }], 0).percent).toBe(100);
  });
});

describe("independência do Motor 1", () => {
  it("mudar os pesos da Tarefa do Dia não move NENHUMA data de revisão", () => {
    // Este teste existe para quebrar se alguém acoplar os dois motores.
    // O Motor 2 não recebe pesos: a única forma de este teste falhar é se
    // alguém introduzir essa dependência.
    const serieA = startReviewSeries({
      studyCompletedAt: ESTUDO,
      intervals: DEFAULT_REVIEW_INTERVALS,
      timeZone: SP,
    });
    const serieB = startReviewSeries({
      studyCompletedAt: ESTUDO,
      intervals: DEFAULT_REVIEW_INTERVALS,
      timeZone: SP,
    });

    expect(serieA).toEqual(serieB);
    expect(Object.keys(DEFAULT_REVIEW_INTERVALS)).not.toContain("performance");
    expect(Object.keys(DEFAULT_REVIEW_INTERVALS)).not.toContain("urgency");
  });

  it("a revisão vence mesmo com o dia cheio — ela não disputa espaço", () => {
    // O motor não recebe minutos disponíveis. Não há como o dia cheio
    // suprimir uma revisão, porque o dia não é entrada deste cálculo.
    const devidas = selectDueReviews(
      [{ dueDate: d("2026-08-25"), status: "scheduled" }],
      d("2026-08-25"),
    );
    expect(devidas).toHaveLength(1);
  });
});
