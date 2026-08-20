import { describe, expect, it } from "vitest";

import { DEFAULT_DAILY_TASK_WEIGHTS } from "@/modules/engine-config/schemas";
import type { CivilDate } from "@/modules/shared/dates";

import {
  clamp01,
  computePriority,
  editalWeightSignal,
  explainPriority,
  knowledgeGapSignal,
  NEUTRAL,
  performanceSignal,
  recencySignal,
  urgencySignal,
  type Signals,
} from "./signals";

const d = (v: string) => v as CivilDate;
const HOJE = d("2026-08-20");

describe("clamp01", () => {
  it("prende entre 0 e 1", () => {
    expect(clamp01(-5)).toBe(0);
    expect(clamp01(5)).toBe(1);
    expect(clamp01(0.3)).toBe(0.3);
  });

  it("neutraliza qualquer valor não finito em vez de propagar", () => {
    // NaN se propagaria pela soma, sumiria na ordenação e produziria uma
    // Tarefa do Dia vazia sem erro nenhum.
    expect(clamp01(NaN)).toBe(NEUTRAL);
    expect(clamp01(0 / 0)).toBe(NEUTRAL);

    // Infinito também vira NEUTRO, e não 1, embora 1 fosse o clamp
    // matematicamente natural. Infinito num sinal só aparece por divisão por
    // zero, ou seja, por defeito. Entre "o defeito empurra um assunto
    // arbitrário para o topo da lista todo dia" e "o defeito deixa o assunto
    // neutro", a segunda opção é a que não estraga o estudo de ninguém.
    expect(clamp01(Infinity)).toBe(NEUTRAL);
    expect(clamp01(-Infinity)).toBe(NEUTRAL);
  });
});

describe("performanceSignal — desempenho", () => {
  it("quem tem baixo domínio precisa de mais atenção", () => {
    const baixo = performanceSignal({
      initialMastery: "low",
      currentMasteryScore: 0.5,
      masteryConfidence: 0,
    });
    const alto = performanceSignal({
      initialMastery: "high",
      currentMasteryScore: 0.5,
      masteryConfidence: 0,
    });
    expect(baixo).toBeGreaterThan(alto);
  });

  it("sem confiança, vale só o diagnóstico", () => {
    expect(
      performanceSignal({
        initialMastery: "low",
        currentMasteryScore: 0.9,
        masteryConfidence: 0,
      }),
    ).toBeCloseTo(0.8, 5); // 1 - 0.2
  });

  it("com confiança total, o diagnóstico não pesa mais nada", () => {
    // O aluno disse "baixo domínio" mas acerta tudo. Com dado suficiente,
    // o algoritmo passa por cima da percepção inicial.
    expect(
      performanceSignal({
        initialMastery: "low",
        currentMasteryScore: 0.9,
        masteryConfidence: 1,
      }),
    ).toBeCloseTo(0.1, 5);
  });

  it("A PROMESSA DO AVISO: um erro de clique no diagnóstico se corrige sozinho", () => {
    // Aluno marcou "alto domínio" por engano num assunto que não domina.
    const semDados = performanceSignal({
      initialMastery: "high",
      currentMasteryScore: 0.5,
      masteryConfidence: 0,
    });
    const comDados = performanceSignal({
      initialMastery: "high",
      currentMasteryScore: 0.2, // errando muito na prática
      masteryConfidence: 0.9,
    });
    expect(comDados).toBeGreaterThan(semDados);
    expect(comDados).toBeGreaterThan(0.7);
  });

  it("sem diagnóstico algum, parte do neutro", () => {
    expect(
      performanceSignal({
        initialMastery: null,
        currentMasteryScore: 0.5,
        masteryConfidence: 0,
      }),
    ).toBeCloseTo(0.5, 5);
  });
});

describe("editalWeightSignal — peso no edital", () => {
  it("o assunto de maior peso satura em 1", () => {
    expect(
      editalWeightSignal({ weight: 12, weightSource: "edital", maxWeightInPreparation: 12 }),
    ).toBe(1);
  });

  it("é proporcional ao maior peso da preparação", () => {
    expect(
      editalWeightSignal({ weight: 6, weightSource: "edital", maxWeightInPreparation: 12 }),
    ).toBe(0.5);
  });

  it("PESO NÃO INFORMADO É NEUTRO, NUNCA ZERO", () => {
    // Zero afundaria o assunto por uma informação que não temos. O edital não
    // disse que ele é irrelevante — ele apenas não disse nada.
    expect(
      editalWeightSignal({ weight: null, weightSource: "default", maxWeightInPreparation: 12 }),
    ).toBe(NEUTRAL);
  });

  it("peso informado pelo aluno vale igual ao do edital", () => {
    expect(
      editalWeightSignal({ weight: 12, weightSource: "student", maxWeightInPreparation: 12 }),
    ).toBe(1);
  });

  it("não divide por zero quando nenhum assunto tem peso", () => {
    expect(
      editalWeightSignal({ weight: 5, weightSource: "edital", maxWeightInPreparation: 0 }),
    ).toBe(NEUTRAL);
  });
});

describe("urgencySignal — urgência", () => {
  const base = { today: HOJE, examDateIsEstimated: false, coverageProgress: 0 };

  it("cresce conforme a prova se aproxima", () => {
    const longe = urgencySignal({ ...base, examDate: d("2027-08-20") });
    const media = urgencySignal({ ...base, examDate: d("2026-11-20") });
    const perto = urgencySignal({ ...base, examDate: d("2026-09-05") });

    expect(media).toBeGreaterThan(longe);
    expect(perto).toBeGreaterThan(media);
  });

  it("SEM DATA DE PROVA, é neutra — não acelera em cima de nada", () => {
    expect(urgencySignal({ ...base, examDate: null })).toBe(NEUTRAL);
  });

  it("DATA ESTIMADA pelo aluno também é neutra", () => {
    // Acelerar em cima de uma data inventada faria o motor sacrificar
    // profundidade por velocidade com base em nada.
    expect(
      urgencySignal({ ...base, examDate: d("2026-09-01"), examDateIsEstimated: true }),
    ).toBe(NEUTRAL);
  });

  it("o que já foi coberto pressiona menos", () => {
    const naoCoberto = urgencySignal({
      ...base,
      examDate: d("2026-09-05"),
      coverageProgress: 0,
    });
    const coberto = urgencySignal({
      ...base,
      examDate: d("2026-09-05"),
      coverageProgress: 1,
    });
    expect(naoCoberto).toBeGreaterThan(coberto);
  });

  it("mesmo coberto, o calendário ainda pressiona um pouco", () => {
    // Piso de 30%: revisar também compete por tempo.
    const coberto = urgencySignal({
      ...base,
      examDate: d("2026-08-25"),
      coverageProgress: 1,
    });
    expect(coberto).toBeGreaterThan(0);
  });

  it("prova hoje ou vencida satura em 1 e nunca fica negativa", () => {
    expect(urgencySignal({ ...base, examDate: HOJE })).toBe(1);
    expect(urgencySignal({ ...base, examDate: d("2026-01-01") })).toBe(1);
  });

  it("a curva acelera no fim, não é linear", () => {
    const de180 = urgencySignal({ ...base, examDate: d("2027-02-16") });
    const de90 = urgencySignal({ ...base, examDate: d("2026-11-18") });
    const de30 = urgencySignal({ ...base, examDate: d("2026-09-19") });

    // O salto dos últimos 60 dias é maior que o dos 90 anteriores.
    expect(de30 - de90).toBeGreaterThan(de90 - de180);
  });
});

describe("recencySignal — recência", () => {
  it("NUNCA TOCADO é o máximo", () => {
    // Tratar como neutro faria o motor preferir revisitar o conhecido a
    // avançar no desconhecido.
    expect(recencySignal({ today: HOJE, lastTouchedOn: null })).toBe(1);
  });

  it("tocado hoje é zero", () => {
    expect(recencySignal({ today: HOJE, lastTouchedOn: HOJE })).toBe(0);
  });

  it("cresce com os dias sem contato", () => {
    const ontem = recencySignal({ today: HOJE, lastTouchedOn: d("2026-08-19") });
    const semanaPassada = recencySignal({ today: HOJE, lastTouchedOn: d("2026-08-13") });
    expect(semanaPassada).toBeGreaterThan(ontem);
  });

  it("satura em 1 depois de três semanas", () => {
    expect(recencySignal({ today: HOJE, lastTouchedOn: d("2026-07-01") })).toBe(1);
  });

  it("data futura não gera valor negativo", () => {
    expect(recencySignal({ today: HOJE, lastTouchedOn: d("2026-09-01") })).toBe(0);
  });
});

describe("knowledgeGapSignal — lacunas", () => {
  it("sem nenhuma resposta, é neutro", () => {
    expect(
      knowledgeGapSignal({ questionsAnswered: 0, questionsCorrect: 0, recentAccuracy: null }),
    ).toBe(NEUTRAL);
  });

  it("AMOSTRA PEQUENA NÃO VIRA LACUNA", () => {
    // 2 questões e 2 erros dão 100% de erro — mas isso é ruído, não lacuna.
    const poucos = knowledgeGapSignal({
      questionsAnswered: 2,
      questionsCorrect: 0,
      recentAccuracy: null,
    });
    const muitos = knowledgeGapSignal({
      questionsAnswered: 30,
      questionsCorrect: 0,
      recentAccuracy: null,
    });
    expect(poucos).toBeLessThan(muitos);
    expect(poucos).toBeLessThan(0.75);
    expect(muitos).toBeGreaterThan(0.9);
  });

  it("errar muito aumenta o sinal", () => {
    const errando = knowledgeGapSignal({
      questionsAnswered: 20,
      questionsCorrect: 4,
      recentAccuracy: 0.2,
    });
    const acertando = knowledgeGapSignal({
      questionsAnswered: 20,
      questionsCorrect: 18,
      recentAccuracy: 0.9,
    });
    expect(errando).toBeGreaterThan(acertando);
  });

  it("LACUNA RESOLVIDA DEIXA DE SER LACUNA", () => {
    // Errava muito no passado, vem acertando agora. Insistir desperdiça o dia.
    const melhorou = knowledgeGapSignal({
      questionsAnswered: 40,
      questionsCorrect: 12, // 30% histórico
      recentAccuracy: 0.95, // mas 95% recente
    });
    const continuaErrando = knowledgeGapSignal({
      questionsAnswered: 40,
      questionsCorrect: 12,
      recentAccuracy: 0.25,
    });
    expect(melhorou).toBeLessThan(continuaErrando);
  });
});

describe("computePriority", () => {
  const signals: Signals = {
    performance: 0.8,
    editalWeight: 0.6,
    urgency: 0.4,
    recency: 1,
    knowledgeGap: 0.5,
  };

  it("A INVARIANTE: a soma das contribuições é exatamente o score", () => {
    // É o que torna a linha auto-verificável — se não somar, está corrompida.
    const resultado = computePriority(signals, DEFAULT_DAILY_TASK_WEIGHTS);
    const soma = Object.values(resultado.contributions).reduce((a, b) => a + b, 0);
    expect(soma).toBeCloseTo(resultado.score, 10);
  });

  it("guarda os sinais CRUS além das contribuições", () => {
    // É o que permite simular "e se a urgência valesse 40%?" sobre o que ficou
    // gravado, sem reprocessar o histórico.
    const resultado = computePriority(signals, DEFAULT_DAILY_TASK_WEIGHTS);
    expect(resultado.signals).toEqual(signals);
    expect(resultado.contributions.urgency).toBeCloseTo(0.4 * 0.2, 10);
  });

  it("o score fica entre 0 e 1 quando todos os sinais estão no intervalo", () => {
    const zero = computePriority(
      { performance: 0, editalWeight: 0, urgency: 0, recency: 0, knowledgeGap: 0 },
      DEFAULT_DAILY_TASK_WEIGHTS,
    );
    const um = computePriority(
      { performance: 1, editalWeight: 1, urgency: 1, recency: 1, knowledgeGap: 1 },
      DEFAULT_DAILY_TASK_WEIGHTS,
    );
    expect(zero.score).toBe(0);
    expect(um.score).toBeCloseTo(1, 10);
  });

  it("mudar os pesos muda o score, e o breakdown continua somando", () => {
    const outrosPesos = {
      performance: 10,
      editalWeight: 10,
      urgency: 60,
      recency: 10,
      knowledgeGap: 10,
    };
    const resultado = computePriority(signals, outrosPesos);
    const soma = Object.values(resultado.contributions).reduce((a, b) => a + b, 0);
    expect(soma).toBeCloseTo(resultado.score, 10);
    expect(resultado.contributions.urgency).toBeCloseTo(0.4 * 0.6, 10);
  });

  it("SIMULAÇÃO RETROATIVA: dá para repesar sobre os sinais gravados", () => {
    // O caso de uso real da calibração: "e se a urgência valesse 40%?"
    const gravado = computePriority(signals, DEFAULT_DAILY_TASK_WEIGHTS);

    const novosPesos = {
      performance: 20,
      editalWeight: 20,
      urgency: 40,
      recency: 10,
      knowledgeGap: 10,
    };
    const simulado = computePriority(gravado.signals, novosPesos);

    expect(simulado.score).not.toBeCloseTo(gravado.score, 3);
    expect(simulado.contributions.urgency).toBeCloseTo(0.4 * 0.4, 10);
  });
});

describe("explainPriority", () => {
  it("aponta o sinal que MAIS contribuiu, não o maior sinal cru", () => {
    // Recência é 1 (o maior sinal cru) mas vale só 15%.
    // Desempenho é 0,9 e vale 30% — contribui mais.
    const resultado = computePriority(
      {
        performance: 0.9,
        editalWeight: 0,
        urgency: 0,
        recency: 1,
        knowledgeGap: 0,
      },
      DEFAULT_DAILY_TASK_WEIGHTS,
    );
    expect(explainPriority(resultado)).toBe("você ainda não domina este assunto");
  });

  it("devolve frase legível para cada sinal dominante", () => {
    const casos: Array<[keyof Signals, string]> = [
      ["performance", "você ainda não domina este assunto"],
      ["editalWeight", "este assunto pesa muito no seu edital"],
      ["urgency", "a prova está chegando e falta cobrir isto"],
      ["recency", "faz tempo que você não estuda isto"],
      ["knowledgeGap", "seus erros se concentram aqui"],
    ];

    for (const [sinal, frase] of casos) {
      const zerado: Signals = {
        performance: 0,
        editalWeight: 0,
        urgency: 0,
        recency: 0,
        knowledgeGap: 0,
      };
      zerado[sinal] = 1;
      expect(explainPriority(computePriority(zerado, DEFAULT_DAILY_TASK_WEIGHTS))).toBe(frase);
    }
  });
});
