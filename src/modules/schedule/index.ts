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
};

export type WeeklyAvailability = {
  /** 0 = domingo … 6 = sábado. */
  weekday: number;
  minutesAvailable: number;
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
};

/** Um dia dentro da semana, com o que cabe nele. */
export type ScheduleDay = {
  date: CivilDate;
  /** Minutos livres depois de descontar a reserva de revisão. */
  availableMinutes: number;
  topics: Array<{ planTopicId: string; topicName: string; minutes: number }>;
};

export type ScheduleWeek = {
  startDate: CivilDate;
  endDate: CivilDate;
  availableMinutes: number;
  plannedMinutes: number;
  topics: Array<{ planTopicId: string; topicName: string; minutes: number }>;
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
   * O RITMO: que fração do tempo livre de cada dia o estudo novo ocupa.
   *
   * ⚠️ ANTES O PLANO ERA GULOSO, e era esse o defeito. Ele enchia cada dia até
   * o teto, na ordem de prioridade, e parava quando o conteúdo acabava. Com
   * prova em outubro, o aluno via quatro ou cinco assuntos empilhados nos
   * primeiros dias, o plano terminando em meados de setembro e três semanas
   * vazias depois — e adiar a prova não mudava nada, porque a data nunca
   * entrava na conta da distribuição.
   *
   * Agora entra: `necessário ÷ disponível até a prova` espalha o mesmo conteúdo
   * por todo o período. Vinte dias dão carga alta; cem dias dão carga baixa,
   * com o mesmo conteúdo. Foi o pedido da cliente, e é também o que o produto
   * promete — "a projeção do que falta com o tempo que você tem".
   *
   * Preso em 1 quando NÃO CABE: aí a resposta certa é usar cada minuto
   * disponível, e é `topicsAtRisk` que diz o que ficará de fora.
   *
   * A ORDEM DE PRIORIDADE NÃO MUDA. O ritmo altera quanto entra por dia, nunca
   * quem entra primeiro — a fila continua ordenada pelo Motor 1.
   */
  const pace =
    totalAvailable > 0 ? Math.min(1, requiredMinutes / totalAvailable) : 1;

  const weeks = buildWeeks({
    today: input.today,
    horizonEnd,
    daysRemaining,
    minutesByWeekday,
    reviewMinutesPerDay: input.averageReviewMinutesPerDay,
    pendingTopics: input.pendingTopics,
    pace,
    minBlockMinutes: input.scheduleParams.defaultStudyBlockMinutes,
  });

  return {
    horizonStart: input.today,
    horizonEnd,
    hasExamDate: input.examDate !== null,
    weeks,
    feasibility,
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

function buildWeeks(args: {
  today: CivilDate;
  horizonEnd: CivilDate;
  daysRemaining: number;
  minutesByWeekday: Map<number, number>;
  reviewMinutesPerDay: number;
  pendingTopics: PendingTopic[];
  /**
   * Que fração da capacidade diária o estudo novo ocupa, de 0 a 1.
   *
   * É o que faz o plano TERMINAR NA PROVA em vez de terminar cedo. Ver a nota
   * em `projectSchedule`.
   */
  pace: number;
  /** Abaixo disto não é sessão de estudo; o dia vira folga e o tempo acumula. */
  minBlockMinutes: number;
}): ScheduleWeek[] {
  const weeks: ScheduleWeek[] = [];

  // Fila de assuntos por prioridade, com o tempo restante de cada um.
  const queue = [...args.pendingTopics]
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .map((topic) => ({ ...topic, left: Math.max(0, topic.remainingMinutes) }));

  let cursor = 0;
  let queueIndex = 0;

  /**
   * Sobra fracionária do ritmo, carregada de um dia para o outro.
   *
   * Com muito tempo até a prova, `dia × pace` dá poucos minutos — dois, três.
   * Estudar três minutos não é estudar. Em vez de picar o conteúdo assim, o
   * tempo se acumula e o estudo acontece em blocos de verdade, mais espaçados:
   * é o que a cliente pediu com "quanto maior o tempo disponível, menor a
   * quantidade de conteúdos por dia".
   */
  let carry = 0;

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

    /*
     * Distribui DIA A DIA, e não a semana inteira de uma vez.
     *
     * Percorrendo cada dia com o seu próprio orçamento, o mesmo laço produz a
     * lista da semana e a de cada dia — sem uma segunda passada que poderia
     * divergir da primeira e mostrar totais diferentes na mesma tela.
     */
    const days: ScheduleDay[] = [];
    const topics: ScheduleWeek["topics"] = [];
    let budget = availableMinutes;

    for (let i = 0; i < daysInWeek; i++) {
      const date = addDays(startDate, i);
      const dayMinutes = args.minutesByWeekday.get(weekdayOf(date)) ?? 0;
      const dayCapacity = Math.max(0, dayMinutes - args.reviewMinutesPerDay);

      carry += dayCapacity * args.pace;

      /*
        O dia só recebe conteúdo quando o acumulado dá um bloco de verdade —
        ou quando o que falta já cabe no acumulado, que é o fim da fila.
      */
      const restante = queue
        .slice(queueIndex)
        .reduce((soma, topico) => soma + Math.max(0, topico.left), 0);

      /*
        ⚠️ TETO DO DIA — sem ele, espalhar não reduz a carga diária.

        O acumulado cresce nos dias de folga e, ao abrir um dia, despejaria
        tudo de uma vez: com prova em cem dias o aluno recebia os mesmos três
        assuntos num dia só, apenas mais espaçados. Não era o que a cliente
        pediu.

        Com o teto, horizonte longo dá UM bloco por dia de estudo, bem
        distribuído; horizonte curto sobe o teto junto com o ritmo, até o dia
        inteiro quando o conteúdo não cabe.
      */
      const tetoDoDia = Math.max(args.minBlockMinutes, Math.round(dayCapacity * args.pace));

      const abreDia = carry >= args.minBlockMinutes || (restante > 0 && restante <= carry);
      let dayBudget = abreDia
        ? Math.min(Math.floor(carry), dayCapacity, tetoDoDia)
        : 0;
      carry -= dayBudget;

      const dayTopics: ScheduleDay["topics"] = [];

      /*
        ⚠️ NADA DE FATIA CURTA DEMAIS.

        Um bloco de 30 minutos cabe um assunto de 27 e sobram 3 — que viravam
        o começo do assunto seguinte. Três minutos de um tema não ensinam nada
        e ainda fazem o dia parecer ter dois assuntos.

        O que não for usado volta para o acumulado e reaparece no próximo dia
        de estudo, então nenhum minuto se perde.
      */
      const fatiaMinima = Math.ceil(args.minBlockMinutes / 2);

      while (dayBudget >= fatiaMinima && queueIndex < queue.length) {
        const topic = queue[queueIndex];
        if (topic.left <= 0) {
          queueIndex++;
          continue;
        }

        const minutes = Math.min(dayBudget, topic.left);
        dayTopics.push({
          planTopicId: topic.planTopicId,
          topicName: topic.topicName,
          minutes,
        });
        topic.left -= minutes;
        dayBudget -= minutes;
        budget -= minutes;
        if (topic.left <= 0) queueIndex++;
      }

      // Sobra do teto que não virou estudo: volta para o acumulado.
      carry += dayBudget;

      days.push({
        date,
        availableMinutes: dayCapacity,
        topics: dayTopics,
      });

      // O mesmo assunto pode aparecer em dias seguidos; na visão da semana ele
      // é uma linha só, com os minutos somados.
      for (const item of dayTopics) {
        const existente = topics.find((t) => t.planTopicId === item.planTopicId);
        if (existente) existente.minutes += item.minutes;
        else topics.push({ ...item });
      }
    }

    weeks.push({
      startDate,
      endDate,
      availableMinutes,
      plannedMinutes: availableMinutes - budget,
      topics,
      days,
    });

    cursor += daysInWeek;

    // Todo o conteúdo já foi distribuído: as semanas seguintes ficariam vazias
    // e só poluiriam a tela.
    if (queueIndex >= queue.length) break;
  }

  return weeks;
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
