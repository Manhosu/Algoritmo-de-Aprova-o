import { describe, expect, it } from "vitest";

import { DEFAULT_SCHEDULE_PARAMS } from "@/modules/engine-config/schemas";
import type { CivilDate } from "@/modules/shared/dates";

import {
  canEngineReschedule,
  MAX_TOPICS_PER_DAY,
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
    masteryLevel: null,
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

  it("usa TODO o período até a prova, e a última semana tem conteúdo", () => {
    /**
     * ⚠️ ESTE TESTE MUDOU DE LADO EM 28/08/2026, e o motivo importa.
     *
     * Ele exigia o contrário — "não desenha semanas vazias depois de distribuir
     * tudo" — porque o plano era guloso: enchia os primeiros dias até o teto e
     * parava quando o conteúdo acabava.
     *
     * Era esse o defeito que a cliente relatou. Com prova em outubro ela via
     * quatro ou cinco assuntos empilhados nos primeiros dias, o plano
     * terminando em meados de setembro, e adiar a prova não mudava nada.
     *
     * Agora o conteúdo é espalhado por todo o período. A última semana ainda
     * precisa ter conteúdo — plano que termina cedo continua sendo erro; o que
     * mudou é que ele termina PERTO DA PROVA, não perto de hoje.
     */
    /*
      ⚠️ COM UM EDITAL DE VERDADE. Reescrito em 08/09/2026.

      A versão anterior usava dois assuntos e 87 dias, o que hoje é um caso
      degenerado: com um assunto por dia no mínimo, dois assuntos acabam no
      segundo dia. Edital de concurso tem centenas de assuntos, e é aí que a
      distribuição precisa alcançar a prova.
    */
    const edital = Array.from({ length: 150 }, (_, i) => topic(`t${i}`, 30));
    const projecao = projectSchedule(input({ pendingTopics: edital }));

    const semanasNoHorizonte = Math.ceil(projecao.summary.daysRemaining / 7);
    expect(projecao.weeks.length).toBeGreaterThan(semanasNoHorizonte - 2);
    expect(projecao.weeks.at(-1)!.topics.length).toBeGreaterThan(0);
  });

  it("CONTEÚDO CURTO acaba cedo em vez de deixar buracos pelo caminho", () => {
    /*
      ⚠️ A ESCOLHA QUE A CLIENTE FEZ EM 08/09/2026, escrita aqui para não ser
      desfeita por engano.

      Dois assuntos e 87 dias não dão para preencher todos os dias: ou o plano
      espalha e deixa dias em branco no meio, ou concentra e termina cedo. Ela
      pediu "o cronograma não pode ter dias vazios", então ele termina cedo. O
      tempo que sobra não fica ocioso — as revisões do Motor 2 caem nesses dias,
      e a Tarefa do Dia continua com piso de um bloco.
    */
    const projecao = projectSchedule(input({
      pendingTopics: [topic("a", 30), topic("b", 30)],
    }));

    const diasComEstudo = projecao.weeks
      .flatMap((semana) => semana.days)
      .filter((dia) => dia.topics.length > 0);

    /* Dias seguidos, sem pular nenhum dia com disponibilidade no meio. */
    expect(diasComEstudo).toHaveLength(2);
    expect(diasComEstudo[0].date).toBe("2026-08-20");
    expect(diasComEstudo[1].date).toBe("2026-08-21");
  });

  it("com MAIS tempo, distribui MENOS conteúdo por dia", () => {
    /**
     * O pedido da cliente, no formato dela: "se restam 20 dias, distribui os
     * temas pelos 20 dias; se restam 100, pelos 100, com carga diária menor".
     *
     * O mesmo conteúdo, dois horizontes. O teste compara os minutos planejados
     * na PRIMEIRA semana, que é onde o plano guloso concentrava tudo.
     */
    const edital = Array.from({ length: 150 }, (_, i) => topic(`t${i}`, 30));

    const curto = projectSchedule(input({ examDate: d("2026-09-15"), pendingTopics: edital }));
    const longo = projectSchedule(input({ examDate: d("2026-12-15"), pendingTopics: edital }));

    /*
      ⚠️ A COMPARAÇÃO É EM ASSUNTOS POR DIA, e não em minutos. O cronograma
      passou a contar assuntos em 08/09/2026, para nunca partir um deles entre
      dois dias. Ver a nota em `buildWeeks`.
    */
    const porDia = (p: ReturnType<typeof projectSchedule>) =>
      Math.max(...p.weeks[0].days.map((dia) => dia.topics.length));

    expect(porDia(curto)).toBeGreaterThan(porDia(longo));
  });

  it("NENHUM ASSUNTO SOME: ou está no cronograma, ou está avisado", () => {
    /*
      Espalhar não pode virar esquecer. A conferência mudou de minutos para
      assuntos junto com o cronograma: cada assunto pendente aparece uma vez na
      distribuição ou entra na lista do que não cabe, e nunca nas duas nem em
      nenhuma.
    */
    const pendentes = Array.from({ length: 40 }, (_, i) => topic(`t${i}`, 30));
    const projecao = projectSchedule(input({
      examDate: d("2026-12-15"),
      pendingTopics: pendentes,
    }));

    const distribuidos = projecao.weeks
      .flatMap((semana) => semana.days)
      .flatMap((dia) => dia.topics)
      .map((t) => t.planTopicId);

    expect(new Set(distribuidos).size, "assunto repetido na distribuição").toBe(
      distribuidos.length,
    );

    const cobertos = distribuidos.length + projecao.feasibility.topicsAtRisk.length;
    expect(cobertos).toBe(pendentes.length);
  });

  it("quando NÃO cabe, enche o dia até o teto de cinco assuntos", () => {
    /**
     * O ritmo é um espalhador, não um freio. Se o conteúdo não cabe até a
     * prova, segurar o passo garantiria que ele não caiba. A resposta certa é
     * encher os dias até o limite que a cliente definiu e dizer o que ficará de
     * fora, que é o papel de `topicsAtRisk`.
     */
    const projecao = projectSchedule(
      input({ pendingTopics: Array.from({ length: 800 }, (_, i) => topic(`t${i}`, 120)) }),
    );

    expect(projecao.feasibility.fits).toBe(false);

    const diasComEstudo = projecao.weeks[0].days.filter((dia) => dia.availableMinutes > 0);
    for (const dia of diasComEstudo) {
      expect(dia.topics.length, `${dia.date} não encheu`).toBe(MAX_TOPICS_PER_DAY);
    }
  });

  it("NUNCA passa do teto de assuntos por dia", () => {
    /*
      Palavras da cliente em 08/09/2026: "existe uma quantidade limitada de
      assuntos por dia, não podendo ultrapassar o limite (pode ser 5 assuntos no
      máximo), se for necessário ultrapassar informar assuntos que não cabem".
    */
    const projecao = projectSchedule(
      input({ pendingTopics: Array.from({ length: 800 }, (_, i) => topic(`t${i}`, 30)) }),
    );

    for (const semana of projecao.weeks) {
      for (const dia of semana.days) {
        expect(dia.topics.length).toBeLessThanOrEqual(MAX_TOPICS_PER_DAY);
      }
    }

    expect(projecao.feasibility.topicsAtRisk.length).toBeGreaterThan(0);
  });

  it("DIA COM DISPONIBILIDADE NÃO FICA VAZIO enquanto há assunto na fila", () => {
    /*
      Palavras da cliente em 08/09/2026: "o cronograma não pode ter dias
      vazios". Ela viu terça e sexta em branco numa semana com tempo nos dois.

      Dia com ZERO de disponibilidade continua vazio, e isso é a agenda dela
      sendo respeitada.
    */
    const projecao = projectSchedule(
      input({ pendingTopics: Array.from({ length: 400 }, (_, i) => topic(`t${i}`, 30)) }),
    );

    for (const semana of projecao.weeks) {
      for (const dia of semana.days) {
        if (dia.availableMinutes > 0) {
          expect(dia.topics.length, `${dia.date} ficou vazio`).toBeGreaterThan(0);
        } else {
          expect(dia.topics, `${dia.date} recebeu estudo sem ter tempo`).toHaveLength(0);
        }
      }
    }
  });

  it("não parte um assunto entre dois dias quando ele cabe inteiro", () => {
    /**
     * Pedido da cliente (31/08/2026): "não quebrar os temas em 2 dias quando
     * ultrapassar o tempo".
     *
     * Partir aproveita cada minuto no papel, e na prática deixa uma pendência
     * arrastando: o aluno abre a Tarefa do Dia com um pedaço de tema que nem
     * lembra de ter começado.
     *
     * Os números são os dela: assuntos de 27 minutos, rotina de 2 horas.
     */
    const assuntos = Array.from({ length: 12 }, (_, i) => topic(`t${i}`, 27));
    const projecao = projectSchedule(
      input({
        examDate: d("2026-10-20"),
        pendingTopics: assuntos,
        availability: [
          { weekday: 0, minutesAvailable: 0 },
          { weekday: 1, minutesAvailable: 120 },
          { weekday: 2, minutesAvailable: 0 },
          { weekday: 3, minutesAvailable: 120 },
          { weekday: 4, minutesAvailable: 0 },
          { weekday: 5, minutesAvailable: 120 },
          { weekday: 6, minutesAvailable: 240 },
        ],
      }),
    );

    // Cada assunto aparece uma vez só, com os 27 minutos inteiros.
    const porAssunto = new Map<string, number[]>();
    for (const semana of projecao.weeks) {
      for (const dia of semana.days) {
        for (const t of dia.topics) {
          porAssunto.set(t.planTopicId, [...(porAssunto.get(t.planTopicId) ?? []), t.minutes]);
        }
      }
    }

    for (const [id, blocos] of porAssunto) {
      expect(blocos.length, `${id} foi partido em ${blocos.length} dias`).toBe(1);
      expect(blocos[0], `${id} entrou com zero minuto`).toBeGreaterThan(0);
    }

    expect(porAssunto.size, "nenhum assunto foi distribuído").toBeGreaterThan(0);
  });

  it("ASSUNTO MAIOR QUE O DIA continua num dia só, com a sessão que cabe", () => {
    /*
      ⚠️ ESTE TESTE TROCOU DE LADO EM 08/09/2026, e o motivo está registrado.

      Antes ele exigia que um assunto de 4 horas fosse PARTIDO entre os dias de
      uma rotina de 1 hora, porque o cronograma distribuía minutos e um assunto
      sem espaço travaria a fila para sempre.

      Contando assuntos, esse impasse não existe: o assunto ocupa um dia, com a
      sessão que o dia comporta, e a estimativa maior continua contando na
      viabilidade. A cliente foi explícita: "não repetir assuntos de um dia para
      o outro".
    */
    const projecao = projectSchedule(
      input({
        examDate: d("2026-10-20"),
        pendingTopics: [topic("gigante", 240)],
        availability: [
          { weekday: 0, minutesAvailable: 0 },
          { weekday: 1, minutesAvailable: 60 },
          { weekday: 2, minutesAvailable: 60 },
          { weekday: 3, minutesAvailable: 60 },
          { weekday: 4, minutesAvailable: 60 },
          { weekday: 5, minutesAvailable: 60 },
          { weekday: 6, minutesAvailable: 60 },
        ],
      }),
    );

    const aparicoes = projecao.weeks
      .flatMap((s) => s.days)
      .flatMap((dia) => dia.topics)
      .filter((t) => t.planTopicId === "gigante");

    expect(aparicoes, "o assunto gigante sumiu do plano").toHaveLength(1);
    expect(aparicoes[0].minutes).toBeGreaterThan(0);
    /* A estimativa cheia continua na conta da viabilidade. */
    expect(projecao.summary.minutesRemaining).toBe(240);
  });

  it("não pica o conteúdo em blocos curtos demais para estudar", () => {
    /**
     * ⚠️ Espalhar por proporção pura daria três minutos por dia num horizonte
     * longo. Três minutos não é uma sessão de estudo — o tempo se acumula e o
     * estudo sai em blocos, mais espaçados.
     *
     * O piso é `defaultStudyBlockMinutes`, o mesmo que a Tarefa do Dia usa.
     */
    const projecao = projectSchedule(input({
      examDate: d("2026-12-15"),
      pendingTopics: [topic("a", 60)],
    }));

    const diasComEstudo = projecao.weeks
      .flatMap((semana) => semana.days)
      .filter((dia) => dia.topics.length > 0);

    for (const dia of diasComEstudo) {
      const minutos = dia.topics.reduce((soma, t) => soma + t.minutes, 0);
      expect(minutos, `${dia.date} recebeu um bloco curto demais`).toBeGreaterThanOrEqual(15);
    }
  });
});

describe("ordem do cronograma (pedido da cliente em 08/09/2026)", () => {
  /*
    Palavras dela: "o cronograma é formado em primeiro os assuntos de baixo
    domínio, depois domínio intermediário, depois assuntos com mais afinidade
    (conforme indicado pelo usuário no diagnóstico inicial)".

    E o porquê, dela também: "o motor com 5 sinais só gera 1 ou 2 assuntos na
    missão do dia, não influencia o cronograma inteiro". O Motor 1 reage ao
    desempenho de hoje; o cronograma é o mapa dos próximos meses.
  */
  function comDominio(
    id: string,
    nivel: "low" | "medium" | "high" | null,
    priority: number,
  ): PendingTopic {
    return { ...topic(id, 30, priority), masteryLevel: nivel };
  }

  function ordemNoPlano(projecao: ReturnType<typeof projectSchedule>): string[] {
    return projecao.weeks
      .flatMap((semana) => semana.days)
      .flatMap((dia) => dia.topics)
      .map((t) => t.planTopicId);
  }

  it("baixo domínio vem primeiro, afinidade por último", () => {
    const projecao = projectSchedule(
      input({
        pendingTopics: [
          comDominio("alto", "high", 0.9),
          comDominio("baixo", "low", 0.1),
          comDominio("medio", "medium", 0.5),
        ],
      }),
    );

    expect(ordemNoPlano(projecao)).toEqual(["baixo", "medio", "alto"]);
  });

  it("O MOTOR 1 NÃO REORDENA O CRONOGRAMA, só desempata dentro da faixa", () => {
    /*
      "alto" tem a maior prioridade do Motor 1 e mesmo assim fica por último:
      o diagnóstico manda. Sem esta regra, uma sequência de erros numa
      disciplina reescreveria o mapa inteiro dos próximos meses.
    */
    const projecao = projectSchedule(
      input({
        pendingTopics: [
          comDominio("alto", "high", 99),
          comDominio("baixo-b", "low", 1),
          comDominio("baixo-a", "low", 2),
        ],
      }),
    );

    expect(ordemNoPlano(projecao)).toEqual(["baixo-a", "baixo-b", "alto"]);
  });

  it("sem diagnóstico, o assunto cai no meio", () => {
    /* Tratar como baixo domínio o jogaria para a frente sem nada que justifique. */
    const projecao = projectSchedule(
      input({
        pendingTopics: [
          comDominio("alto", "high", 0.5),
          comDominio("sem", null, 0.5),
          comDominio("baixo", "low", 0.5),
        ],
      }),
    );

    expect(ordemNoPlano(projecao)).toEqual(["baixo", "sem", "alto"]);
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
    expect(projecao.feasibility.topicsAtRisk).not.toContain("Assunto critico");
    expect(projecao.feasibility.topicsAtRisk).toContain("Assunto baixo");

    /**
     * ⚠️ NOME, NÃO ID — e é por isso que esta asserção existe separada.
     *
     * A versão anterior deste teste checava `toContain("baixo")`, que passava
     * com o ID `"baixo"` E com o nome `"Assunto baixo"`. O campo carregava o
     * `planTopicId`, e a tela mostrava uma lista de UUIDs para o aluno debaixo
     * de "Não cabem antes da prova". O tipo é `string[]` dos dois jeitos, então
     * nem o TypeScript nem o teste reclamaram.
     */
    for (const nome of projecao.feasibility.topicsAtRisk) {
      expect(nome, "topicsAtRisk vai direto para a tela: precisa ser nome").toMatch(
        /^Assunto /,
      );
    }
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

  it("um assunto grande NÃO é fatiado entre semanas", () => {
    /* Trocou de lado em 08/09/2026, junto com a regra de não partir assunto. */
    const projecao = projectSchedule(input({ pendingTopics: [topic("grande", 2000, 0.9)] }));
    const aparicoes = projecao.weeks.flatMap((w) =>
      w.topics.filter((t) => t.planTopicId === "grande"),
    );
    expect(aparicoes).toHaveLength(1);
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

describe("divisão do tempo do dia (pedido da cliente em 08/09/2026)", () => {
  /*
    Palavras dela: "o Cronograma poderia dividir o tempo do dia igualmente entre
    os assuntos daquele dia". A distribuição é gulosa por natureza — enche o
    primeiro assunto com a estimativa dele e dá o resto ao seguinte —, e "45 e
    15" na tela parece dizer que um assunto vale três vezes o outro.
  */
  function diasComVariosAssuntos(projecao: ReturnType<typeof projectSchedule>) {
    return projecao.weeks
      .flatMap((semana) => semana.days)
      .filter((dia) => dia.topics.length > 1);
  }

  it("todo dia com mais de um assunto reparte o tempo por igual", () => {
    /*
      Desde 08/09/2026 a divisão é igual POR CONSTRUÇÃO: cada assunto do dia
      vale uma sessão, e a sessão encolhe quando o dia não comporta uma inteira
      para cada um. Este teste continua porque a construção pode ser desfeita
      sem ninguém notar, e o "45 e 15" que ela reclamou voltaria.
    */
    const projecao = projectSchedule(
      input({
        examDate: d("2026-09-10"),
        pendingTopics: Array.from({ length: 200 }, (_, i) => topic(`t${i}`, 30)),
      }),
    );

    const dias = diasComVariosAssuntos(projecao);
    expect(dias.length).toBeGreaterThan(0);

    for (const dia of dias) {
      const minutos = dia.topics.map((t) => t.minutes);
      /* Só a sobra da divisão pode diferir, e ela é de um minuto. */
      expect(Math.max(...minutos) - Math.min(...minutos)).toBeLessThanOrEqual(1);
    }
  });

  it("repartir não cria nem some minuto, e não estoura o dia", () => {
    /*
      ⚠️ É O QUE PERMITE A DIVISÃO ENTRAR DEPOIS DA DISTRIBUIÇÃO.

      Se ela mexesse no total, desmancharia o teto do ritmo — o mecanismo que
      espalha o conteúdo quando falta muito para a prova — e o dia passaria a
      somar mais que a própria capacidade.
    */
    const projecao = projectSchedule(
      input({
        examDate: d("2026-09-10"),
        pendingTopics: Array.from({ length: 200 }, (_, i) => topic(`t${i}`, 30)),
      }),
    );

    for (const semana of projecao.weeks) {
      const somaDosDias = semana.days.reduce(
        (soma, dia) => soma + dia.topics.reduce((s, t) => s + t.minutes, 0),
        0,
      );

      expect(somaDosDias).toBe(semana.plannedMinutes);

      for (const dia of semana.days) {
        const total = dia.topics.reduce((s, t) => s + t.minutes, 0);
        expect(total).toBeLessThanOrEqual(dia.availableMinutes);
        /* Ninguém recebe zero: um assunto com zero minuto não é um assunto. */
        for (const t of dia.topics) expect(t.minutes).toBeGreaterThan(0);
      }
    }
  });
});

describe("projectSchedule — o dia de hoje é a missão de hoje", () => {
  /*
    Palavras da cliente em 11/09/2026: "as 3 tarefas do cronograma não é
    nenhuma das 6 das Missões do Dia". Ela tinha concluído as seis; o cronograma
    tirou as seis da fila e mostrou os três próximos no lugar de hoje.
  */
  const pendentes = ["b", "c", "d", "e", "f", "g"].map((id) => topic(id, 45));

  it("com a missão, hoje mostra os assuntos dela, com o que já foi feito", () => {
    const projecao = projectSchedule(
      input({
        pendingTopics: pendentes,
        todayPlan: [
          { planTopicId: "a", topicName: "Assunto a", done: true },
          { planTopicId: "b", topicName: "Assunto b", done: false },
        ],
      }),
    );

    const hoje = projecao.weeks[0].days[0];
    expect(hoje.date).toBe(HOJE);
    expect(hoje.topics.map((t) => [t.planTopicId, t.done])).toEqual([
      ["a", true],
      ["b", false],
    ]);
  });

  it("o que está na missão de hoje não reaparece nos dias seguintes", () => {
    const projecao = projectSchedule(
      input({
        pendingTopics: pendentes,
        todayPlan: [{ planTopicId: "b", topicName: "Assunto b", done: false }],
      }),
    );

    const depois = projecao.weeks
      .flatMap((semana) => semana.days)
      .filter((dia) => dia.date !== HOJE)
      .flatMap((dia) => dia.topics.map((t) => t.planTopicId));

    expect(depois).not.toContain("b");
    expect(new Set(depois)).toEqual(new Set(["c", "d", "e", "f", "g"]));
  });

  it("⚠️ o caso da cliente: concluir tudo de hoje não troca os assuntos de hoje", () => {
    /* Os seis foram estudados: saíram da fila, e a missão continua sendo hoje. */
    const missao = ["m1", "m2", "m3", "m4", "m5", "m6"].map((id) => ({
      planTopicId: id,
      topicName: `Assunto ${id}`,
      done: true,
    }));

    const projecao = projectSchedule(input({ pendingTopics: pendentes, todayPlan: missao }));

    expect(projecao.weeks[0].days[0].topics.map((t) => t.planTopicId)).toEqual(
      missao.map((m) => m.planTopicId),
    );
    expect(projecao.weeks[0].days[0].topics.every((t) => t.done)).toBe(true);
  });

  it("sem missão, hoje continua vindo da fila, e nenhum assunto carrega a marca de feito", () => {
    const projecao = projectSchedule(input({ pendingTopics: pendentes }));
    const hoje = projecao.weeks[0].days[0];

    expect(hoje.topics.length).toBeGreaterThan(0);
    expect(hoje.topics.every((t) => t.done === undefined)).toBe(true);
  });
});

