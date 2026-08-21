import { describe, expect, it } from "vitest";

import {
  DEFAULT_PREPARATION_INDEX,
  DEFAULT_STUDY_TECHNIQUES,
} from "@/modules/engine-config/schemas";
import type { CivilDate } from "@/modules/shared/dates";

import {
  buildEvolutionSeries,
  computeCatalogCoverage,
  computeCoverage,
  computeGoldenHour,
  computePreparationIndex,
  examCountdown,
  findBestTechnique,
  findGaps,
  type DailyRollup,
  type HourBucket,
} from "./index";

const d = (v: string) => v as CivilDate;

describe("buildEvolutionSeries — A REGRA CRÍTICA", () => {
  it("dia sem questão NÃO VIRA PONTO no gráfico", () => {
    // README 2.1: "no dia em que o aluno não responder questões, o gráfico NÃO
    // cai — simplesmente não existe ponto naquele dia. Não plotar zero."
    const rollups: DailyRollup[] = [
      { rollupDate: d("2026-08-18"), questionsAnswered: 20, questionsCorrect: 16 },
      // Estudou e revisou, mas não respondeu questão. A linha existe no banco.
      { rollupDate: d("2026-08-19"), questionsAnswered: 0, questionsCorrect: 0 },
      { rollupDate: d("2026-08-20"), questionsAnswered: 10, questionsCorrect: 9 },
    ];

    const serie = buildEvolutionSeries(rollups);

    expect(serie).toHaveLength(2);
    expect(serie.map((p) => p.date)).toEqual(["2026-08-18", "2026-08-20"]);
    expect(serie.some((p) => p.accuracyPercent === 0)).toBe(false);
  });

  it("a linha NÃO cai entre dois dias bons separados por um dia sem questão", () => {
    const serie = buildEvolutionSeries([
      { rollupDate: d("2026-08-18"), questionsAnswered: 20, questionsCorrect: 18 },
      { rollupDate: d("2026-08-19"), questionsAnswered: 0, questionsCorrect: 0 },
      { rollupDate: d("2026-08-20"), questionsAnswered: 20, questionsCorrect: 19 },
    ]);
    expect(serie.map((p) => p.accuracyPercent)).toEqual([90, 95]);
  });

  it("zero acertos COM questões respondidas vira ponto — aí o gráfico cai mesmo", () => {
    // A regra é sobre dia sem atividade, não sobre dia ruim. Um dia em que o
    // aluno errou tudo é informação legítima.
    const serie = buildEvolutionSeries([
      { rollupDate: d("2026-08-20"), questionsAnswered: 10, questionsCorrect: 0 },
    ]);
    expect(serie).toHaveLength(1);
    expect(serie[0].accuracyPercent).toBe(0);
  });

  it("ordena por data", () => {
    const serie = buildEvolutionSeries([
      { rollupDate: d("2026-08-20"), questionsAnswered: 5, questionsCorrect: 5 },
      { rollupDate: d("2026-08-18"), questionsAnswered: 5, questionsCorrect: 4 },
    ]);
    expect(serie.map((p) => p.date)).toEqual(["2026-08-18", "2026-08-20"]);
  });

  it("aluno sem histórico devolve série vazia, não série de zeros", () => {
    expect(buildEvolutionSeries([])).toEqual([]);
  });
});

describe("computeGoldenHour", () => {
  function buckets(pares: Array<[number, number, number]>): HourBucket[] {
    return pares.map(([hour, answered, correct]) => ({ hour, answered, correct }));
  }

  it("aponta a faixa de melhor rendimento", () => {
    const resultado = computeGoldenHour(
      buckets([
        [6, 20, 18], // manhã: 90%
        [7, 20, 18],
        [8, 20, 17],
        [20, 20, 10], // noite: 50%
        [21, 20, 10],
        [22, 20, 10],
      ]),
    );

    expect(resultado.isReliable).toBe(true);
    expect(resultado.startHour).toBe(6);
    expect(resultado.accuracyPercent).toBeGreaterThan(80);
  });

  it("NÃO AFIRMA NADA com amostra pequena", () => {
    // Sem isto, 2 questões acertadas às 5h da manhã virariam "horário de ouro:
    // 5h" para sempre, e o aluno reorganizaria a vida à toa.
    const resultado = computeGoldenHour(buckets([[5, 2, 2]]));
    expect(resultado.isReliable).toBe(false);
    expect(resultado.startHour).toBeNull();
  });

  it("usa janela de 3 horas, não hora isolada", () => {
    // Uma hora isolada com 100% mas pouquíssimas respostas não pode ganhar
    // de uma faixa consistente.
    const resultado = computeGoldenHour(
      buckets([
        [3, 10, 10], // 100% mas só uma hora
        [14, 30, 27],
        [15, 30, 27],
        [16, 30, 26],
      ]),
    );
    expect(resultado.isReliable).toBe(true);
    expect(resultado.endHour).toBe((resultado.startHour! + 3) % 24);
  });

  it("NÃO ANUNCIA uma faixa que começa em hora sem nenhuma resposta", () => {
    // A janela 5h–8h teria média maior (só as horas 6 e 7 têm dado), mas
    // dizer "seu horário de ouro começa às 5h" para quem nunca abriu o app
    // às 5h é uma afirmação falsa sobre a rotina da pessoa.
    const resultado = computeGoldenHour(
      buckets([
        [6, 20, 18],
        [7, 20, 18],
        [8, 20, 17],
        [20, 20, 10],
        [21, 20, 10],
      ]),
    );
    expect(resultado.startHour).toBe(6);
    const inicioTemDado = [6, 7, 8, 20, 21].includes(resultado.startHour!);
    expect(inicioTemDado).toBe(true);
  });

  it("a janela dá a volta na meia-noite", () => {
    const resultado = computeGoldenHour(
      buckets([
        [23, 20, 19],
        [0, 20, 19],
        [1, 20, 19],
        [10, 20, 8],
        [11, 20, 8],
      ]),
    );
    expect(resultado.isReliable).toBe(true);
    expect(resultado.startHour).toBe(23);
    expect(resultado.endHour).toBe(2);
  });

  it("sem dados nenhum não quebra", () => {
    const resultado = computeGoldenHour([]);
    expect(resultado.isReliable).toBe(false);
    expect(resultado.sampleSize).toBe(0);
  });
});

describe("computeCoverage", () => {
  it("conta assunto estudado como cobertura cheia e em andamento como metade", () => {
    const cobertura = computeCoverage([
      { planTopicId: "a", coverageStatus: "studied", weight: 1 },
      { planTopicId: "b", coverageStatus: "in_progress", weight: 1 },
      { planTopicId: "c", coverageStatus: "not_started", weight: 1 },
      { planTopicId: "d", coverageStatus: "not_started", weight: 1 },
    ]);
    expect(cobertura.percent).toBe(38); // (1 + 0.5) / 4
    expect(cobertura.studiedTopics).toBe(1);
    expect(cobertura.startedTopics).toBe(2);
  });

  it("A LEITURA HONESTA: ponderada difere da simples", () => {
    // O aluno varreu os assuntos leves e acha que está adiantado.
    const cobertura = computeCoverage([
      { planTopicId: "leve1", coverageStatus: "studied", weight: 1 },
      { planTopicId: "leve2", coverageStatus: "studied", weight: 1 },
      { planTopicId: "leve3", coverageStatus: "studied", weight: 1 },
      { planTopicId: "pesado", coverageStatus: "not_started", weight: 20 },
    ]);
    expect(cobertura.percent).toBe(75);
    expect(cobertura.weightedPercent).toBeLessThan(20);
  });

  it("o denominador inclui assunto não mapeado", () => {
    // Contar só os mapeados faria a cobertura SUBIR quando o casamento
    // falhasse — a métrica melhoraria justo quando o produto piora.
    const cobertura = computeCoverage([
      { planTopicId: "a", coverageStatus: "studied", weight: null },
      { planTopicId: "b", coverageStatus: "not_started", weight: null },
    ]);
    expect(cobertura.totalTopics).toBe(2);
    expect(cobertura.percent).toBe(50);
  });

  it("edital vazio não quebra nem divide por zero", () => {
    expect(computeCoverage([]).percent).toBe(0);
  });

  it("tudo estudado dá 100%", () => {
    const cobertura = computeCoverage([
      { planTopicId: "a", coverageStatus: "mastered", weight: 5 },
      { planTopicId: "b", coverageStatus: "studied", weight: 3 },
    ]);
    expect(cobertura.percent).toBe(100);
    expect(cobertura.weightedPercent).toBe(100);
  });
});

describe("computeCatalogCoverage — acervo disponível vs em produção", () => {
  const topico = (
    id: string,
    over: Partial<{ isMapped: boolean; questionCount: number; contentCount: number }> = {},
  ) => ({
    planTopicId: id,
    isMapped: over.isMapped ?? true,
    questionCount: over.questionCount ?? 0,
    contentCount: over.contentCount ?? 0,
  });

  it("conta como pronto quem tem questão OU material", () => {
    // Generoso de propósito: exigir o conjunto completo faria quase todo
    // assunto aparecer vazio no começo, justo quando o aluno mais precisa de
    // sinal positivo.
    const cobertura = computeCatalogCoverage([
      topico("a", { questionCount: 12 }),
      topico("b", { contentCount: 1 }),
      topico("c"),
      topico("d"),
    ]);
    expect(cobertura.readyTopics).toBe(2);
    expect(cobertura.readyPercent).toBe(50);
  });

  it("OS DOIS PERCENTUAIS SOMAM EXATAMENTE 100", () => {
    // Arredondar os dois separadamente produziria "80% + 21%", que é o tipo de
    // detalhe que faz o aluno desconfiar do resto dos números.
    for (const n of [3, 6, 7, 9, 11, 13, 17, 23, 97]) {
      const topicos = Array.from({ length: n }, (_, i) =>
        topico(`t${i}`, { questionCount: i % 3 === 0 ? 5 : 0 }),
      );
      const c = computeCatalogCoverage(topicos);
      expect(c.readyPercent + c.inProductionPercent).toBe(100);
    }
  });

  it("assunto não mapeado nunca conta como pronto", () => {
    // Sem casamento com o catálogo não há como haver material.
    const cobertura = computeCatalogCoverage([
      topico("a", { isMapped: false, questionCount: 99 }),
      topico("b", { questionCount: 5 }),
    ]);
    expect(cobertura.readyTopics).toBe(1);
    expect(cobertura.unmappedTopics).toBe(1);
  });

  it("edital totalmente coberto dá 100 e zero em produção", () => {
    const cobertura = computeCatalogCoverage([
      topico("a", { questionCount: 1 }),
      topico("b", { contentCount: 1 }),
    ]);
    expect(cobertura.readyPercent).toBe(100);
    expect(cobertura.inProductionPercent).toBe(0);
  });

  it("edital sem nada dá 0 e 100 em produção", () => {
    const cobertura = computeCatalogCoverage([topico("a"), topico("b")]);
    expect(cobertura.readyPercent).toBe(0);
    expect(cobertura.inProductionPercent).toBe(100);
  });

  it("edital vazio não divide por zero", () => {
    const cobertura = computeCatalogCoverage([]);
    expect(cobertura.readyPercent).toBe(0);
    expect(cobertura.inProductionPercent).toBe(0);
  });
});

describe("findGaps", () => {
  it("ordena pelos assuntos com mais erro", () => {
    const lacunas = findGaps([
      { planTopicId: "a", topicName: "Crase", subjectName: "Port", questionsAnswered: 20, questionsCorrect: 4 },
      { planTopicId: "b", topicName: "Regência", subjectName: "Port", questionsAnswered: 20, questionsCorrect: 14 },
    ]);
    expect(lacunas[0].topicName).toBe("Crase");
    expect(lacunas[0].errorPercent).toBe(80);
  });

  it("AMOSTRA PEQUENA NÃO VIRA LACUNA", () => {
    // Sem o piso, o topo do card seria sempre o assunto com 1 questão errada:
    // 100% de erro e zero informação.
    const lacunas = findGaps([
      { planTopicId: "ruido", topicName: "X", subjectName: "S", questionsAnswered: 1, questionsCorrect: 0 },
      { planTopicId: "real", topicName: "Y", subjectName: "S", questionsAnswered: 30, questionsCorrect: 12 },
    ]);
    expect(lacunas.map((g) => g.planTopicId)).toEqual(["real"]);
  });

  it("assunto sem erro nenhum não é lacuna", () => {
    const lacunas = findGaps([
      { planTopicId: "a", topicName: "X", subjectName: "S", questionsAnswered: 20, questionsCorrect: 20 },
    ]);
    expect(lacunas).toEqual([]);
  });

  it("empate no erro é desempatado pela amostra maior", () => {
    const lacunas = findGaps([
      { planTopicId: "pouco", topicName: "A", subjectName: "S", questionsAnswered: 10, questionsCorrect: 5 },
      { planTopicId: "muito", topicName: "B", subjectName: "S", questionsAnswered: 40, questionsCorrect: 20 },
    ]);
    expect(lacunas[0].planTopicId).toBe("muito");
  });

  it("respeita o limite pedido", () => {
    const muitos = Array.from({ length: 20 }, (_, i) => ({
      planTopicId: `t${i}`,
      topicName: `T${i}`,
      subjectName: "S",
      questionsAnswered: 20,
      questionsCorrect: i,
    }));
    expect(findGaps(muitos, 3)).toHaveLength(3);
  });
});

describe("computePreparationIndex", () => {
  const config = DEFAULT_PREPARATION_INDEX;

  it("A INVARIANTE: a soma do breakdown é o valor", () => {
    const indice = computePreparationIndex({
      coveragePercent: 40,
      accuracyPercent: 70,
      reviewAdherencePercent: 80,
      taskCompletionPercent: 60,
      config,
    });
    const soma = Object.values(indice.breakdown).reduce((a, b) => a + b, 0);
    expect(Math.round(soma)).toBe(indice.value);
  });

  it("usa os rótulos aprovados, e nenhum promete aprovação", () => {
    const rotulos = config.bands.map((b) => b.label);
    expect(rotulos).toEqual([
      "Em construção",
      "Ganhando ritmo",
      "Consistente",
      "Sólido",
      "No ponto",
    ]);
    // "Competitivo" é nome de NÍVEL de gamificação e não pode reaparecer aqui.
    expect(rotulos).not.toContain("Competitivo");
    for (const rotulo of rotulos) {
      expect(rotulo.toLowerCase()).not.toContain("aprova");
    }
  });

  it("atribui o rótulo da faixa certa", () => {
    const casos: Array<[number, string]> = [
      [0, "Em construção"],
      [39, "Em construção"],
      [40, "Ganhando ritmo"],
      [60, "Consistente"],
      [75, "Sólido"],
      [90, "No ponto"],
      [100, "No ponto"],
    ];

    for (const [valor, rotulo] of casos) {
      const indice = computePreparationIndex({
        coveragePercent: valor,
        accuracyPercent: valor,
        reviewAdherencePercent: valor,
        taskCompletionPercent: valor,
        config,
      });
      expect(indice.label).toBe(rotulo);
    }
  });

  it("toda faixa de 0 a 100 tem rótulo — não existe buraco", () => {
    for (let valor = 0; valor <= 100; valor++) {
      const indice = computePreparationIndex({
        coveragePercent: valor,
        accuracyPercent: valor,
        reviewAdherencePercent: valor,
        taskCompletionPercent: valor,
        config,
      });
      expect(indice.label.length).toBeGreaterThan(0);
    }
  });

  it("valores fora da faixa não estouram o índice", () => {
    const indice = computePreparationIndex({
      coveragePercent: 500,
      accuracyPercent: -20,
      reviewAdherencePercent: NaN,
      taskCompletionPercent: 100,
      config,
    });
    expect(indice.value).toBeGreaterThanOrEqual(0);
    expect(indice.value).toBeLessThanOrEqual(100);
  });
});

describe("findBestTechnique", () => {
  const minimo = DEFAULT_STUDY_TECHNIQUES.minAttemptsForTechniqueStats;

  it("aponta a técnica com melhor desempenho na prática seguinte", () => {
    const melhor = findBestTechnique(
      [
        { technique: "mind_map", attempts: 40, correct: 34 },
        { technique: "video", attempts: 40, correct: 24 },
      ],
      minimo,
    );
    expect(melhor.technique).toBe("mind_map");
    expect(melhor.isReliable).toBe(true);
  });

  it("NÃO AFIRMA NADA com uma técnica só — não há comparação", () => {
    const melhor = findBestTechnique([{ technique: "reading", attempts: 100, correct: 80 }], minimo);
    expect(melhor.isReliable).toBe(false);
    expect(melhor.technique).toBeNull();
  });

  it("ignora técnica com amostra insuficiente", () => {
    const melhor = findBestTechnique(
      [
        { technique: "flashcard", attempts: 2, correct: 2 }, // 100%, mas ruído
        { technique: "mind_map", attempts: 40, correct: 30 },
        { technique: "video", attempts: 40, correct: 28 },
      ],
      minimo,
    );
    expect(melhor.technique).toBe("mind_map");
    expect(melhor.ranking.map((r) => r.technique)).not.toContain("flashcard");
  });

  it("soma as amostras da mesma técnica", () => {
    const melhor = findBestTechnique(
      [
        { technique: "video", attempts: 15, correct: 12 },
        { technique: "video", attempts: 15, correct: 12 },
        { technique: "reading", attempts: 30, correct: 15 },
      ],
      minimo,
    );
    expect(melhor.ranking.find((r) => r.technique === "video")?.attempts).toBe(30);
  });

  it("sem dados não quebra", () => {
    expect(findBestTechnique([], minimo).isReliable).toBe(false);
  });
});

describe("examCountdown", () => {
  const hoje = d("2026-08-20");

  it("conta os dias que faltam", () => {
    expect(examCountdown(hoje, d("2026-11-15"), false).label).toBe(
      "Faltam 87 dias para a prova",
    );
  });

  it("usa singular quando falta um dia", () => {
    expect(examCountdown(hoje, d("2026-08-21"), false).label).toBe(
      "Falta 1 dia para a prova",
    );
  });

  it("avisa quando a prova é hoje", () => {
    expect(examCountdown(hoje, hoje, false).label).toBe("A prova é hoje");
  });

  it("marca data estimada como estimada — não finge certeza", () => {
    expect(examCountdown(hoje, d("2026-11-15"), true).label).toContain("estimada");
  });

  it("sem data, não inventa contagem", () => {
    const contagem = examCountdown(hoje, null, false);
    expect(contagem.daysLeft).toBeNull();
    expect(contagem.label).toContain("ainda não definida");
  });

  it("prova passada é sinalizada", () => {
    const contagem = examCountdown(hoje, d("2026-01-01"), false);
    expect(contagem.isPast).toBe(true);
  });
});
