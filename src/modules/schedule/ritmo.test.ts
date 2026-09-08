import { describe, expect, it } from "vitest";

import { DEFAULT_SCHEDULE_PARAMS } from "@/modules/engine-config/schemas";
import type { CivilDate } from "@/modules/shared/dates";

import { projectSchedule, type PendingTopic } from "./index";

/**
 * O RITMO PRECISA REDUZIR A CARGA DIÁRIA QUANDO A PROVA ESTÁ LONGE.
 * ============================================================================
 *
 * ⚠️ A CLIENTE RELATOU O MESMO PROBLEMA DUAS VEZES, por ângulos diferentes.
 *
 * Primeiro: "no cronograma está marcando apenas um assunto para o dia 02/09 e
 * na Missão do dia aparecem 7 conteúdos". Era ordem, e foi corrigido com a
 * alternância compartilhada.
 *
 * Depois: "apareceram 6 tarefas para o dia, enquanto no cronograma não aparece
 * nenhum assunto para hoje. Essa prova será em dezembro, então está com no
 * máximo 2 assuntos para cada dia". Era QUANTIDADE, e a causa é este ritmo: o
 * Cronograma o aplica, a Tarefa do Dia não aplicava.
 *
 * Este teste trava o comportamento do lado do Cronograma. O da Tarefa do Dia é
 * garantido por construção: ela passou a ler os minutos que a projeção reservou
 * para hoje, em vez de recalcular.
 */

const HOJE = "2026-09-04" as CivilDate;

/** Duas horas livres todo dia. */
const DISPONIBILIDADE = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  minutesAvailable: 120,
}));

function assuntos(quantos: number): PendingTopic[] {
  return Array.from({ length: quantos }, (_, i) => ({
    planTopicId: `t${i}`,
    planSubjectId: `s${i % 4}`,
    subjectName: `Disciplina ${i % 4}`,
    topicName: `Assunto ${i}`,
    remainingMinutes: 45,
    priorityScore: 100 - i,
    masteryLevel: null,
  }));
}

function projetar(examDate: CivilDate | null) {
  return projectSchedule({
    today: HOJE,
    examDate,
    examDateIsEstimated: false,
    availability: DISPONIBILIDADE,
    pendingTopics: assuntos(40),
    averageReviewMinutesPerDay: 0,
    scheduleParams: DEFAULT_SCHEDULE_PARAMS,
  });
}

/** Assuntos que a projeção reservou para o primeiro dia. */
function assuntosDeHoje(examDate: CivilDate | null): number {
  const projecao = projetar(examDate);
  const hoje = projecao.weeks[0]?.days.find((d) => d.date === HOJE);
  return hoje?.topics.length ?? 0;
}

describe("ritmo do cronograma", () => {
  it("prova longe carrega MENOS por dia que prova perto", () => {
    /*
      O mesmo conteúdo, duas datas. É a promessa do produto: "a projeção do que
      falta com o tempo que você tem". Sem o ritmo, os dois davam o mesmo dia
      cheio e o plano terminava meses antes da prova.
    */
    const dezembro = assuntosDeHoje("2026-12-15" as CivilDate);
    const duasSemanas = assuntosDeHoje("2026-09-18" as CivilDate);

    expect(duasSemanas).toBeGreaterThan(dezembro);
  });

  it("prova distante não empilha o dia", () => {
    /*
      ⚠️ O NÚMERO QUE A CLIENTE VIU.

      Com prova em dezembro ela esperava no máximo 2 assuntos por dia, e a
      Tarefa do Dia mostrava 6. O Cronograma sempre esteve certo; o teste trava
      isso para que continue.
    */
    expect(assuntosDeHoje("2026-12-15" as CivilDate)).toBeLessThanOrEqual(2);
  });

  it("sem data de prova ainda distribui, sem despejar tudo hoje", () => {
    /*
      Sem data o horizonte cai no padrão de 90 dias. O ritmo continua valendo:
      um aluno que não sabe a data não deve receber quarenta assuntos hoje.
    */
    expect(assuntosDeHoje(null)).toBeLessThanOrEqual(3);
  });

  it("prova apertada usa o dia inteiro", () => {
    /*
      Quando não cabe, o ritmo é preso em 1 e a resposta certa é usar cada
      minuto. `topicsAtRisk` é quem avisa o que ficará de fora.
    */
    const projecao = projetar("2026-09-08" as CivilDate);
    const hoje = projecao.weeks[0]?.days.find((d) => d.date === HOJE);

    expect(hoje!.topics.length).toBeGreaterThan(1);
    expect(projecao.feasibility.fits).toBe(false);
    expect(projecao.feasibility.topicsAtRisk.length).toBeGreaterThan(0);
  });
});
