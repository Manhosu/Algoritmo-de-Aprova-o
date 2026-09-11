import { spreadAcrossSubjects } from "@/modules/shared/spread-subjects";

import type { ScheduleParams } from "@/modules/engine-config/schemas";
import { addDays, daysBetween, weekdayOf, type CivilDate } from "@/modules/shared/dates";

/**
 * CRONOGRAMA ADAPTATIVO
 * ============================================================================
 *
 * README 1.8: "visão de tudo que está agendado para o aluno estudar até o dia
 * da prova", "totalmente adaptativo, nunca estático".
 *
 * O PROBLEMA E A SOLUÇÃO EM DUAS CAMADAS
 * ----------------------------------------------------------------------------
 * Materializar dia a dia até uma prova a dez meses geraria centenas de linhas
 * por aluno, obsoletas na primeira semana e reescritas a cada questão
 * respondida. Não fecha.
 *
 *   • JANELA MATERIALIZADA (padrão 14 dias) — o que o aluno vê em detalhe e
 *     pode arrastar. Vira linhas em `schedule_entries`.
 *
 *   • PROJEÇÃO agregada por semana até a prova — o que desenha o longo prazo.
 *     Vira um JSONB em `schedule_snapshots`, não linhas.
 *
 * A PERGUNTA MAIS ÚTIL DA TELA é a viabilidade: o conteúdo que falta cabe na
 * disponibilidade informada até o dia da prova? Quando não cabe, o produto tem
 * que dizer isso — em vez de desenhar um plano bonito e impossível que o aluno
 * só vai descobrir que era mentira na véspera.
 */

export type PendingTopic = {
  planTopicId: string;
  planSubjectId: string;
  subjectName: string;
  topicName: string;
  /** Minutos estimados para cobrir o que falta deste assunto. */
  remainingMinutes: number;
  priorityScore: number;
  /**
   * A percepção do aluno no diagnóstico inicial, e a ORDEM DO CRONOGRAMA.
   *
   * ⚠️ ELA MANDA AQUI, e não o `priorityScore` do Motor 1. Decisão da cliente
   * em 08/09/2026: "o cronograma é formado em primeiro os assuntos de baixo
   * domínio, depois domínio intermediário, depois assuntos com mais afinidade
   * (conforme indicado pelo usuário no diagnóstico inicial)".
   *
   * O raciocínio dela vem junto: "o motor com 5 sinais só gera 1 ou 2 assuntos
   * na missão do dia, não influencia o cronograma inteiro". O Motor 1 reage ao
   * desempenho de hoje, e o cronograma é o mapa dos próximos meses. Deixar o
   * mapa inteiro balançar a cada questão respondida faz o aluno abrir a tela e
   * ver outra coisa toda semana.
   *
   * `null` cai no meio: sem diagnóstico, tratar como baixo domínio jogaria o
   * assunto para a frente da fila sem nada que justifique.
   */
  masteryLevel: "low" | "medium" | "high" | null;
};

/** Baixo domínio primeiro, afinidade por último. Ver a nota em `masteryLevel`. */
const ORDEM_DE_DOMINIO: Record<string, number> = { low: 0, medium: 1, high: 2 };

function rankDeDominio(nivel: PendingTopic["masteryLevel"]): number {
  return ORDEM_DE_DOMINIO[nivel ?? "medium"] ?? 1;
}

export type WeeklyAvailability = {
  /** 0 = domingo … 6 = sábado. */
  weekday: number;
  minutesAvailable: number;
};

/** Um assunto da missão de hoje, como ela está na tela. */
export type TodayPlanTopic = {
  planTopicId: string;
  topicName: string;
  /** O estudo do bloco já foi concluído. */
  done: boolean;
};

export type ProjectScheduleInput = {
  today: CivilDate;
  examDate: CivilDate | null;
  examDateIsEstimated: boolean;
  availability: WeeklyAvailability[];
  pendingTopics: PendingTopic[];
  /** Minutos por dia já comprometidos com revisões, em média. */
  averageReviewMinutesPerDay: number;
  scheduleParams: ScheduleParams;
  /** Horizonte usado quando não há data de prova. */
  fallbackHorizonDays?: number;
  /**
   * A missão de hoje, quando ela já existe.
   *
   * ⚠️ COM ELA, O DIA DE HOJE É A MISSÃO, e não a fila recalculada.
   *
   * Palavras da cliente em 11/09/2026: "as missões do dia não estão casando com
   * as tarefas do cronograma novamente. As 3 tarefas do cronograma não é nenhuma
   * das 6 das Missões do Dia".
   *
   * O cronograma é calculado a cada abertura, e assunto estudado sai da fila.
   * Ela concluiu as seis missões às 13h59 e, na abertura seguinte, o dia de hoje
   * já mostrava os três PRÓXIMOS assuntos. As duas telas contavam a mesma manhã
   * de jeitos diferentes: a missão, o que foi planejado para hoje; o cronograma,
   * o que ainda faltava a partir daquele minuto.
   *
   * Hoje é o dia que já começou: ele fica como foi planejado, com o que foi
   * feito marcado, e a redistribuição vale de amanhã em diante.
   */
  todayPlan?: TodayPlanTopic[];
};

/** Um assunto num dia do cronograma. */
export type ScheduleTopic = {
  planTopicId: string;
  topicName: string;
  minutes: number;
  /** Só nos assuntos da missão de hoje: se o estudo já foi concluído. */
  done?: boolean;
};

/** Um dia dentro da semana, com o que cabe nele. */
export type ScheduleDay = {
  date: CivilDate;
  /** Minutos livres depois de descontar a reserva de revisão. */
  availableMinutes: number;
  topics: ScheduleTopic[];
};

export type ScheduleWeek = {
  startDate: CivilDate;
  endDate: CivilDate;
  availableMinutes: number;
  plannedMinutes: number;
  topics: ScheduleTopic[];
  /**
   * A mesma distribuição, quebrada por dia.
   *
   * ⚠️ RESPEITA A DISPONIBILIDADE DE CADA DIA, e é por isso que a divisão não
   * é o total da semana dividido por sete: quem estuda 30min na terça e 4h no
   * sábado receberia terças impossíveis e sábados ociosos. Dia sem
   * disponibilidade fica na lista com zero minutos, para o aluno ver que é
   * folga e não esquecimento do sistema.
   */
  days: ScheduleDay[];
};

export type Feasibility = {
  /** Minutos necessários para cobrir todo o conteúdo pendente. */
  requiredMinutes: number;
  /** Minutos disponíveis até a prova, já descontadas as revisões. */
  availableMinutes: number;
  /** > 1 significa que não cabe. */
  loadRatio: number;
  fits: boolean;
  /** Quantos minutos por dia a mais seriam necessários. Zero quando cabe. */
  extraMinutesPerDayNeeded: number;
  /**
   * NOMES dos assuntos que não cabem, do menos prioritário para cima.
   *
   * ⚠️ NOME, NÃO ID. Este campo é lido direto na tela, e por um tempo ele
   * carregava `planTopicId`: o aluno via uma lista de UUIDs debaixo de "Não
   * cabem antes da prova". O tipo é `string[]` dos dois jeitos, então nada
   * reclamou — nem o TypeScript, nem os testes.
   */
  topicsAtRisk: string[];
  message: string;
};

export type ScheduleProjection = {
  horizonStart: CivilDate;
  horizonEnd: CivilDate;
  hasExamDate: boolean;
  weeks: ScheduleWeek[];
  feasibility: Feasibility;
  summary: {
    topicsRemaining: number;
    minutesRemaining: number;
    daysRemaining: number;
  };
};

const DEFAULT_FALLBACK_HORIZON_DAYS = 90;

export function projectSchedule(input: ProjectScheduleInput): ScheduleProjection {
  const fallbackDays = input.fallbackHorizonDays ?? DEFAULT_FALLBACK_HORIZON_DAYS;

  const horizonEnd =
    input.examDate !== null && daysBetween(input.today, input.examDate) > 0
      ? input.examDate
      : addDays(input.today, fallbackDays);

  const daysRemaining = Math.max(0, daysBetween(input.today, horizonEnd));

  const minutesByWeekday = new Map(
    input.availability.map((a) => [a.weekday, Math.max(0, a.minutesAvailable)]),
  );

  /* --- capacidade total até a prova ---------------------------------------- */
  let totalAvailable = 0;
  for (let offset = 0; offset < daysRemaining; offset++) {
    const date = addDays(input.today, offset);
    const dayMinutes = minutesByWeekday.get(weekdayOf(date)) ?? 0;
    // As revisões comem uma fatia todo dia, e elas não são negociáveis.
    totalAvailable += Math.max(0, dayMinutes - input.averageReviewMinutesPerDay);
  }

  const requiredMinutes = input.pendingTopics.reduce(
    (sum, topic) => sum + Math.max(0, topic.remainingMinutes),
    0,
  );

  const feasibility = assessFeasibility({
    requiredMinutes,
    availableMinutes: totalAvailable,
    daysRemaining,
    pendingTopics: input.pendingTopics,
    hasExamDate: input.examDate !== null,
    isEstimated: input.examDateIsEstimated,
  });

  /* --- distribuição por semana --------------------------------------------- */

  /**
   * ⚠️ O RITMO VIROU "QUANTOS ASSUNTOS POR DIA", e não mais uma fração de
   * minutos. Ver a nota dentro de `buildWeeks`.
   *
   * A ideia continua a mesma que a cliente pediu em 31/08: vinte dias dão carga
   * alta, cem dias dão carga baixa, com o mesmo conteúdo. O que mudou é a
   * unidade. Fatiar minutos partia assunto ao meio e deixava dias em branco, os
   * dois defeitos que ela reportou em 08/09.
   */
  const { weeks, leftovers } = buildWeeks({
    today: input.today,
    horizonEnd,
    daysRemaining,
    minutesByWeekday,
    reviewMinutesPerDay: input.averageReviewMinutesPerDay,
    pendingTopics: input.pendingTopics,
    minBlockMinutes: input.scheduleParams.defaultStudyBlockMinutes,
    todayPlan: input.todayPlan ?? [],
  });

  /*
    ⚠️ O QUE NÃO COUBE VEM DA DISTRIBUIÇÃO, e não de uma segunda conta.

    `assessFeasibility` compara minutos necessários com minutos disponíveis e
    estima o que ficaria de fora. Agora quem sabe de verdade é a distribuição:
    com o teto de cinco assuntos por dia, o horizonte comporta um número exato
    de assuntos, e o resto da fila é a resposta. Duas contas para a mesma
    pergunta divergiriam, e o aluno leria dois números diferentes na mesma tela.
  */
  const naoCoube = leftovers.map((topic) => topic.topicName);

  return {
    horizonStart: input.today,
    horizonEnd,
    hasExamDate: input.examDate !== null,
    weeks,
    feasibility:
      naoCoube.length > 0
        ? {
            ...feasibility,
            fits: false,
            topicsAtRisk: naoCoube,
            /*
              ⚠️ A MENSAGEM ORIGINAL GANHA quando ela já dizia que não cabe.

              `assessFeasibility` conhece a causa específica: disponibilidade
              zerada, revisões comendo o dia inteiro, conteúdo maior que o
              tempo. A minha só sabe contar assuntos. Sobrescrever trocaria
              "informe sua disponibilidade" por "aumente o tempo disponível" e
              o aluno perderia a instrução que resolveria o caso dele.
            */
            message: feasibility.fits
              ? `${naoCoube.length} ${naoCoube.length === 1 ? "assunto não cabe" : "assuntos não cabem"} ` +
                `até a prova, mesmo com ${MAX_TOPICS_PER_DAY} assuntos por dia. ` +
                "Aumente o tempo disponível, adie a prova ou tire assuntos do edital."
              : feasibility.message,
          }
        : feasibility,
    summary: {
      topicsRemaining: input.pendingTopics.length,
      minutesRemaining: requiredMinutes,
      daysRemaining,
    },
  };
}

/* ========================================================================== *
 * VIABILIDADE
 * ========================================================================== */

function assessFeasibility(args: {
  requiredMinutes: number;
  availableMinutes: number;
  daysRemaining: number;
  pendingTopics: PendingTopic[];
  hasExamDate: boolean;
  isEstimated: boolean;
}): Feasibility {
  const { requiredMinutes, availableMinutes, daysRemaining } = args;

  if (requiredMinutes === 0) {
    return {
      requiredMinutes: 0,
      availableMinutes,
      loadRatio: 0,
      fits: true,
      extraMinutesPerDayNeeded: 0,
      topicsAtRisk: [],
      message: "Todo o conteúdo do edital já foi coberto.",
    };
  }

  if (availableMinutes <= 0) {
    return {
      requiredMinutes,
      availableMinutes: 0,
      loadRatio: Infinity,
      fits: false,
      extraMinutesPerDayNeeded: daysRemaining > 0 ? Math.ceil(requiredMinutes / daysRemaining) : 0,
      topicsAtRisk: args.pendingTopics.map((t) => t.topicName),
      message:
        "Nenhum tempo de estudo informado. Preencha sua disponibilidade para o " +
        "cronograma poder ser montado.",
    };
  }

  const loadRatio = requiredMinutes / availableMinutes;
  const fits = loadRatio <= 1;

  if (fits) {
    return {
      requiredMinutes,
      availableMinutes,
      loadRatio: round(loadRatio),
      fits: true,
      extraMinutesPerDayNeeded: 0,
      topicsAtRisk: [],
      message: args.hasExamDate
        ? "O conteúdo que falta cabe no tempo que você tem até a prova."
        : "O conteúdo que falta cabe no horizonte projetado.",
    };
  }

  /* --- não cabe: quais assuntos ficam de fora ------------------------------ */
  // Corta pelos MENOS prioritários. É a mesma ordem que o Motor 1 usa, então o
  // que sobra de fora é o que ele já deixaria por último de qualquer forma.
  const byPriority = [...args.pendingTopics].sort(
    (a, b) => b.priorityScore - a.priorityScore,
  );

  let budget = availableMinutes;
  const atRisk: string[] = [];
  for (const topic of byPriority) {
    if (budget >= topic.remainingMinutes) budget -= topic.remainingMinutes;
    else atRisk.push(topic.topicName);
  }

  const deficit = requiredMinutes - availableMinutes;
  const extraPerDay = daysRemaining > 0 ? Math.ceil(deficit / daysRemaining) : deficit;

  return {
    requiredMinutes,
    availableMinutes,
    loadRatio: round(loadRatio),
    fits: false,
    extraMinutesPerDayNeeded: extraPerDay,
    topicsAtRisk: atRisk,
    // A mensagem é específica de propósito: "não cabe" sem número não ajuda
    // ninguém a decidir o que fazer.
    message:
      args.hasExamDate && !args.isEstimated
        ? `O conteúdo que falta não cabe até a prova. Seriam necessários cerca de ${extraPerDay} minutos a mais por dia, ou ${atRisk.length} assunto(s) ficariam de fora.`
        : `No ritmo atual, faltariam cerca de ${extraPerDay} minutos por dia para cobrir todo o conteúdo no horizonte projetado.`,
  };
}

/* ========================================================================== *
 * DISTRIBUIÇÃO POR SEMANA
 * ========================================================================== */

/** Teto de assuntos por dia. "Pode ser 5 assuntos no máximo" (cliente, 08/09/2026). */
export const MAX_TOPICS_PER_DAY = 5;

function buildWeeks(args: {
  today: CivilDate;
  horizonEnd: CivilDate;
  daysRemaining: number;
  minutesByWeekday: Map<number, number>;
  reviewMinutesPerDay: number;
  pendingTopics: PendingTopic[];
  /** Tamanho de uma sessão de estudo. Cada assunto do dia vale uma. */
  minBlockMinutes: number;
  /** A missão de hoje. Ver a nota em `ProjectScheduleInput.todayPlan`. */
  todayPlan: TodayPlanTopic[];
}): { weeks: ScheduleWeek[]; leftovers: PendingTopic[] } {
  const weeks: ScheduleWeek[] = [];

  /* Com missão, hoje já está decidido e a fila é só do que vem depois. */
  const hojeAncorado = args.todayPlan.length > 0;
  const idsDeHoje = new Set(args.todayPlan.map((topic) => topic.planTopicId));

  /*
    Fila de assuntos por prioridade.

    ⚠️ E COM A MESMA ALTERNÂNCIA DE DISCIPLINAS DA TAREFA DO DIA.

    Sem ela, as duas telas ordenavam o MESMO conjunto de formas diferentes e a
    cliente via um assunto no cronograma de 02/09 e sete outros nas Missões do
    mesmo dia. Ver a nota em `modules/shared/spread-subjects`.
  */
  const queue = spreadAcrossSubjects(
    args.pendingTopics
      .filter((topic) => !idsDeHoje.has(topic.planTopicId))
      .sort((a, b) => {
        /* Baixo domínio, depois intermediário, depois afinidade. */
        const dominio = rankDeDominio(a.masteryLevel) - rankDeDominio(b.masteryLevel);
        if (dominio !== 0) return dominio;

        /* Dentro da mesma faixa, o Motor 1 desempata. */
        return b.priorityScore - a.priorityScore;
      }),
    (topic) => topic.planSubjectId,
  );

  /*
    ⚠️ O CRONOGRAMA CONTA ASSUNTOS, E NÃO MINUTOS. Reescrito em 08/09/2026.

    A versão anterior distribuía minutos: cada dia recebia uma fatia de tempo
    calculada pelo ritmo, e os assuntos entravam até a fatia acabar. Isso
    produziu os dois defeitos que a cliente relatou na mesma tela: dias em
    branco, porque a fatia do dia às vezes ficava abaixo de um bloco de estudo,
    e "Rotina de Compras" na quarta e de novo na quinta, porque a estimativa do
    assunto era maior que a fatia e ele era partido.

    Contando assuntos, os dois somem por construção. O dia recebe de um a cinco
    assuntos INTEIROS, e o único número que o ritmo decide é quantos.

    Palavras dela: "o cronograma não pode ter dias vazios, e não repetir
    assuntos de um dia para o outro"; "existe uma quantidade limitada de
    assuntos por dia, não podendo ultrapassar o limite (pode ser 5 no máximo)".
  */
  /*
    Com o dia de hoje ancorado na missão, o ritmo é calculado sobre os dias que
    RESTAM: a fila começa amanhã. Contar hoje de novo daria a ele uma parte da
    fila que ele nunca vai receber, e o resto do plano ficaria mais leve do que
    o tempo até a prova pede.
  */
  const diasDeEstudo = contarDiasDeEstudo(
    hojeAncorado
      ? {
          ...args,
          today: addDays(args.today, 1),
          daysRemaining: Math.max(0, args.daysRemaining - 1),
        }
      : args,
  );

  const porDia =
    diasDeEstudo === 0
      ? 0
      : Math.min(
          MAX_TOPICS_PER_DAY,
          Math.max(1, Math.ceil(queue.length / diasDeEstudo)),
        );

  let cursor = 0;
  let queueIndex = 0;

  while (cursor < args.daysRemaining) {
    const startDate = addDays(args.today, cursor);
    const daysInWeek = Math.min(7, args.daysRemaining - cursor);
    const endDate = addDays(startDate, daysInWeek - 1);

    let availableMinutes = 0;
    for (let i = 0; i < daysInWeek; i++) {
      const date = addDays(startDate, i);
      const dayMinutes = args.minutesByWeekday.get(weekdayOf(date)) ?? 0;
      availableMinutes += Math.max(0, dayMinutes - args.reviewMinutesPerDay);
    }

    const days: ScheduleDay[] = [];
    const topics: ScheduleWeek["topics"] = [];
    let plannedMinutes = 0;

    for (let i = 0; i < daysInWeek; i++) {
      const date = addDays(startDate, i);
      const dayMinutes = args.minutesByWeekday.get(weekdayOf(date)) ?? 0;
      const dayCapacity = Math.max(0, dayMinutes - args.reviewMinutesPerDay);

      const ancorado = hojeAncorado && date === args.today;

      const doDia: Array<{ planTopicId: string; topicName: string; done?: boolean }> = ancorado
        ? args.todayPlan
        : queue.slice(queueIndex, queueIndex + (dayCapacity > 0 ? porDia : 0));

      if (!ancorado) queueIndex += doDia.length;

      /*
        ⚠️ O TEMPO DO DIA É REPARTIDO IGUALMENTE (pedido dela em 08/09/2026).

        Cada assunto vale uma sessão, e a sessão encolhe quando o dia não
        comporta uma inteira para cada um. A divisão sai igual por construção:
        não há mais um "45 e 15" para explicar.
      */
      const porAssunto =
        doDia.length === 0
          ? 0
          : Math.max(1, Math.min(args.minBlockMinutes, Math.floor(dayCapacity / doDia.length)));

      const dayTopics: ScheduleTopic[] = doDia.map((topic) => ({
        planTopicId: topic.planTopicId,
        topicName: topic.topicName,
        minutes: porAssunto,
        ...(ancorado ? { done: topic.done === true } : {}),
      }));

      plannedMinutes += porAssunto * dayTopics.length;

      days.push({
        date,
        availableMinutes: dayCapacity,
        topics: dayTopics,
      });

      topics.push(...dayTopics);
    }

    weeks.push({
      startDate,
      endDate,
      availableMinutes,
      plannedMinutes,
      topics,
      days,
    });

    cursor += daysInWeek;

    // Todo o conteúdo já foi distribuído: as semanas seguintes ficariam vazias
    // e só poluiriam a tela.
    if (queueIndex >= queue.length) break;
  }

  /*
    ⚠️ O QUE SOBROU É O QUE NÃO CABE, e a cliente pediu para ver isso.

    Palavras dela: "se for necessário ultrapassar, informar assuntos que não
    cabem no cronograma". Com o teto de cinco por dia, o número de assuntos que
    o horizonte comporta é finito, e o resto da fila é a resposta exata.
  */
  return { weeks, leftovers: queue.slice(queueIndex) };
}

/** Quantos dias do horizonte têm tempo livre depois da reserva de revisão. */
function contarDiasDeEstudo(args: {
  today: CivilDate;
  daysRemaining: number;
  minutesByWeekday: Map<number, number>;
  reviewMinutesPerDay: number;
}): number {
  let total = 0;

  for (let i = 0; i < args.daysRemaining; i++) {
    const date = addDays(args.today, i);
    const dayMinutes = args.minutesByWeekday.get(weekdayOf(date)) ?? 0;
    if (dayMinutes - args.reviewMinutesPerDay > 0) total += 1;
  }

  return total;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}


/* ========================================================================== *
 * MOVIMENTAÇÃO PELO ALUNO
 * ========================================================================== */

export type ScheduleEntry = {
  entryId: string;
  planTopicId: string;
  scheduledDate: CivilDate;
  plannedMinutes: number;
  source: "engine" | "student_moved";
  isPinned: boolean;
  status: "planned" | "completed" | "missed" | "moved";
};

export type MoveResult = {
  entry: ScheduleEntry;
  /** Quando o dia de destino estoura a disponibilidade, avisa em vez de barrar. */
  warning: string | null;
};

/**
 * Move um item do cronograma para outro dia (README 1.8: "adianta conteúdo do
 * próximo dia", "atrasa algum dia").
 *
 * O ITEM MOVIDO PASSA A MANDAR MAIS QUE O MOTOR
 * ----------------------------------------------------------------------------
 * `source` vira `student_moved` e `isPinned` vira verdadeiro. O recálculo
 * seguinte respeita a escolha em vez de desfazê-la — caso contrário, arrastar
 * um item pareceria não funcionar: ele voltaria sozinho para o lugar assim que
 * o aluno respondesse a próxima questão.
 *
 * Estourar a disponibilidade do dia de destino AVISA mas não impede. É o dia do
 * aluno; ele pode decidir virar a noite antes da prova. O produto informa e
 * obedece.
 */
export function moveScheduleEntry(
  entry: ScheduleEntry,
  targetDate: CivilDate,
  dayLoad: { alreadyPlannedMinutes: number; availableMinutes: number },
): MoveResult {
  const moved: ScheduleEntry = {
    ...entry,
    scheduledDate: targetDate,
    source: "student_moved",
    isPinned: true,
  };

  const projected = dayLoad.alreadyPlannedMinutes + entry.plannedMinutes;
  const warning =
    projected > dayLoad.availableMinutes
      ? `Esse dia ficaria com ${projected} minutos de estudo, acima dos ${dayLoad.availableMinutes} que você informou.`
      : null;

  return { entry: moved, warning };
}

/**
 * Decide se o recálculo pode reposicionar um item.
 *
 * O motor tem liberdade sobre o que ele mesmo colocou, e nenhuma sobre o que o
 * aluno moveu ou já concluiu. Sem esta regra, o cronograma adaptativo passaria
 * por cima das decisões do aluno todo dia.
 */
export function canEngineReschedule(entry: ScheduleEntry): boolean {
  if (entry.isPinned) return false;
  if (entry.source === "student_moved") return false;
  if (entry.status === "completed") return false;
  return true;
}

/* ========================================================================== *
 * GATILHOS DE RECÁLCULO
 * ========================================================================== */

export type RecalcReason =
  | "initial"
  | "question_answered"
  | "study_completed"
  | "review_completed"
  | "student_moved_item"
  | "content_changed"
  | "availability_changed"
  | "exam_date_changed"
  | "engine_config_changed"
  | "daily_rollover";

/**
 * Se este gatilho exige refazer a projeção inteira ou só a janela materializada.
 *
 * Recalcular a projeção até a prova a cada questão respondida seria caro e
 * inútil: uma resposta muda a prioridade de amanhã, não a carga de novembro.
 * Os gatilhos estruturais — conteúdo, disponibilidade, data da prova,
 * configuração — são os que realmente mudam o horizonte.
 */
export function requiresFullProjection(reason: RecalcReason): boolean {
  return (
    reason === "initial" ||
    reason === "content_changed" ||
    reason === "availability_changed" ||
    reason === "exam_date_changed" ||
    reason === "engine_config_changed"
  );
}

export type ScheduleChange = {
  reason: RecalcReason;
  /** Frase curta para explicar ao aluno o que mudou e por quê. */
  explanation: string;
};

/**
 * Explica ao aluno por que o cronograma mudou.
 *
 * Um cronograma que muda sem explicação é indistinguível de um cronograma
 * quebrado — e é assim que o aluno para de confiar no sistema que deveria
 * pensar por ele.
 */
export function explainRecalculation(reason: RecalcReason): ScheduleChange {
  const explanations: Record<RecalcReason, string> = {
    initial: "Seu cronograma foi montado a partir do seu edital e do seu diagnóstico.",
    question_answered: "Ajustamos as prioridades com base nas suas últimas respostas.",
    study_completed: "Você concluiu um estudo, então o que vem depois foi reorganizado.",
    review_completed: "Sua revisão entrou na conta e o ritmo foi reajustado.",
    student_moved_item: "Você moveu um item e o restante foi reacomodado em volta dele.",
    content_changed: "Seu edital mudou, então o cronograma foi refeito.",
    availability_changed: "Você alterou seu tempo de estudo e o cronograma foi redistribuído.",
    exam_date_changed: "A data da prova mudou e o cronograma foi recalculado.",
    engine_config_changed: "Atualizamos o algoritmo e seu cronograma foi recalculado.",
    daily_rollover: "Começou um novo dia e sua tarefa foi gerada.",
  };

  return { reason, explanation: explanations[reason] };
}
