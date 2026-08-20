import { describe, expect, it } from "vitest";

import { DEFAULT_SCHEDULE_PARAMS } from "@/modules/engine-config/schemas";
import type { CivilDate } from "@/modules/shared/dates";

import {
  canEngineReschedule,
  explainRecalculation,
  moveScheduleEntry,
  projectSchedule,
  requiresFullProjection,
  type PendingTopic,
  type ProjectScheduleInput,
  type ScheduleEntry,
  type WeeklyAvailability,
} from "./index";

const d = (v: string) => v as CivilDate;
const HOJE = d("2026-08-20"); // quinta-feira

/** 1h de segunda a sexta, 4h no sábado, nada no domingo. */
const DISPONIBILIDADE: WeeklyAvailability[] = [
  { weekday: 0, minutesAvailable: 0 },
  { weekday: 1, minutesAvailable: 60 },
  { weekday: 2, minutesAvailable: 60 },
  { weekday: 3, minutesAvailable: 60 },
  { weekday: 4, minutesAvailable: 60 },
  { weekday: 5, minutesAvailable: 60 },
  { weekday: 6, minutesAvailable: 240 },
];

function topic(id: string, minutes: number, priority = 0.5): PendingTopic {
  return {
    planTopicId: id,
    planSubjectId: "s1",
    subjectName: "Disciplina",
    topicName: `Assunto ${id}`,
    remainingMinutes: minutes,
    priorityScore: priority,
  };
}

function input(overrides: Partial<ProjectScheduleInput> = {}): ProjectScheduleInput {
  return {
    today: HOJE,
    examDate: d("2026-11-15"),
    examDateIsEstimated: false,
    availability: DISPONIBILIDADE,
    pendingTopics: [topic("a", 300), topic("b", 300)],
    averageReviewMinutesPerDay: 0,
    scheduleParams: DEFAULT_SCHEDULE_PARAMS,
    ...overrides,
  };
}

describe("projectSchedule — horizonte", () => {
  it("projeta até a data da prova", () => {
    const projecao = projectSchedule(input());
    expect(projecao.horizonEnd).toBe("2026-11-15");
    expect(projecao.hasExamDate).toBe(true);
    expect(projecao.summary.daysRemaining).toBe(87);
  });

  it("SEM DATA DE PROVA usa horizonte de projeção, não desiste", () => {
    const projecao = projectSchedule(input({ examDate: null }));
    expect(projecao.hasExamDate).toBe(false);
    expect(projecao.summary.daysRemaining).toBe(90);
  });

  it("prova já passada cai no horizonte de projeção", () => {
    const projecao = projectSchedule(input({ examDate: d("2026-01-01") }));
    expect(projecao.summary.daysRemaining).toBe(90);
  });

  it("não desenha semanas vazias depois de distribuir tudo", () => {
    // 600 minutos cabem em pouco mais de uma semana; não faz sentido desenhar
    // 12 semanas em branco.
    const projecao = projectSchedule(input());
    expect(projecao.weeks.length).toBeLessThan(5);
    expect(projecao.weeks.at(-1)!.topics.length).toBeGreaterThan(0);
  });
});

describe("projectSchedule — viabilidade", () => {
  it("A PERGUNTA MAIS ÚTIL: diz quando o conteúdo NÃO cabe", () => {
    // 200 horas de conteúdo, ~1h por dia útil até a prova. Não cabe.
    const projecao = projectSchedule(
      input({
        pendingTopics: Array.from({ length: 100 }, (_, i) => topic(`t${i}`, 120)),
      }),
    );

    expect(projecao.feasibility.fits).toBe(false);
    expect(projecao.feasibility.loadRatio).toBeGreaterThan(1);
    expect(projecao.feasibility.message).toContain("não cabe");
  });

  it("a mensagem é específica: quantos minutos a mais por dia", () => {
    // "Não cabe" sem número não ajuda ninguém a decidir o que fazer.
    const projecao = projectSchedule(
      input({ pendingTopics: Array.from({ length: 100 }, (_, i) => topic(`t${i}`, 120)) }),
    );
    expect(projecao.feasibility.extraMinutesPerDayNeeded).toBeGreaterThan(0);
    expect(projecao.feasibility.message).toMatch(/\d+ minutos a mais por dia/);
  });

  it("diz quais assuntos ficariam de fora, cortando pelos menos prioritários", () => {
    const projecao = projectSchedule(
      input({
        examDate: d("2026-09-01"),
        pendingTopics: [
          topic("critico", 600, 0.95),
          topic("medio", 600, 0.5),
          topic("baixo", 600, 0.1),
        ],
      }),
    );

    expect(projecao.feasibility.fits).toBe(false);
    // O mais prioritário nunca é o primeiro a ser cortado.
    expect(projecao.feasibility.topicsAtRisk).not.toContain("critico");
    expect(projecao.feasibility.topicsAtRisk).toContain("baixo");
  });

  it("confirma quando cabe", () => {
    const projecao = projectSchedule(input());
    expect(projecao.feasibility.fits).toBe(true);
    expect(projecao.feasibility.topicsAtRisk).toEqual([]);
    expect(projecao.feasibility.message).toContain("cabe");
  });

  it("edital totalmente coberto é reconhecido", () => {
    const projecao = projectSchedule(input({ pendingTopics: [] }));
    expect(projecao.feasibility.fits).toBe(true);
    expect(projecao.feasibility.message).toContain("já foi coberto");
  });

  it("SEM DISPONIBILIDADE INFORMADA, orienta em vez de dividir por zero", () => {
    const projecao = projectSchedule(
      input({
        availability: Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          minutesAvailable: 0,
        })),
      }),
    );
    expect(projecao.feasibility.fits).toBe(false);
    expect(projecao.feasibility.message).toContain("disponibilidade");
    expect(Number.isFinite(projecao.feasibility.extraMinutesPerDayNeeded)).toBe(true);
  });

  it("AS REVISÕES SÃO DESCONTADAS: elas não são negociáveis", () => {
    const semRevisao = projectSchedule(input({ averageReviewMinutesPerDay: 0 }));
    const comRevisao = projectSchedule(input({ averageReviewMinutesPerDay: 30 }));
    expect(comRevisao.feasibility.availableMinutes).toBeLessThan(
      semRevisao.feasibility.availableMinutes,
    );
  });

  it("revisão consumindo o dia inteiro deixa a viabilidade honesta", () => {
    const projecao = projectSchedule(input({ averageReviewMinutesPerDay: 500 }));
    expect(projecao.feasibility.availableMinutes).toBe(0);
    expect(projecao.feasibility.fits).toBe(false);
  });
});

describe("projectSchedule — distribuição semanal", () => {
  it("respeita a disponibilidade de cada dia da semana", () => {
    const projecao = projectSchedule(input());
    // Semana cheia: 5 dias úteis × 60 + sábado 240 = 540.
    const semanaCheia = projecao.weeks.find((w) => w.availableMinutes === 540);
    expect(semanaCheia).toBeDefined();
  });

  it("nunca planeja mais do que o disponível na semana", () => {
    const projecao = projectSchedule(
      input({ pendingTopics: Array.from({ length: 50 }, (_, i) => topic(`t${i}`, 120)) }),
    );
    for (const semana of projecao.weeks) {
      expect(semana.plannedMinutes).toBeLessThanOrEqual(semana.availableMinutes);
    }
  });

  it("distribui os assuntos por prioridade", () => {
    const projecao = projectSchedule(
      input({
        pendingTopics: [topic("baixo", 200, 0.1), topic("alto", 200, 0.9)],
      }),
    );
    expect(projecao.weeks[0].topics[0].planTopicId).toBe("alto");
  });

  it("um assunto grande é fatiado entre semanas", () => {
    const projecao = projectSchedule(input({ pendingTopics: [topic("grande", 2000, 0.9)] }));
    const aparicoes = projecao.weeks.flatMap((w) =>
      w.topics.filter((t) => t.planTopicId === "grande"),
    );
    expect(aparicoes.length).toBeGreaterThan(1);
    const soma = aparicoes.reduce((s, t) => s + t.minutes, 0);
    expect(soma).toBeLessThanOrEqual(2000);
  });

  it("é determinístico", () => {
    const entrada = input();
    expect(projectSchedule(entrada)).toEqual(projectSchedule(entrada));
  });

  it("não quebra com edital vazio", () => {
    const projecao = projectSchedule(input({ pendingTopics: [] }));
    expect(projecao.summary.topicsRemaining).toBe(0);
  });
});

describe("moveScheduleEntry — o aluno manda", () => {
  const item: ScheduleEntry = {
    entryId: "e1",
    planTopicId: "t1",
    scheduledDate: d("2026-08-21"),
    plannedMinutes: 60,
    source: "engine",
    isPinned: false,
    status: "planned",
  };

  it("mover marca como decisão do aluno e trava contra o motor", () => {
    // Sem isso, arrastar um item pareceria não funcionar: ele voltaria sozinho
    // para o lugar assim que o aluno respondesse a próxima questão.
    const { entry } = moveScheduleEntry(item, d("2026-08-25"), {
      alreadyPlannedMinutes: 0,
      availableMinutes: 60,
    });

    expect(entry.scheduledDate).toBe("2026-08-25");
    expect(entry.source).toBe("student_moved");
    expect(entry.isPinned).toBe(true);
    expect(canEngineReschedule(entry)).toBe(false);
  });

  it("estourar o dia AVISA mas não impede", () => {
    // É o dia do aluno; ele pode decidir virar a noite na véspera da prova.
    const { entry, warning } = moveScheduleEntry(item, d("2026-08-25"), {
      alreadyPlannedMinutes: 50,
      availableMinutes: 60,
    });
    expect(entry.scheduledDate).toBe("2026-08-25");
    expect(warning).toContain("acima");
  });

  it("não avisa quando cabe", () => {
    const { warning } = moveScheduleEntry(item, d("2026-08-25"), {
      alreadyPlannedMinutes: 0,
      availableMinutes: 120,
    });
    expect(warning).toBeNull();
  });
});

describe("canEngineReschedule", () => {
  const base: ScheduleEntry = {
    entryId: "e1",
    planTopicId: "t1",
    scheduledDate: d("2026-08-21"),
    plannedMinutes: 60,
    source: "engine",
    isPinned: false,
    status: "planned",
  };

  it("o motor reposiciona o que ele mesmo colocou", () => {
    expect(canEngineReschedule(base)).toBe(true);
  });

  it("não mexe no que o aluno moveu", () => {
    expect(canEngineReschedule({ ...base, source: "student_moved" })).toBe(false);
  });

  it("não mexe no que está fixado", () => {
    expect(canEngineReschedule({ ...base, isPinned: true })).toBe(false);
  });

  it("não mexe no que já foi concluído", () => {
    expect(canEngineReschedule({ ...base, status: "completed" })).toBe(false);
  });
});

describe("recálculo", () => {
  it("só gatilhos estruturais refazem a projeção inteira", () => {
    // Uma resposta muda a prioridade de amanhã, não a carga de novembro.
    expect(requiresFullProjection("question_answered")).toBe(false);
    expect(requiresFullProjection("study_completed")).toBe(false);
    expect(requiresFullProjection("daily_rollover")).toBe(false);

    expect(requiresFullProjection("content_changed")).toBe(true);
    expect(requiresFullProjection("availability_changed")).toBe(true);
    expect(requiresFullProjection("exam_date_changed")).toBe(true);
    expect(requiresFullProjection("engine_config_changed")).toBe(true);
  });

  it("todo gatilho tem explicação para o aluno", () => {
    // Cronograma que muda sem explicação é indistinguível de cronograma
    // quebrado.
    const gatilhos = [
      "initial", "question_answered", "study_completed", "review_completed",
      "student_moved_item", "content_changed", "availability_changed",
      "exam_date_changed", "engine_config_changed", "daily_rollover",
    ] as const;

    for (const gatilho of gatilhos) {
      const mudanca = explainRecalculation(gatilho);
      expect(mudanca.explanation.length).toBeGreaterThan(15);
      expect(mudanca.reason).toBe(gatilho);
    }
  });
});
