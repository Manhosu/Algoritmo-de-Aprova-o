import { describe, expect, it } from "vitest";

import {
  ACHIEVEMENT_CATALOG,
  evaluateAchievements,
  type AchievementSnapshot,
} from "./achievements";

const ZERADO: AchievementSnapshot = {
  questionsAnswered: 0,
  questionsCorrect: 0,
  reviewsCompleted: 0,
  topicsMastered: 0,
  dailyTasksCompleted: 0,
  longestStreak: 0,
  totalXp: 0,
};

describe("evaluateAchievements", () => {
  it("aluno novo não desbloqueia nada", () => {
    const resultado = evaluateAchievements(ZERADO, ACHIEVEMENT_CATALOG);

    expect(resultado.every((r) => !r.unlocked)).toBe(true);
    expect(resultado).toHaveLength(ACHIEVEMENT_CATALOG.length);
  });

  it("desbloqueia ao atingir o alvo, não ao passar dele", () => {
    const noAlvo = evaluateAchievements(
      { ...ZERADO, questionsAnswered: 50 },
      ACHIEVEMENT_CATALOG,
    );

    expect(noAlvo.find((r) => r.code === "questions_50")?.unlocked).toBe(true);
  });

  it("LIMITA o progresso ao alvo", () => {
    /*
      Quem respondeu 900 questões tem 500 de 500 na conquista de 500, não 900 de
      500 — senão a barra estoura e a tela mostra 180%.
    */
    const resultado = evaluateAchievements(
      { ...ZERADO, questionsAnswered: 900 },
      ACHIEVEMENT_CATALOG,
    );

    const maratonista = resultado.find((r) => r.code === "questions_500");
    expect(maratonista).toEqual({
      code: "questions_500",
      progress: 500,
      target: 500,
      unlocked: true,
    });
  });

  it("desbloqueia a família inteira abaixo do valor atingido", () => {
    // 500 questões desbloqueiam também as de 1 e de 50.
    const resultado = evaluateAchievements(
      { ...ZERADO, questionsAnswered: 500 },
      ACHIEVEMENT_CATALOG,
    );

    const desbloqueadas = resultado.filter((r) => r.unlocked).map((r) => r.code);
    expect(desbloqueadas).toEqual(["first_question", "questions_50", "questions_500"]);
  });

  it("usa a MAIOR sequência, não a atual", () => {
    /*
      Quem fez 30 dias e faltou ontem não perde a conquista. Zerar um marco já
      alcançado transformaria a conquista numa punição por um dia ruim, que é o
      oposto do que ela existe para fazer.
    */
    const resultado = evaluateAchievements(
      { ...ZERADO, longestStreak: 30 },
      ACHIEVEMENT_CATALOG,
    );

    expect(resultado.find((r) => r.code === "streak_30")?.unlocked).toBe(true);
  });

  it("contador ausente no retrato vale zero, não quebra", () => {
    const parcial = { longestStreak: 7 } as unknown as AchievementSnapshot;
    const resultado = evaluateAchievements(parcial, ACHIEVEMENT_CATALOG);

    expect(resultado.find((r) => r.code === "streak_7")?.unlocked).toBe(true);
    expect(resultado.find((r) => r.code === "questions_50")?.progress).toBe(0);
  });
});

describe("catálogo de conquistas", () => {
  it("não repete código", () => {
    const codigos = ACHIEVEMENT_CATALOG.map((a) => a.code);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it("toda conquista tem alvo positivo e recompensa", () => {
    for (const conquista of ACHIEVEMENT_CATALOG) {
      expect(conquista.target, conquista.code).toBeGreaterThan(0);
      expect(conquista.xpReward, conquista.code).toBeGreaterThan(0);
      expect(conquista.name.trim().length, conquista.code).toBeGreaterThan(0);
      expect(conquista.description.trim().length, conquista.code).toBeGreaterThan(0);
    }
  });

  it("dentro de cada família, os alvos sobem", () => {
    /*
      A tela mostra a próxima meta assumindo a ordem do catálogo. Uma família
      fora de ordem faria o aluno ver "500 questões" como próximo passo tendo
      respondido 3, com a de 50 escondida mais abaixo.
    */
    const porContador = new Map<string, number[]>();

    for (const conquista of ACHIEVEMENT_CATALOG) {
      const alvos = porContador.get(conquista.counter) ?? [];
      alvos.push(conquista.target);
      porContador.set(conquista.counter, alvos);
    }

    for (const [contador, alvos] of porContador) {
      expect([...alvos].sort((a, b) => a - b), contador).toEqual(alvos);
    }
  });
});
