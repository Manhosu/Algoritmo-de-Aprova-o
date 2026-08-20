import { describe, expect, it } from "vitest";

import { DEFAULT_XP_VALUES } from "@/modules/engine-config/schemas";
import type { CivilDate } from "@/modules/shared/dates";

import {
  balanceFromLedger,
  computeMissionProgress,
  computeStreak,
  levelProgress,
  sumXp,
  xpForQuestion,
  xpForReview,
  xpForStudy,
  xpIdempotencyKey,
  type Level,
} from "./index";

const d = (v: string) => v as CivilDate;

/** Os cinco níveis do README, como o seed cria. */
const NIVEIS: Level[] = [
  { levelNumber: 1, code: "iniciante", name: "Iniciante", emoji: "🌱", minXp: 0, maxXp: 999 },
  { levelNumber: 2, code: "competitivo", name: "Competitivo", emoji: "🎯", minXp: 1000, maxXp: 2999 },
  { levelNumber: 3, code: "estrategista", name: "Estrategista", emoji: "🧠", minXp: 3000, maxXp: 5999 },
  { levelNumber: 4, code: "elite", name: "Elite", emoji: "🔥", minXp: 6000, maxXp: 9999 },
  { levelNumber: 5, code: "implacavel", name: "Implacável", emoji: "👑", minXp: 10000, maxXp: null },
];

describe("XP por atividade", () => {
  it("ACERTAR VALE MAIS QUE APENAS RESPONDER", () => {
    // README 2.3: questão respondida +5, acerto soma +5 de bônus = 10.
    const errou = sumXp(xpForQuestion(false, DEFAULT_XP_VALUES));
    const acertou = sumXp(xpForQuestion(true, DEFAULT_XP_VALUES));

    expect(errou).toBe(5);
    expect(acertou).toBe(10);
    expect(acertou).toBeGreaterThan(errou);
  });

  it("acerto gera DUAS entradas, não uma soma", () => {
    // Sem separar, "quanto do meu XP veio de acertar?" não teria resposta, e
    // um estorno de questão anulada não saberia o que devolver.
    const entradas = xpForQuestion(true, DEFAULT_XP_VALUES);
    expect(entradas).toHaveLength(2);
    expect(entradas.map((e) => e.activity)).toEqual([
      "question_answered",
      "question_correct_bonus",
    ]);
  });

  it("usa os valores do README", () => {
    expect(sumXp(xpForStudy(DEFAULT_XP_VALUES))).toBe(30);
    expect(sumXp(xpForReview(DEFAULT_XP_VALUES))).toBe(40);
  });

  it("respeita valores editados no painel", () => {
    const outros = { ...DEFAULT_XP_VALUES, questionAnswered: 3, correctBonus: 12 };
    expect(sumXp(xpForQuestion(true, outros))).toBe(15);
    // A regra de que acertar vale mais continua valendo com outros valores.
    expect(sumXp(xpForQuestion(true, outros))).toBeGreaterThan(
      sumXp(xpForQuestion(false, outros)),
    );
  });
});

describe("levelProgress", () => {
  it("usa os nomes e faixas exatos do README", () => {
    const casos: Array<[number, string]> = [
      [0, "Iniciante"],
      [999, "Iniciante"],
      [1000, "Competitivo"],
      [2999, "Competitivo"],
      [3000, "Estrategista"],
      [5999, "Estrategista"],
      [6000, "Elite"],
      [9999, "Elite"],
      [10000, "Implacável"],
      [999999, "Implacável"],
    ];

    for (const [xp, nome] of casos) {
      expect(levelProgress(xp, NIVEIS).current.name).toBe(nome);
    }
  });

  it("calcula quanto falta para o próximo nível", () => {
    // O mockup mostrava "Faltam 1.260 XP para o próximo nível".
    const progresso = levelProgress(1740, NIVEIS);
    expect(progresso.current.name).toBe("Competitivo");
    expect(progresso.next?.name).toBe("Estrategista");
    expect(progresso.xpToNextLevel).toBe(1260);
  });

  it("a barra de progresso vai de 0 a 100 dentro do nível", () => {
    expect(levelProgress(1000, NIVEIS).percentToNext).toBe(0);
    expect(levelProgress(2000, NIVEIS).percentToNext).toBe(50);
    expect(levelProgress(2999, NIVEIS).percentToNext).toBe(100);
  });

  it("NO ÚLTIMO NÍVEL a barra fica cheia, não vazia", () => {
    // Mostrar barra vazia no nível máximo pareceria regressão.
    const progresso = levelProgress(50000, NIVEIS);
    expect(progresso.next).toBeNull();
    expect(progresso.xpToNextLevel).toBeNull();
    expect(progresso.percentToNext).toBe(100);
  });

  it("XP negativo não quebra nem rebaixa abaixo do primeiro nível", () => {
    expect(levelProgress(-500, NIVEIS).current.name).toBe("Iniciante");
  });

  it("aceita uma escada de níveis diferente, sem hardcode", () => {
    const outros: Level[] = [
      { levelNumber: 1, code: "a", name: "A", emoji: null, minXp: 0, maxXp: 499 },
      { levelNumber: 2, code: "b", name: "B", emoji: null, minXp: 500, maxXp: null },
    ];
    expect(levelProgress(600, outros).current.name).toBe("B");
  });

  it("sem níveis configurados, falha alto em vez de exibir errado", () => {
    expect(() => levelProgress(100, [])).toThrow(/nível/i);
  });
});

describe("computeStreak", () => {
  const hoje = d("2026-08-20");

  it("conta dias consecutivos", () => {
    const streak = computeStreak(
      [d("2026-08-18"), d("2026-08-19"), d("2026-08-20")],
      hoje,
    );
    expect(streak.current).toBe(3);
  });

  it("A SEQUÊNCIA NÃO CAI À MEIA-NOITE: estudou ontem, ainda está viva", () => {
    // Exigir atividade hoje zeraria o streak de todo mundo às 00h01, antes de
    // a pessoa ter tido chance de estudar.
    const streak = computeStreak([d("2026-08-18"), d("2026-08-19")], hoje);
    expect(streak.current).toBe(2);
    expect(streak.atRisk).toBe(true);
  });

  it("estudou hoje: sequência viva e sem risco", () => {
    const streak = computeStreak([d("2026-08-19"), d("2026-08-20")], hoje);
    expect(streak.atRisk).toBe(false);
  });

  it("dois dias sem estudar quebra a sequência", () => {
    const streak = computeStreak([d("2026-08-17"), d("2026-08-18")], hoje);
    expect(streak.current).toBe(0);
  });

  it("guarda o recorde mesmo depois de quebrar", () => {
    const streak = computeStreak(
      [
        d("2026-07-01"), d("2026-07-02"), d("2026-07-03"),
        d("2026-07-04"), d("2026-07-05"),
        // buraco
        d("2026-08-19"), d("2026-08-20"),
      ],
      hoje,
    );
    expect(streak.current).toBe(2);
    expect(streak.longest).toBe(5);
  });

  it("É RECONSTRUÍDA, não incrementada: ordem da entrada não importa", () => {
    // Um contador que só sobe quebra em qualquer falha de escrita e ninguém
    // descobre até o aluno reclamar que perdeu 27 dias.
    const ordenado = computeStreak(
      [d("2026-08-18"), d("2026-08-19"), d("2026-08-20")],
      hoje,
    );
    const embaralhado = computeStreak(
      [d("2026-08-20"), d("2026-08-18"), d("2026-08-19")],
      hoje,
    );
    expect(embaralhado.current).toBe(ordenado.current);
  });

  it("dias duplicados não inflam a sequência", () => {
    const streak = computeStreak(
      [d("2026-08-19"), d("2026-08-19"), d("2026-08-20"), d("2026-08-20")],
      hoje,
    );
    expect(streak.current).toBe(2);
  });

  it("monta os 7 pontinhos da semana", () => {
    const streak = computeStreak([d("2026-08-19"), d("2026-08-20")], hoje);
    expect(streak.weekDots).toHaveLength(7);
    expect(streak.weekDots[6].date).toBe("2026-08-20");
    expect(streak.weekDots[6].active).toBe(true);
    expect(streak.weekDots[0].active).toBe(false);
  });

  it("aluno sem nenhuma atividade não quebra", () => {
    const streak = computeStreak([], hoje);
    expect(streak.current).toBe(0);
    expect(streak.longest).toBe(0);
    expect(streak.lastActivityDate).toBeNull();
    expect(streak.weekDots).toHaveLength(7);
  });

  it("sequência longa atravessando virada de mês", () => {
    const dias: CivilDate[] = [];
    for (let i = 0; i < 40; i++) {
      const dia = new Date(Date.UTC(2026, 6, 12 + i));
      dias.push(dia.toISOString().slice(0, 10) as CivilDate);
    }
    const streak = computeStreak(dias, d("2026-08-20"));
    expect(streak.current).toBe(40);
  });
});

describe("computeMissionProgress", () => {
  const missoes = [
    { missionId: "m1", code: "q10", name: "Resolver 10 questões", targetType: "answer_questions", targetValue: 10, xpReward: 60, coinReward: 10 },
    { missionId: "m2", code: "e60", name: "Estudar 1 hora", targetType: "study_minutes", targetValue: 60, xpReward: 120, coinReward: 15 },
    { missionId: "m3", code: "r1", name: "Fazer 1 revisão", targetType: "complete_reviews", targetValue: 1, xpReward: 40, coinReward: 5 },
  ];

  it("calcula o X/5 do card", () => {
    const resultado = computeMissionProgress(missoes, {
      answer_questions: 10,
      study_minutes: 30,
      complete_reviews: 1,
    });
    expect(resultado.completedCount).toBe(2);
  });

  it("o progresso não passa da meta", () => {
    const resultado = computeMissionProgress(missoes, { answer_questions: 50 });
    expect(resultado.missions[0].progress).toBe(10);
    expect(resultado.missions[0].percent).toBe(100);
  });

  it("contador ausente é zero, não erro", () => {
    const resultado = computeMissionProgress(missoes, {});
    expect(resultado.completedCount).toBe(0);
    expect(resultado.missions[0].progress).toBe(0);
  });

  it("soma o XP disponível no dia", () => {
    expect(computeMissionProgress(missoes, {}).totalXpAvailable).toBe(220);
  });

  it("meta zero não divide por zero", () => {
    const resultado = computeMissionProgress(
      [{ ...missoes[0], targetValue: 0 }],
      { answer_questions: 1 },
    );
    expect(Number.isFinite(resultado.missions[0].percent)).toBe(true);
  });
});

describe("livro-razão", () => {
  it("o saldo é a soma dos lançamentos", () => {
    expect(balanceFromLedger([{ amount: 30 }, { amount: 5 }, { amount: 5 }])).toBe(40);
  });

  it("estorno é lançamento negativo, não edição", () => {
    // Questão anulada: lança-se a contrapartida em vez de consertar contador.
    expect(balanceFromLedger([{ amount: 10 }, { amount: -10 }])).toBe(0);
  });

  it("a chave de idempotência distingue os dois lançamentos de um acerto", () => {
    const respondida = xpIdempotencyKey("u1", "question_answered", "question_attempt", "a1");
    const bonus = xpIdempotencyKey("u1", "question_correct_bonus", "question_attempt", "a1");
    expect(respondida).not.toBe(bonus);
  });

  it("a mesma resposta gera sempre a mesma chave", () => {
    // É o que impede uma requisição repetida de pagar o acerto duas vezes.
    expect(xpIdempotencyKey("u1", "question_answered", "question_attempt", "a1")).toBe(
      xpIdempotencyKey("u1", "question_answered", "question_attempt", "a1"),
    );
  });
});
