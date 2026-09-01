import "server-only";

import { and, desc, eq } from "drizzle-orm";

import type { SignalName } from "@/modules/daily-task/signals";
import type { CivilDate } from "@/modules/shared/dates";
import type { DailyTaskWeights } from "@/modules/engine-config/schemas";
import { db } from "@/server/db";
import {
  dailyTaskItems,
  dailyTasks,
  engineConfigs,
  studyPlanSubjects,
  studyPlanTopics,
} from "@/server/db/schema";

/**
 * "ENTENDA O ALGORITMO" (README 2.5).
 * ============================================================================
 *
 * A promessa do produto é que a priorização é explicável. Esta leitura é a
 * cobrança dessa promessa: mostra, para a tarefa de hoje, por que CADA assunto
 * entrou e nessa ordem.
 *
 * ⚠️ NADA É RECALCULADO AQUI, e essa é a decisão central.
 *
 * A tentação é recomputar os sinais na hora de exibir — o código do motor está
 * logo ali. Seria errado de um jeito difícil de perceber: os sinais mudam ao
 * longo do dia (o aluno responde questões, a recência anda, a prova fica um dia
 * mais perto), então a explicação recalculada às 22h não descreveria a decisão
 * tomada às 6h. A tela mostraria números plausíveis para uma escolha que não foi
 * feita com eles.
 *
 * `priority_breakdown` foi gravado no instante da decisão, junto com o
 * `engine_config_id` dos pesos vigentes. Esta função lê os dois e não faz conta
 * nenhuma além de ordenar.
 */

export type ExplainedTopic = {
  planTopicId: string;
  topicName: string;
  subjectName: string;
  /** Soma das contribuições. É a nota que definiu a ordem. */
  score: number;
  /** Posição na fila do dia, começando em 1. */
  rank: number;
  /** Frase pronta gravada pelo motor: "você errou 60% aqui na última semana". */
  reason: string | null;
  /** Sinal cru, de 0 a 1, antes do peso. */
  signals: Record<SignalName, number>;
  /** Sinal já multiplicado pelo peso. A soma é o `score`. */
  contributions: Record<SignalName, number>;
};

export type Explanation = {
  taskDate: CivilDate;
  /** Os pesos que produziram ESTA tarefa, não os que estão no ar agora. */
  weights: DailyTaskWeights;
  weightsVersion: number;
  /** Os pesos mudaram depois que a tarefa foi montada? */
  weightsAreCurrent: boolean;
  topics: ExplainedTopic[];
};

export async function explainDailyTask(input: {
  preparationId: string;
  taskDate: CivilDate;
}): Promise<Explanation | null> {
  const task = await db.query.dailyTasks.findFirst({
    where: (t, { and: a, eq: e }) =>
      a(e(t.preparationId, input.preparationId), e(t.taskDate, input.taskDate)),
    columns: { id: true, taskDate: true, engineConfigId: true },
  });

  if (!task) return null;

  const [config, versaoNoAr, linhas] = await Promise.all([
    db.query.engineConfigs.findFirst({
      where: (c, { eq: e }) => e(c.id, task.engineConfigId),
      columns: { version: true, payload: true },
    }),

    db.query.engineConfigs.findFirst({
      where: (c, { and: a, eq: e }) =>
        a(e(c.kind, "daily_task_weights"), e(c.isActive, true)),
      columns: { version: true },
    }),

    /*
      Um item por assunto, não um por linha da tarefa.

      A tarefa tem dois itens por bloco (estude + pratique) e os dois carregam o
      MESMO `priority_breakdown`, porque a decisão foi sobre o assunto. Listar os
      dois mostraria cada assunto duas vezes com números idênticos, o que parece
      erro de tela. `distinct on` deixa um por assunto.
    */
    db
      .selectDistinctOn([dailyTaskItems.planTopicId], {
        planTopicId: dailyTaskItems.planTopicId,
        score: dailyTaskItems.priorityScore,
        breakdown: dailyTaskItems.priorityBreakdown,
        reason: dailyTaskItems.reasonLabel,
        topicName: studyPlanTopics.displayName,
        subjectName: studyPlanSubjects.displayName,
      })
      .from(dailyTaskItems)
      .innerJoin(studyPlanTopics, eq(dailyTaskItems.planTopicId, studyPlanTopics.id))
      .innerJoin(
        studyPlanSubjects,
        eq(studyPlanTopics.planSubjectId, studyPlanSubjects.id),
      )
      .where(eq(dailyTaskItems.dailyTaskId, task.id))
      .orderBy(dailyTaskItems.planTopicId, desc(dailyTaskItems.priorityScore)),
  ]);

  if (!config) return null;

  const weights = config.payload as DailyTaskWeights;

  const topics = linhas
    .map((linha) => ({
      planTopicId: linha.planTopicId,
      topicName: linha.topicName,
      subjectName: linha.subjectName,
      score: linha.score,
      rank: 0,
      reason: linha.reason,
      signals: linha.breakdown.signals,
      contributions: linha.breakdown.contributions,
    }))
    .sort((a, b) => b.score - a.score)
    .map((topico, indice) => ({ ...topico, rank: indice + 1 }));

  return {
    taskDate: task.taskDate as CivilDate,
    weights,
    weightsVersion: config.version,
    weightsAreCurrent: versaoNoAr?.version === config.version,
    topics,
  };
}

/**
 * As últimas tarefas com data, para o seletor de dia.
 *
 * A explicação de ontem continua válida — foi gravada junto com a decisão — e é
 * ela que responde "por que ontem caiu Crase e hoje não?".
 */
export async function recentTaskDates(
  preparationId: string,
  limit = 14,
): Promise<CivilDate[]> {
  const linhas = await db
    .select({ taskDate: dailyTasks.taskDate })
    .from(dailyTasks)
    .where(eq(dailyTasks.preparationId, preparationId))
    .orderBy(desc(dailyTasks.taskDate))
    .limit(limit);

  return linhas.map((l) => l.taskDate as CivilDate);
}

/* ========================================================================== *
 * HISTÓRICO DE CONFIGURAÇÃO
 * ========================================================================== */

/** Quando os pesos mudaram — a tela avisa que tarefas antigas usaram outros. */
export async function weightsChangedAt(): Promise<Date | null> {
  const [linha] = await db
    .select({ activatedAt: engineConfigs.activatedAt })
    .from(engineConfigs)
    .where(
      and(eq(engineConfigs.kind, "daily_task_weights"), eq(engineConfigs.isActive, true)),
    )
    .limit(1);

  return linha?.activatedAt ?? null;
}
