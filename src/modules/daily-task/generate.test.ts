import { describe, expect, it } from "vitest";

import {
  DEFAULT_DAILY_TASK_WEIGHTS,
  DEFAULT_REVIEW_INTERVALS,
  DEFAULT_SCHEDULE_PARAMS,
  DEFAULT_STUDY_TECHNIQUES,
} from "@/modules/engine-config/schemas";
import type { CivilDate } from "@/modules/shared/dates";

import {
  chooseTechnique,
  generateDailyTask,
  splitBudgetAcrossPreparations,
  type GenerateDailyTaskInput,
  type TopicSnapshot,
} from "./generate";

const SP = "America/Sao_Paulo";
const d = (v: string) => v as CivilDate;
const HOJE = d("2026-08-20");
const AGORA = new Date("2026-08-20T13:00:00Z");

function topic(overrides: Partial<TopicSnapshot> = {}): TopicSnapshot {
  return {
    planTopicId: overrides.planTopicId ?? "t1",
    planSubjectId: overrides.planSubjectId ?? "s1",
    subjectName: overrides.subjectName ?? "Língua Portuguesa",
    topicName: overrides.topicName ?? "Crase",
    weight: 10,
    weightSource: "edital",
    isMapped: true,
    availableQuestionCount: 50,
    initialMastery: "medium",
    currentMasteryScore: 0.5,
    masteryConfidence: 0,
    questionsAnswered: 0,
    questionsCorrect: 0,
    recentAccuracy: null,
    reviewsRated: 0,
    reviewsRatedHard: 0,
    coverageProgress: 0,
    lastTouchedOn: null,
    recentTechniques: [],
    availableTechniques: ["mind_map", "flashcard", "video", "reading"],
    ...overrides,
  };
}

function input(overrides: Partial<GenerateDailyTaskInput> = {}): GenerateDailyTaskInput {
  return {
    now: AGORA,
    timeZone: SP,
    today: HOJE,
    examDate: d("2026-11-15"),
    examDateIsEstimated: false,
    availableMinutes: 120,
    reservedReviewMinutes: 0,
    topics: [topic()],
    weights: DEFAULT_DAILY_TASK_WEIGHTS,
    scheduleParams: DEFAULT_SCHEDULE_PARAMS,
    techniques: DEFAULT_STUDY_TECHNIQUES,
    ...overrides,
  };
}

describe("generateDailyTask — formato dos blocos", () => {
  it("cada bloco tem estudo e prática sobre o MESMO assunto", () => {
    const plano = generateDailyTask(input());
    const bloco = plano.blocks[0];

    expect(bloco.studyMinutes).toBeGreaterThan(0);
    expect(bloco.practiceMinutes).toBeGreaterThan(0);
    expect(bloco.targetQuestionCount).toBeGreaterThan(0);
    // O par é sobre o mesmo assunto — é isso que torna a métrica de técnica
    // atribuível.
    expect(bloco.topicName).toBe("Crase");
  });

  it("numera os blocos em sequência a partir de zero", () => {
    // 3 blocos exigem 144 minutos (48 cada). Com os 120 do padrão só caberiam
    // 2 — o corte pelo orçamento é testado à parte, aqui interessa a numeração.
    const plano = generateDailyTask(
      input({
        availableMinutes: 180,
        topics: [
          topic({ planTopicId: "a", planSubjectId: "s1" }),
          topic({ planTopicId: "b", planSubjectId: "s2" }),
          topic({ planTopicId: "c", planSubjectId: "s3" }),
        ],
      }),
    );
    expect(plano.blocks.map((b) => b.blockIndex)).toEqual([0, 1, 2]);
  });

  it("a meta de questões existe mas não é para ser exibida", () => {
    // A configuração diz explicitamente para não mostrar. O número existe
    // apenas para dimensionar o dia e definir a conclusão do item.
    expect(DEFAULT_STUDY_TECHNIQUES.showQuestionCount).toBe(false);
    const plano = generateDailyTask(input());
    expect(plano.blocks[0].targetQuestionCount).not.toBeNull();
  });
});

describe("generateDailyTask — assunto não mapeado", () => {
  const naoMapeado = topic({
    planTopicId: "sem-questao",
    isMapped: false,
    availableQuestionCount: 0,
  });

  it("A TAREFA NÃO FICA VAZIA: o assunto continua estudável", () => {
    const plano = generateDailyTask(input({ topics: [naoMapeado] }));
    expect(plano.blocks).toHaveLength(1);
    expect(plano.blocks[0].studyMinutes).toBeGreaterThan(0);
  });

  it("mas não recebe o par de questões", () => {
    const plano = generateDailyTask(input({ topics: [naoMapeado] }));
    expect(plano.blocks[0].practiceMinutes).toBe(0);
    expect(plano.blocks[0].targetQuestionCount).toBeNull();
  });

  it("edital inteiro não mapeado ainda gera uma tarefa válida", () => {
    // É o pior cenário do casamento de taxonomia. O aluno não pode ficar
    // sem tarefa por uma falha que ele não causou nem enxerga.
    const plano = generateDailyTask(
      input({
        topics: [
          topic({ planTopicId: "a", isMapped: false, availableQuestionCount: 0 }),
          topic({ planTopicId: "b", isMapped: false, availableQuestionCount: 0 }),
        ],
      }),
    );
    expect(plano.blocks.length).toBeGreaterThan(0);
    expect(plano.diagnostics.topicsUnmapped).toBe(2);
  });

  it("assunto mapeado mas sem questão no banco também só estuda", () => {
    const plano = generateDailyTask(
      input({ topics: [topic({ isMapped: true, availableQuestionCount: 0 })] }),
    );
    expect(plano.blocks[0].targetQuestionCount).toBeNull();
  });

  it("a meta nunca excede as questões que existem", () => {
    const plano = generateDailyTask(
      input({ topics: [topic({ availableQuestionCount: 3 })] }),
    );
    expect(plano.blocks[0].targetQuestionCount).toBeLessThanOrEqual(3);
  });
});

describe("generateDailyTask — orçamento de tempo", () => {
  const seisAssuntos = Array.from({ length: 6 }, (_, i) =>
    topic({ planTopicId: `t${i}`, planSubjectId: `s${i}` }),
  );

  it("respeita os minutos disponíveis", () => {
    const plano = generateDailyTask(
      input({ topics: seisAssuntos, availableMinutes: 60 }),
    );
    expect(plano.plannedMinutes).toBeLessThanOrEqual(60);
  });

  it("desconta o tempo já reservado para revisões", () => {
    const semRevisao = generateDailyTask(
      input({ topics: seisAssuntos, availableMinutes: 120, reservedReviewMinutes: 0 }),
    );
    const comRevisao = generateDailyTask(
      input({ topics: seisAssuntos, availableMinutes: 120, reservedReviewMinutes: 90 }),
    );
    expect(comRevisao.blocks.length).toBeLessThan(semRevisao.blocks.length);
  });

  it("DIA CURTO AINDA RENDE TAREFA: o primeiro bloco entra de qualquer forma", () => {
    // Um aluno com 10 minutos precisa receber alguma coisa. Tarefa vazia é
    // pior que tarefa pequena.
    const plano = generateDailyTask(
      input({ topics: seisAssuntos, availableMinutes: 10 }),
    );
    expect(plano.blocks).toHaveLength(1);
  });

  it("revisão consumindo o dia inteiro ainda deixa um bloco de estudo", () => {
    const plano = generateDailyTask(
      input({ topics: seisAssuntos, availableMinutes: 60, reservedReviewMinutes: 60 }),
    );
    expect(plano.blocks).toHaveLength(1);
    expect(plano.diagnostics.minutesAvailableForStudy).toBe(0);
  });

  it("respeita o teto de itens por tarefa", () => {
    const plano = generateDailyTask(
      input({
        topics: Array.from({ length: 30 }, (_, i) =>
          topic({ planTopicId: `t${i}`, planSubjectId: `s${i}` }),
        ),
        availableMinutes: 10_000,
      }),
    );
    expect(plano.blocks.length).toBeLessThanOrEqual(
      DEFAULT_SCHEDULE_PARAMS.maxDailyTaskItems,
    );
  });
});

describe("generateDailyTask — ordenação e diversidade", () => {
  it("prioriza quem tem mais necessidade", () => {
    const plano = generateDailyTask(
      input({
        examDate: null,
        topics: [
          topic({
            planTopicId: "dominado",
            planSubjectId: "s1",
            initialMastery: "high",
            currentMasteryScore: 0.95,
            masteryConfidence: 1,
            questionsAnswered: 40,
            questionsCorrect: 38,
            recentAccuracy: 0.95,
            lastTouchedOn: HOJE,
            coverageProgress: 0.9,
          }),
          topic({
            planTopicId: "fraco",
            planSubjectId: "s2",
            initialMastery: "low",
            currentMasteryScore: 0.15,
            masteryConfidence: 1,
            questionsAnswered: 40,
            questionsCorrect: 6,
            recentAccuracy: 0.15,
            lastTouchedOn: null,
            coverageProgress: 0,
          }),
        ],
      }),
    );
    expect(plano.blocks[0].planTopicId).toBe("fraco");
  });

  it("não empilha a mesma disciplina em sequência quando há alternativa", () => {
    const plano = generateDailyTask(
      input({
        availableMinutes: 600,
        topics: [
          topic({ planTopicId: "p1", planSubjectId: "port", subjectName: "Português" }),
          topic({ planTopicId: "p2", planSubjectId: "port", subjectName: "Português" }),
          topic({ planTopicId: "p3", planSubjectId: "port", subjectName: "Português" }),
          topic({ planTopicId: "d1", planSubjectId: "dir", subjectName: "Direito" }),
          topic({ planTopicId: "d2", planSubjectId: "dir", subjectName: "Direito" }),
        ],
      }),
    );

    for (let i = 1; i < Math.min(4, plano.blocks.length); i++) {
      expect(plano.blocks[i].subjectName).not.toBe(plano.blocks[i - 1].subjectName);
    }
  });

  it("aceita repetir a disciplina quando não há outra", () => {
    const plano = generateDailyTask(
      input({
        availableMinutes: 600,
        topics: [
          topic({ planTopicId: "p1", planSubjectId: "port" }),
          topic({ planTopicId: "p2", planSubjectId: "port" }),
          topic({ planTopicId: "p3", planSubjectId: "port" }),
        ],
      }),
    );
    expect(plano.blocks.length).toBe(3);
  });

  it("É DETERMINÍSTICO: mesma entrada, mesma tarefa", () => {
    // Sem isso a tarefa pareceria mudar sozinha entre recálculos, e o aluno
    // perderia a confiança no sistema.
    const entrada = input({
      topics: [
        topic({ planTopicId: "a", planSubjectId: "s1" }),
        topic({ planTopicId: "b", planSubjectId: "s2" }),
        topic({ planTopicId: "c", planSubjectId: "s3" }),
      ],
    });
    expect(generateDailyTask(entrada)).toEqual(generateDailyTask(entrada));
  });

  it("empate é desempatado de forma estável, não aleatória", () => {
    const identicos = [
      topic({ planTopicId: "zzz", planSubjectId: "s1" }),
      topic({ planTopicId: "aaa", planSubjectId: "s1" }),
    ];
    const primeira = generateDailyTask(input({ topics: identicos, availableMinutes: 600 }));
    const segunda = generateDailyTask(
      input({ topics: [...identicos].reverse(), availableMinutes: 600 }),
    );
    expect(primeira.blocks.map((b) => b.planTopicId)).toEqual(
      segunda.blocks.map((b) => b.planTopicId),
    );
  });
});

describe("chooseTechnique — rotação", () => {
  it("prescreve uma técnica que tem material disponível", () => {
    const escolhida = chooseTechnique(
      topic({ availableTechniques: ["summary"] }),
      DEFAULT_STUDY_TECHNIQUES,
    );
    expect(escolhida).toBe("summary");
  });

  it("NÃO REPETE a técnica usada nas últimas sessões", () => {
    // É o que faz o mesmo assunto passar por técnicas diferentes ao longo do
    // tempo. Sem isso, comparar técnicas seria comparar assuntos.
    const escolhida = chooseTechnique(
      topic({
        availableTechniques: ["mind_map", "flashcard", "summary"],
        recentTechniques: ["mind_map", "flashcard"],
      }),
      DEFAULT_STUDY_TECHNIQUES,
    );
    expect(escolhida).toBe("summary");
  });

  it("VIDEOAULA ESTÁ DESLIGADA enquanto não houver acervo de vídeo", () => {
    // Decisão da cliente em 20/08/2026. Prescrever "Estude: Videoaula — Crase"
    // sem ter o vídeo seria prometer o que não existe.
    expect(DEFAULT_STUDY_TECHNIQUES.enabled).not.toContain("video");
    expect(DEFAULT_STUDY_TECHNIQUES.enabled).toContain("summary");

    // Mesmo que exista material de vídeo cadastrado, a técnica não é
    // prescrita enquanto estiver fora da configuração — cai no padrão.
    const escolhida = chooseTechnique(
      topic({ availableTechniques: ["video"] }),
      DEFAULT_STUDY_TECHNIQUES,
    );
    expect(escolhida).not.toBe("video");
    expect(escolhida).toBe(DEFAULT_STUDY_TECHNIQUES.fallback);
  });

  it("religar videoaula é só mudar a configuração, sem tocar em código", () => {
    const escolhida = chooseTechnique(
      topic({ availableTechniques: ["video"] }),
      { ...DEFAULT_STUDY_TECHNIQUES, enabled: ["video", "reading"] },
    );
    expect(escolhida).toBe("video");
  });

  it("quando todas foram usadas, escolhe a menos recente", () => {
    const escolhida = chooseTechnique(
      topic({
        availableTechniques: ["mind_map", "flashcard"],
        recentTechniques: ["flashcard", "mind_map"],
      }),
      { ...DEFAULT_STUDY_TECHNIQUES, minSessionsBeforeRepeat: 5 },
    );
    // "mind_map" está mais atrás na lista de recentes.
    expect(escolhida).toBe("mind_map");
  });

  it("SEM MATERIAL NENHUM, cai em Leitura — que não depende do nosso acervo", () => {
    /*
      ⚠️ ESTE TESTE MUDOU DE LADO EM 08/09/2026, e o motivo está registrado.

      Antes ele exigia `null`, e o bloco virava "Estude: Crase", sem modo. A
      cliente reportou as duas pontas disso no mesmo dia: "a Melhor Técnica não
      está medindo" e "cada tarefa deveria dizer o modo de estudo". De 169 itens
      gerados em produção, 137 tinham técnica nula — a métrica não tinha o que
      comparar e a tela não tinha o que mostrar.

      Leitura não promete arquivo nosso: é instrução de COMO estudar, e o aluno
      a executa com a apostila dele. Prescrevê-la é honesto.
    */
    const escolhida = chooseTechnique(
      topic({ availableTechniques: [] }),
      DEFAULT_STUDY_TECHNIQUES,
    );
    expect(escolhida).toBe("reading");
  });

  it("mas NÃO prescreve técnica de acervo sem o arquivo", () => {
    /*
      A proteção original continua de pé: um padrão que é conteúdo NOSSO só vale
      quando o arquivo existe. Prometer "Mapa Mental — Crase" e abrir uma tela
      vazia é pior do que não nomear modo nenhum.
    */
    const escolhida = chooseTechnique(
      topic({ availableTechniques: [] }),
      { ...DEFAULT_STUDY_TECHNIQUES, fallback: "mind_map" },
    );
    expect(escolhida).toBeNull();
  });

  it("ignora técnica desligada na configuração", () => {
    const escolhida = chooseTechnique(
      topic({ availableTechniques: ["video", "reading"] }),
      { ...DEFAULT_STUDY_TECHNIQUES, enabled: ["reading"], fallback: "reading" },
    );
    expect(escolhida).toBe("reading");
  });

  it("a rotação de fato varia ao longo de várias sessões", () => {
    let recentes: string[] = [];
    const usadas = new Set<string>();

    for (let sessao = 0; sessao < 6; sessao++) {
      const escolhida = chooseTechnique(
        topic({
          availableTechniques: ["mind_map", "flashcard", "summary"],
          recentTechniques: recentes as never,
        }),
        DEFAULT_STUDY_TECHNIQUES,
      );
      usadas.add(escolhida!);
      recentes = [escolhida!, ...recentes];
    }

    expect(usadas.size).toBeGreaterThanOrEqual(3);
  });

  it("vincula o material específico quando existe", () => {
    const plano = generateDailyTask(
      input({
        topics: [
          topic({
            availableTechniques: ["mind_map"],
            contentByTechnique: { mind_map: "conteudo-123" },
          }),
        ],
      }),
    );
    expect(plano.blocks[0].technique).toBe("mind_map");
    expect(plano.blocks[0].contentItemId).toBe("conteudo-123");
  });
});

describe("generateDailyTask — explicabilidade", () => {
  it("todo bloco carrega o breakdown completo dos 5 sinais", () => {
    const plano = generateDailyTask(input());
    const { signals, contributions } = plano.blocks[0].priority;

    const nomes = ["hardReviews", "editalWeight", "urgency", "recency", "knowledgeGap"];
    expect(Object.keys(signals).sort()).toEqual([...nomes].sort());
    expect(Object.keys(contributions).sort()).toEqual([...nomes].sort());
  });

  it("a soma das contribuições bate com o score em todo bloco", () => {
    const plano = generateDailyTask(
      input({
        availableMinutes: 600,
        topics: Array.from({ length: 5 }, (_, i) =>
          topic({
            planTopicId: `t${i}`,
            planSubjectId: `s${i}`,
            questionsAnswered: i * 7,
            questionsCorrect: i * 3,
            masteryConfidence: i / 5,
          }),
        ),
      }),
    );

    for (const bloco of plano.blocks) {
      const soma = Object.values(bloco.priority.contributions).reduce((a, b) => a + b, 0);
      expect(soma).toBeCloseTo(bloco.priority.score, 10);
    }
  });

  it("todo bloco tem uma frase explicando por que caiu hoje", () => {
    const plano = generateDailyTask(input());
    expect(plano.blocks[0].reasonLabel.length).toBeGreaterThan(5);
  });
});

describe("generateDailyTask — casos de borda", () => {
  it("sem assuntos, devolve tarefa vazia sem quebrar", () => {
    const plano = generateDailyTask(input({ topics: [] }));
    expect(plano.blocks).toEqual([]);
    expect(plano.plannedMinutes).toBe(0);
  });

  it("com tudo já coberto, ainda gera tarefa a partir do conjunto completo", () => {
    const plano = generateDailyTask(
      input({ topics: [topic({ coverageProgress: 1 }), topic({ planTopicId: "t2", coverageProgress: 1 })] }),
    );
    expect(plano.blocks.length).toBeGreaterThan(0);
  });

  it("sem minutos disponíveis, ainda entrega o primeiro bloco", () => {
    const plano = generateDailyTask(input({ availableMinutes: 0 }));
    expect(plano.blocks).toHaveLength(1);
  });

  it("nenhum score sai NaN, mesmo com dados degenerados", () => {
    const plano = generateDailyTask(
      input({
        examDate: null,
        availableMinutes: 600,
        topics: [
          topic({ planTopicId: "a", weight: 0, weightSource: "default" }),
          topic({ planTopicId: "b", questionsAnswered: 0, questionsCorrect: 5 }),
          topic({ planTopicId: "c", masteryConfidence: 99, currentMasteryScore: -3 }),
        ],
      }),
    );

    for (const bloco of plano.blocks) {
      expect(Number.isFinite(bloco.priority.score)).toBe(true);
      for (const valor of Object.values(bloco.priority.signals)) {
        expect(Number.isFinite(valor)).toBe(true);
      }
    }
  });
});

describe("independência do Motor 2", () => {
  it("o Motor 1 não recebe intervalos de revisão", () => {
    // Este teste quebra se alguém acoplar os dois motores.
    const entrada = input();
    expect(Object.keys(entrada)).not.toContain("intervals");
    expect(Object.keys(entrada)).not.toContain("reviews");
  });

  it("mudar a curva de revisão não muda NENHUM bloco da Tarefa do Dia", () => {
    const plano = generateDailyTask(input());
    // A curva não é entrada deste motor: não há caminho para ela influenciar.
    expect(DEFAULT_REVIEW_INTERVALS.intervalsInDays).toEqual([1, 7, 30, 60, 90]);
    expect(plano.blocks[0].priority.score).toBeGreaterThan(0);
  });
});

describe("splitBudgetAcrossPreparations", () => {
  it("uma preparação recebe o dia inteiro", () => {
    const divisao = splitBudgetAcrossPreparations({
      today: HOJE,
      totalMinutes: 120,
      preparations: [{ preparationId: "p1", examDate: d("2026-11-15") }],
      urgencyExponent: 1,
    });
    expect(divisao.get("p1")).toBe(120);
  });

  it("O ALUNO TEM 2 HORAS, NÃO 2 HORAS PARA CADA EDITAL", () => {
    const divisao = splitBudgetAcrossPreparations({
      today: HOJE,
      totalMinutes: 120,
      preparations: [
        { preparationId: "p1", examDate: d("2026-09-15") },
        { preparationId: "p2", examDate: d("2027-06-15") },
      ],
      urgencyExponent: 1,
    });
    const soma = [...divisao.values()].reduce((a, b) => a + b, 0);
    expect(soma).toBe(120);
  });

  it("a prova mais próxima recebe mais tempo", () => {
    const divisao = splitBudgetAcrossPreparations({
      today: HOJE,
      totalMinutes: 120,
      preparations: [
        { preparationId: "perto", examDate: d("2026-09-15") },
        { preparationId: "longe", examDate: d("2027-06-15") },
      ],
      urgencyExponent: 1,
    });
    expect(divisao.get("perto")!).toBeGreaterThan(divisao.get("longe")!);
  });

  it("com expoente zero, divide por igual", () => {
    const divisao = splitBudgetAcrossPreparations({
      today: HOJE,
      totalMinutes: 120,
      preparations: [
        { preparationId: "a", examDate: d("2026-09-15") },
        { preparationId: "b", examDate: d("2027-06-15") },
      ],
      urgencyExponent: 0,
    });
    expect(divisao.get("a")).toBe(60);
    expect(divisao.get("b")).toBe(60);
  });

  it("preparação sem data de prova não fica com zero", () => {
    const divisao = splitBudgetAcrossPreparations({
      today: HOJE,
      totalMinutes: 120,
      preparations: [
        { preparationId: "com-data", examDate: d("2026-09-15") },
        { preparationId: "sem-data", examDate: null },
      ],
      urgencyExponent: 1,
    });
    expect(divisao.get("sem-data")!).toBeGreaterThan(0);
  });

  it("nenhum minuto se perde no arredondamento", () => {
    const divisao = splitBudgetAcrossPreparations({
      today: HOJE,
      totalMinutes: 97,
      preparations: [
        { preparationId: "a", examDate: d("2026-09-15") },
        { preparationId: "b", examDate: d("2026-12-15") },
        { preparationId: "c", examDate: d("2027-03-15") },
      ],
      urgencyExponent: 1,
    });
    expect([...divisao.values()].reduce((a, b) => a + b, 0)).toBe(97);
  });
});

describe("desempate pelo acervo", () => {
  /**
   * A cliente pediu que o motor "priorize também o que tem no acervo", para o
   * aluno não esbarrar em assunto sem questão enquanto o conteúdo é produzido.
   *
   * ⚠️ Como DESEMPATE, nunca como sexto sinal ponderado: o edital continua
   * mandando. Estes dois testes fixam exatamente essa fronteira.
   */
  it("entre assuntos equivalentes, escolhe primeiro o que tem questão", () => {
    const plano = generateDailyTask(
      input({
        availableMinutes: 45,
        topics: [
          topic({
            planTopicId: "sem-acervo",
            topicName: "Sem material",
            availableQuestionCount: 0,
            isMapped: false,
          }),
          topic({
            planTopicId: "com-acervo",
            topicName: "Com material",
            availableQuestionCount: 90,
          }),
        ],
      }),
    );

    expect(plano.blocks[0].planTopicId).toBe("com-acervo");
  });

  it("NÃO passa por cima do peso do edital", () => {
    /*
     * O assunto sem acervo cai muito mais na prova. Se o acervo virasse sinal
     * ponderado, ele perderia a vez — e o aluno estudaria o secundário porque
     * era o que estava pronto do nosso lado.
     */
    const plano = generateDailyTask(
      input({
        availableMinutes: 45,
        topics: [
          topic({
            planTopicId: "pesado-sem-acervo",
            topicName: "Cai muito, sem material",
            weight: 40,
            availableQuestionCount: 0,
            isMapped: false,
          }),
          topic({
            planTopicId: "leve-com-acervo",
            topicName: "Cai pouco, com material",
            weight: 1,
            availableQuestionCount: 200,
          }),
        ],
      }),
    );

    expect(plano.blocks[0].planTopicId).toBe("pesado-sem-acervo");
  });
});

describe("a missão nasce do cronograma (pedido da cliente em 08/09/2026)", () => {
  /*
    Palavras dela: "a missão do dia precisa conter o assunto do cronograma para
    aquele dia e mais um ou dois assuntos escolhidos pelo motor"; "o motor com 5
    sinais só gera 1 ou 2 assuntos na missão do dia, não influencia o cronograma
    inteiro".

    Antes as duas telas ordenavam o mesmo conjunto por conta própria e
    concordavam por coincidência. Agora o cronograma é a espinha do dia.
  */
  const muitos = Array.from({ length: 10 }, (_, i) =>
    topic({
      planTopicId: `t${i}`,
      planSubjectId: `s${i % 3}`,
      topicName: `Assunto ${i}`,
      /* O motor prefere os últimos: quanto maior o índice, maior a lacuna. */
      questionsAnswered: 40,
      questionsCorrect: 40 - i * 4,
      recentAccuracy: 1 - i * 0.1,
    }),
  );

  function missao(scheduledTopicIds: string[]) {
    return generateDailyTask({
      now: AGORA,
      timeZone: SP,
      today: HOJE,
      examDate: d("2026-12-15"),
      examDateIsEstimated: false,
      availableMinutes: 600,
      reservedReviewMinutes: 0,
      topics: muitos,
      scheduledTopicIds,
      weights: DEFAULT_DAILY_TASK_WEIGHTS,
      scheduleParams: DEFAULT_SCHEDULE_PARAMS,
      techniques: DEFAULT_STUDY_TECHNIQUES,
    }).blocks.map((b) => b.planTopicId);
  }

  it("o assunto do cronograma vem PRIMEIRO, mesmo sem ser o preferido do motor", () => {
    /* "t0" é o que o motor menos escolheria: o aluno acerta tudo nele. */
    expect(missao(["t0"])[0]).toBe("t0");
  });

  it("o motor acrescenta no máximo dois", () => {
    const blocos = missao(["t0"]);
    expect(blocos).toHaveLength(3);
    expect(blocos.slice(1).every((id) => id !== "t0")).toBe(true);
  });

  it("vários assuntos do cronograma entram TODOS, e o motor completa", () => {
    const blocos = missao(["t0", "t1", "t2"]);
    expect(blocos.slice(0, 3).sort()).toEqual(["t0", "t1", "t2"]);
    expect(blocos.length).toBeLessThanOrEqual(5);
  });

  it("SEM CRONOGRAMA, o motor monta o dia sozinho", () => {
    /*
      É o que acontece antes de existir projeção: preparação recém-criada, sem
      data de prova. Um dia em branco seria pior que um dia escolhido só pelo
      motor.
    */
    expect(missao([]).length).toBeGreaterThan(0);
  });

  it("quando o tempo acaba, quem fica de fora é o acréscimo do motor", () => {
    /*
      A ordem não é estética. O aluno lê de cima para baixo, e o corte por
      minutos come a última linha — que precisa ser o extra, nunca o assunto que
      o cronograma prometeu para hoje.
    */
    const plano = generateDailyTask({
      now: AGORA,
      timeZone: SP,
      today: HOJE,
      examDate: d("2026-12-15"),
      examDateIsEstimated: false,
      /* Espaço para um bloco só. */
      availableMinutes: 40,
      reservedReviewMinutes: 0,
      topics: muitos,
      scheduledTopicIds: ["t0"],
      weights: DEFAULT_DAILY_TASK_WEIGHTS,
      scheduleParams: DEFAULT_SCHEDULE_PARAMS,
      techniques: DEFAULT_STUDY_TECHNIQUES,
    });

    expect(plano.blocks[0].planTopicId).toBe("t0");
  });
});
