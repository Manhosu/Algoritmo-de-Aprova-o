import "server-only";

import { and, count, eq, isNull, ne, sql } from "drizzle-orm";

import { APP_TIMEZONE } from "@/config/app";
import { toCivilDate } from "@/modules/shared/dates";
import { db } from "@/server/db";
import {
  analyticsEvents,
  editalExtractions,
  preparations,
  userFunnelProgress,
} from "@/server/db/schema";

/**
 * Criação e gestão de preparações.
 *
 * É aqui que mora o gate de plano: "mais de uma preparação só no Premium"
 * (decisão fechada). A restrição é de PLANO, não estrutural — a relação
 * usuário↔preparação sempre foi 1:N, e o upgrade não exige nenhuma mudança de
 * dado.
 */

export type CreatePreparationInput = {
  userId: string;
  targetPosition: string;
  institution?: string | null;
  examBoardId?: string | null;
  /** Nome digitado quando a banca não está na lista. Só com `examBoardId` nulo. */
  examBoardOther?: string | null;
  examDate?: string | null;
  examDateIsEstimated?: boolean;
};

export type CreatePreparationResult =
  | { ok: true; preparationId: string }
  | { ok: false; reason: "plan_limit"; limit: number; current: number };

export async function createPreparation(
  input: CreatePreparationInput,
): Promise<CreatePreparationResult> {
  const gate = await checkPreparationLimit(input.userId);
  if (!gate.allowed) {
    return { ok: false, reason: "plan_limit", limit: gate.limit!, current: gate.current };
  }

  const now = new Date();

  const preparationId = await db.transaction(async (tx) => {
    // Só uma preparação é "a atual". O índice parcial no banco garante isso;
    // aqui a gente desmarca antes para não colidir com ele.
    await tx
      .update(preparations)
      .set({ isCurrent: false })
      .where(and(eq(preparations.userId, input.userId), eq(preparations.isCurrent, true)));

    const [row] = await tx
      .insert(preparations)
      .values({
        userId: input.userId,
        targetPosition: input.targetPosition.trim(),
        title: input.targetPosition.trim().slice(0, 160),
        institution: input.institution?.trim() || null,
        examBoardId: input.examBoardId || null,
        examBoardOther: input.examBoardId ? null : input.examBoardOther?.trim() || null,
        examDate: input.examDate || null,
        examDateIsEstimated: input.examDateIsEstimated ?? false,
        status: "draft",
        isCurrent: true,
      })
      .returning({ id: preparations.id });

    return row.id;
  });

  // Degrau do funil. Gravado agora e não por job: dado de funil não coletado
  // no momento não é recuperável depois.
  await markFunnelStage(input.userId, "preparation_created", now);
  await recordEvent(input.userId, "preparation_created", { preparationId });

  return { ok: true, preparationId };
}

/* ========================================================================== *
 * GATE DE PLANO
 * ========================================================================== */

export type PreparationLimit = {
  allowed: boolean;
  /** `null` = ilimitado (Premium). */
  limit: number | null;
  current: number;
  planCode: string;
};

/**
 * Teto do plano Free, usado quando o aluno não tem assinatura ativa nenhuma.
 *
 * É o padrão CONSERVADOR: quem não tem linha de assinatura não deve receber
 * acesso ilimitado por omissão.
 */
const FREE_MAX_PREPARATIONS = 1;

/**
 * Quantas preparações ativas o plano do aluno permite.
 *
 * `NULL` em `max_active_preparations` significa ILIMITADO — nunca 0 nem um
 * número mágico grande. Free e Intermediário permitem 1; Premium, ilimitado.
 *
 * Preparação ARQUIVADA não conta: encerrar uma preparação precisa liberar
 * espaço para a seguinte, senão o aluno do Free ficaria preso ao primeiro
 * edital para sempre.
 */
export async function checkPreparationLimit(userId: string): Promise<PreparationLimit> {
  const subscription = await db.query.subscriptions.findFirst({
    where: (t, { and: a, eq: e }) => a(e(t.userId, userId), e(t.status, "active")),
    columns: { planId: true },
    with: {
      plan: {
        columns: { code: true },
        with: { limits: { columns: { maxActivePreparations: true } } },
      },
    },
  });

  /**
   * ⚠️ `NULL` NA COLUNA SIGNIFICA ILIMITADO — não "ausente".
   *
   * `subscription?.plan?.limits?.maxActivePreparations ?? 1` parece certo e está
   * errado: `??` não distingue "não existe linha de limites" de "a coluna é
   * NULL de propósito". No Premium, `max_active_preparations` é NULL justamente
   * para dizer "sem teto" — e o `?? 1` transformava isso em UMA preparação.
   *
   * Encontrado em 24/08/2026 na tela de gestão: um aluno Premium via
   * "seu plano permite 1 preparação ativa". O mesmo erro estava em
   * `getDailyLimit`, onde limitava o Premium a 10 questões por dia.
   *
   * A distinção agora é explícita: sem linha de limites, cai nos valores do
   * Free; com a linha e a coluna nula, é ilimitado.
   */
  const limits = subscription?.plan?.limits;
  const limit = limits ? limits.maxActivePreparations : FREE_MAX_PREPARATIONS;
  const planCode = subscription?.plan?.code ?? "free";

  const [row] = await db
    .select({ total: count() })
    .from(preparations)
    .where(
      and(
        eq(preparations.userId, userId),
        ne(preparations.status, "archived"),
        isNull(preparations.deletedAt),
      ),
    );

  const current = row?.total ?? 0;

  return {
    allowed: limit === null || current < limit,
    limit,
    current,
    planCode,
  };
}

/* ========================================================================== *
 * LEITURAS DE EDITAL NO MÊS
 * ========================================================================== */

export type EditalUploadLimit = {
  allowed: boolean;
  /** `null` = ilimitado (Premium). */
  limit: number | null;
  current: number;
  planCode: string;
};

/** Teto do Free, para quem não tem assinatura ativa. Mesmo espírito do acima. */
const FREE_MONTHLY_EDITAL_UPLOADS = 2;

/**
 * Quantas leituras de edital o aluno já gastou neste mês.
 *
 * POR QUE ESTE GATE EXISTE
 * ----------------------------------------------------------------------------
 * A página de planos anunciava "2 leituras de edital por mês" no Free e "5" no
 * Intermediário desde sempre — mas NENHUM código aplicava o limite. Qualquer
 * aluno podia reprocessar edital à vontade.
 *
 * Não era só informação errada na página: cada leitura é uma chamada paga à
 * API da Anthropic, com custo por documento. Um limite anunciado e não aplicado
 * é um buraco de custo que aparece na fatura antes de aparecer em qualquer
 * relatório.
 *
 * ⚠️ CONTA SUCESSOS, NÃO TENTATIVAS.
 *
 * A primeira versão contava tentativas, com o argumento de que uma extração
 * falha já queimou os tokens do documento. Correto do ponto de vista do custo,
 * e errado do ponto de vista de quem usa: a cliente subiu dois editais que o
 * sistema NÃO conseguiu ler e perdeu as duas leituras do mês por uma falha
 * nossa. Ela não recebeu nada em troca.
 *
 * O custo de uma leitura falha fica com a operação, que é quem pode melhorá-la.
 * Cobrar do aluno pelo nosso defeito é a troca errada — ele desiste antes de
 * descobrir se o produto funciona.
 */
export async function checkEditalUploadLimit(userId: string): Promise<EditalUploadLimit> {
  const subscription = await db.query.subscriptions.findFirst({
    where: (t, { and: a, eq: e }) => a(e(t.userId, userId), e(t.status, "active")),
    columns: { planId: true },
    with: {
      plan: {
        columns: { code: true },
        with: { limits: { columns: { monthlyEditalUploadLimit: true } } },
      },
    },
  });

  // ⚠️ NULL na coluna é ILIMITADO, não "ausente" — ver a nota longa em
  // `checkPreparationLimit`, onde esse mesmo `??` já causou um bug.
  const limits = subscription?.plan?.limits;
  const limit = limits ? limits.monthlyEditalUploadLimit : FREE_MONTHLY_EDITAL_UPLOADS;
  const planCode = subscription?.plan?.code ?? "free";

  const [row] = await db
    .select({ total: count() })
    .from(editalExtractions)
    .innerJoin(preparations, eq(preparations.id, editalExtractions.preparationId))
    .where(
      and(
        eq(preparations.userId, userId),
        // Só leitura que entregou conteúdo consome a cota.
        eq(editalExtractions.status, "succeeded"),
        // Mês corrente no fuso do produto, não nos 30 dias corridos: "por mês"
        // é o que o aluno lê na página de planos, e ele conta o mês do calendário.
        sql`${editalExtractions.createdAt} >= date_trunc('month', now() at time zone ${APP_TIMEZONE})`,
      ),
    );

  const current = row?.total ?? 0;

  return {
    allowed: limit === null || current < limit,
    limit,
    current,
    planCode,
  };
}

/* ========================================================================== *
 * FUNIL E EVENTOS
 * ========================================================================== */

type FunnelStage =
  | "preparation_created"
  | "edital_uploaded"
  | "extraction_succeeded"
  | "content_confirmed"
  | "diagnosis_completed"
  | "first_task_generated"
  | "first_question_answered"
  | "first_review_completed";

/**
 * Cada degrau aponta para a SUA coluna, explicitamente.
 *
 * Índice dinâmico (`tabela[nome]`) compilaria, mas um erro de digitação viraria
 * `undefined` em runtime e o degrau simplesmente não seria gravado — sem erro,
 * sem log, e a descoberta só viria meses depois, com o funil já furado.
 */
const STAGE_COLUMNS = {
  preparation_created: userFunnelProgress.preparationCreatedAt,
  edital_uploaded: userFunnelProgress.editalUploadedAt,
  extraction_succeeded: userFunnelProgress.extractionSucceededAt,
  content_confirmed: userFunnelProgress.contentConfirmedAt,
  diagnosis_completed: userFunnelProgress.diagnosisCompletedAt,
  first_task_generated: userFunnelProgress.firstTaskGeneratedAt,
  first_question_answered: userFunnelProgress.firstQuestionAnsweredAt,
  first_review_completed: userFunnelProgress.firstReviewCompletedAt,
} as const satisfies Record<FunnelStage, unknown>;

const STAGE_FIELDS = {
  preparation_created: "preparationCreatedAt",
  edital_uploaded: "editalUploadedAt",
  extraction_succeeded: "extractionSucceededAt",
  content_confirmed: "contentConfirmedAt",
  diagnosis_completed: "diagnosisCompletedAt",
  first_task_generated: "firstTaskGeneratedAt",
  first_question_answered: "firstQuestionAnsweredAt",
  first_review_completed: "firstReviewCompletedAt",
} as const satisfies Record<FunnelStage, string>;

/**
 * Carimba um degrau do funil, uma única vez.
 *
 * São MARCOS, não contadores: "quando este aluno respondeu a primeira questão"
 * tem uma resposta só. O `isNull` na cláusula garante isso — regravar mudaria a
 * resposta e estragaria a coorte histórica.
 */
export async function markFunnelStage(
  userId: string,
  stage: FunnelStage,
  at: Date,
): Promise<void> {
  await db
    .update(userFunnelProgress)
    .set({
      [STAGE_FIELDS[stage]]: at,
      lastStageReached: stage,
      lastStageReachedAt: at,
      lastActiveDate: toCivilDate(at, APP_TIMEZONE),
    })
    .where(
      and(
        eq(userFunnelProgress.userId, userId),
        // Só avança; nunca regride nem regrava um marco já batido.
        isNull(STAGE_COLUMNS[stage]),
      ),
    );
}

/** Evento bruto de produto. É a fonte da verdade do funil. */
export async function recordEvent(
  userId: string | null,
  name: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  const now = new Date();

  let pseudonym: string | null = null;
  if (userId) {
    const user = await db.query.users.findFirst({
      where: (t, { eq: e }) => e(t.id, userId),
      columns: { pseudonymKey: true },
    });
    pseudonym = user?.pseudonymKey ?? null;
  }

  await db.insert(analyticsEvents).values({
    userId,
    pseudonymKey: pseudonym,
    name,
    properties: properties ?? null,
    occurredAt: now,
    occurredDate: toCivilDate(now, APP_TIMEZONE),
    occurredHour: Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: APP_TIMEZONE,
        hour: "2-digit",
        hour12: false,
      }).format(now),
    ) % 24,
  });
}
