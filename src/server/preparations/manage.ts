import "server-only";

import { and, count, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { APP_TIMEZONE } from "@/config/app";
import { toCivilDate } from "@/modules/shared/dates";
import { db } from "@/server/db";
import {
  preparations,
  reviewOccurrences,
  studyPlanTopics,
  topicStates,
} from "@/server/db/schema";

import { checkPreparationLimit, recordEvent } from "./service";

/**
 * GESTÃO DA PREPARAÇÃO (README 1.10).
 * ============================================================================
 *
 * Trocar, renomear e encerrar. As três operações que dão ao aluno controle
 * sobre o próprio plano.
 *
 * ENCERRAR NÃO É APAGAR
 * ----------------------------------------------------------------------------
 * `archived` mantém o conteúdo, o histórico e as métricas visíveis, e libera
 * uma vaga no limite do plano. Uma preparação encerrada não gera Tarefa do Dia
 * e não agenda revisão — mas o aluno que passou seis meses estudando para um
 * concurso não perde esse registro por ter mudado de alvo.
 */

export type PreparationSummary = {
  id: string;
  title: string;
  targetPosition: string;
  institution: string | null;
  status: (typeof preparations.$inferSelect)["status"];
  isCurrent: boolean;
  examDate: string | null;
  examDateIsEstimated: boolean;
  topicCount: number;
  studiedCount: number;
  pendingReviews: number;
  createdAt: Date;
  archivedAt: Date | null;
};

export async function listPreparations(userId: string): Promise<PreparationSummary[]> {
  const rows = await db
    .select({
      id: preparations.id,
      title: preparations.title,
      targetPosition: preparations.targetPosition,
      institution: preparations.institution,
      status: preparations.status,
      isCurrent: preparations.isCurrent,
      examDate: preparations.examDate,
      examDateIsEstimated: preparations.examDateIsEstimated,
      createdAt: preparations.createdAt,
      archivedAt: preparations.archivedAt,
    })
    .from(preparations)
    .where(and(eq(preparations.userId, userId), isNull(preparations.deletedAt)))
    // A atual primeiro; depois as ativas; as encerradas por último.
    .orderBy(desc(preparations.isCurrent), desc(preparations.createdAt));

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);

  const [topics, reviews] = await Promise.all([
    db
      .select({
        preparationId: studyPlanTopics.preparationId,
        total: count(),
        studied: sql<number>`count(*) filter (
          where ${topicStates.coverageStatus} in ('studied', 'mastered')
        )::int`,
      })
      .from(studyPlanTopics)
      .leftJoin(topicStates, eq(topicStates.planTopicId, studyPlanTopics.id))
      .where(
        and(
          inArray(studyPlanTopics.preparationId, ids),
          eq(studyPlanTopics.isActive, true),
          isNull(studyPlanTopics.deletedAt),
        ),
      )
      .groupBy(studyPlanTopics.preparationId),

    db
      .select({ preparationId: reviewOccurrences.preparationId, total: count() })
      .from(reviewOccurrences)
      .where(
        and(
          inArray(reviewOccurrences.preparationId, ids),
          eq(reviewOccurrences.status, "scheduled"),
        ),
      )
      .groupBy(reviewOccurrences.preparationId),
  ]);

  const topicsBy = new Map(topics.map((t) => [t.preparationId, t]));
  const reviewsBy = new Map(reviews.map((r) => [r.preparationId, r.total]));

  return rows.map((row) => ({
    ...row,
    title: row.title ?? row.targetPosition,
    topicCount: topicsBy.get(row.id)?.total ?? 0,
    studiedCount: topicsBy.get(row.id)?.studied ?? 0,
    pendingReviews: reviewsBy.get(row.id) ?? 0,
  }));
}

/* ========================================================================== *
 * TROCAR A ATUAL
 * ========================================================================== */

export type SwitchResult = { ok: true } | { ok: false; reason: "not_found" | "archived" };

/**
 * Troca a preparação que o aluno está vendo.
 *
 * O índice parcial `preparations_one_current_per_user` garante que só exista
 * uma "atual" — por isso a troca desmarca antes de marcar, na mesma transação.
 * Sem isso, uma corrida entre duas abas violaria a constraint e o aluno veria
 * um erro de banco numa ação trivial.
 */
export async function switchPreparation(input: {
  userId: string;
  preparationId: string;
}): Promise<SwitchResult> {
  const target = await db.query.preparations.findFirst({
    where: (t, { and: a, eq: e, isNull: n }) =>
      a(e(t.id, input.preparationId), e(t.userId, input.userId), n(t.deletedAt)),
    columns: { id: true, status: true, lockedByPlanAt: true },
  });

  if (!target) return { ok: false, reason: "not_found" };
  if (target.status === "archived") return { ok: false, reason: "archived" };

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(preparations)
      .set({ isCurrent: false, updatedAt: now })
      .where(
        and(
          eq(preparations.userId, input.userId),
          eq(preparations.isCurrent, true),
          ne(preparations.id, input.preparationId),
        ),
      );

    await tx
      .update(preparations)
      .set({
        isCurrent: true,
        // Voltar a usar uma preparação bloqueada por queda de plano só é
        // possível dentro do limite; quem chamou já passou pelo gate.
        lockedByPlanAt: null,
        updatedAt: now,
      })
      .where(eq(preparations.id, input.preparationId));
  });

  await recordEvent(input.userId, "preparation_switched", {
    preparationId: input.preparationId,
  });

  return { ok: true };
}

/* ========================================================================== *
 * RENOMEAR
 * ========================================================================== */

export async function renamePreparation(input: {
  userId: string;
  preparationId: string;
  title: string;
}): Promise<{ ok: boolean; message?: string }> {
  const title = input.title.trim().slice(0, 160);
  if (title.length < 2) return { ok: false, message: "Dê um nome à sua preparação." };

  const result = await db
    .update(preparations)
    .set({ title, updatedAt: new Date() })
    .where(
      and(
        eq(preparations.id, input.preparationId),
        eq(preparations.userId, input.userId),
        isNull(preparations.deletedAt),
      ),
    );

  return result.count > 0 ? { ok: true } : { ok: false, message: "Preparação não encontrada." };
}

/**
 * Atualiza os dados da prova: cargo, órgão, banca e data.
 *
 * POR QUE ISSO PRECISOU EXISTIR
 * ----------------------------------------------------------------------------
 * O aluno informa cargo, banca e data no passo 1 e nunca mais podia mexer. A
 * cliente marcou "ainda não sei a data", o sistema projetou o cronograma para
 * 30/09 e ela ficou presa a essa data — sem forma de corrigir depois de
 * descobrir a data real.
 *
 * A data da prova é o sinal de URGÊNCIA do Motor 1. Uma data errada distorce a
 * priorização de todos os dias seguintes, e era justamente o campo que o aluno
 * mais tende a preencher errado no começo, quando ainda não saiu o edital.
 *
 * ⚠️ NÃO MEXE NO CONTEÚDO PROGRAMÁTICO. Trocar o cargo aqui muda o rótulo e a
 * urgência; o conteúdo já extraído continua o mesmo, porque reprocessar o
 * edital é decisão do aluno e custa uma leitura do plano dele.
 */
export async function updateExamDetails(input: {
  userId: string;
  preparationId: string;
  targetPosition: string;
  institution: string | null;
  examBoardId: string | null;
  examBoardOther: string | null;
  examDate: string | null;
  examDateIsEstimated: boolean;
}): Promise<{ ok: boolean; message?: string }> {
  const targetPosition = input.targetPosition.trim().slice(0, 200);
  if (targetPosition.length < 2) {
    return { ok: false, message: "Informe o cargo que você vai prestar." };
  }

  /*
   * Data no passado é recusada aqui, e não só no formulário: com ela, a
   * urgência do Motor 1 satura e o cronograma tenta espremer o edital inteiro
   * em zero dia. A tela é sugestão; o servidor é a garantia.
   */
  if (input.examDate) {
    const hoje = toCivilDate(new Date(), APP_TIMEZONE);
    if (input.examDate < hoje) {
      return { ok: false, message: "A data da prova não pode estar no passado." };
    }
  }

  const result = await db
    .update(preparations)
    .set({
      targetPosition,
      title: targetPosition.slice(0, 160),
      institution: input.institution?.trim() || null,
      examBoardId: input.examBoardId || null,
      // Os dois juntos seriam contraditórios: ou a banca está na lista, ou
      // o aluno digitou o nome dela.
      examBoardOther: input.examBoardId ? null : input.examBoardOther?.trim() || null,
      examDate: input.examDate,
      examDateIsEstimated: input.examDateIsEstimated,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(preparations.id, input.preparationId),
        eq(preparations.userId, input.userId),
        isNull(preparations.deletedAt),
      ),
    );

  return result.count > 0 ? { ok: true } : { ok: false, message: "Preparação não encontrada." };
}

/* ========================================================================== *
 * ENCERRAR E REABRIR
 * ========================================================================== */

export type ArchiveResult =
  | { ok: true; freedSlot: boolean }
  | { ok: false; reason: "not_found" | "last_active" };

/**
 * Encerra uma preparação.
 *
 * Cancela as revisões pendentes — continuar cobrando revisão de um concurso
 * que o aluno abandonou seria uma dívida que não existe mais, e estragaria a
 * métrica de aderência dele na preparação que importa.
 *
 * O conteúdo e o histórico ficam. `archived` é somente leitura, não exclusão.
 */
export async function archivePreparation(input: {
  userId: string;
  preparationId: string;
}): Promise<ArchiveResult> {
  const active = await db
    .select({ id: preparations.id })
    .from(preparations)
    .where(
      and(
        eq(preparations.userId, input.userId),
        ne(preparations.status, "archived"),
        isNull(preparations.deletedAt),
      ),
    );

  if (!active.some((row) => row.id === input.preparationId)) {
    return { ok: false, reason: "not_found" };
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(preparations)
      .set({ status: "archived", archivedAt: now, isCurrent: false, updatedAt: now })
      .where(eq(preparations.id, input.preparationId));

    await tx
      .update(reviewOccurrences)
      .set({ status: "canceled", canceledAt: now })
      .where(
        and(
          eq(reviewOccurrences.preparationId, input.preparationId),
          eq(reviewOccurrences.status, "scheduled"),
        ),
      );

    /**
     * Se a encerrada era a atual, promove a mais recente das que sobraram.
     * Deixar o aluno sem preparação atual o jogaria na tela de "crie sua
     * preparação" mesmo tendo outra pronta.
     */
    const remaining = active.filter((row) => row.id !== input.preparationId);
    if (remaining.length > 0) {
      const [next] = await tx
        .select({ id: preparations.id })
        .from(preparations)
        .where(
          and(
            eq(preparations.userId, input.userId),
            ne(preparations.status, "archived"),
            ne(preparations.id, input.preparationId),
            isNull(preparations.deletedAt),
          ),
        )
        .orderBy(desc(preparations.createdAt))
        .limit(1);

      if (next) {
        await tx
          .update(preparations)
          .set({ isCurrent: true, updatedAt: now })
          .where(eq(preparations.id, next.id));
      }
    }
  });

  await recordEvent(input.userId, "preparation_archived", {
    preparationId: input.preparationId,
  });

  return { ok: true, freedSlot: true };
}

/**
 * Reabre uma preparação encerrada, se o plano permitir.
 *
 * O gate é conferido AQUI e não só na tela: quem encerrou uma para criar outra
 * no plano Free não pode reabrir a primeira e ficar com duas.
 *
 * ⚠️ REABRIR PRECISA DESFAZER O QUE ENCERRAR FEZ — E POR MUITO TEMPO NÃO FAZIA.
 *
 * `archivePreparation` cancela as revisões pendentes, e com razão: não se cobra
 * revisão de um concurso abandonado. Só que reabrir devolvia `status = active`
 * e mais nada. O aluno recuperava a preparação com o ciclo de revisões MORTO, e
 * nada na tela dizia isso — "Revisões para hoje" simplesmente ficava vazia para
 * sempre.
 *
 * Foi assim que a cliente perdeu as quatro revisões de 24 horas dos estudos que
 * ela tinha acabado de concluir: encerrou a preparação, reabriu minutos depois,
 * e no dia seguinte não havia revisão nenhuma. O resto da tela funcionava, o
 * que tornava o defeito mais difícil de acreditar do que de reproduzir.
 *
 * O `canceled_at = archived_at` é o que separa as revisões que ESTE
 * encerramento matou das canceladas por outro motivo — o encerramento carimba
 * as duas colunas com o mesmo instante. Restaurar tudo que está cancelado
 * ressuscitaria também revisão de assunto que o aluno tirou do plano.
 */
export async function reopenPreparation(input: {
  userId: string;
  preparationId: string;
}): Promise<{ ok: boolean; message?: string; restoredReviews?: number }> {
  const gate = await checkPreparationLimit(input.userId);
  if (!gate.allowed) {
    return {
      ok: false,
      message:
        `Seu plano permite ${gate.limit} preparação ativa e você já tem ${gate.current}. ` +
        "Encerre a atual antes de reabrir esta.",
    };
  }

  // Lido ANTES de reabrir: o `update` zera `archivedAt`, e é ele que identifica
  // quais revisões voltar.
  const [alvo] = await db
    .select({ archivedAt: preparations.archivedAt })
    .from(preparations)
    .where(
      and(
        eq(preparations.id, input.preparationId),
        eq(preparations.userId, input.userId),
        eq(preparations.status, "archived"),
      ),
    )
    .limit(1);

  if (!alvo) return { ok: false, message: "Preparação não encontrada." };

  const now = new Date();

  const restoredReviews = await db.transaction(async (tx) => {
    await tx
      .update(preparations)
      .set({ status: "active", archivedAt: null, updatedAt: now })
      .where(eq(preparations.id, input.preparationId));

    if (!alvo.archivedAt) return 0;

    const restored = await tx
      .update(reviewOccurrences)
      .set({ status: "scheduled", canceledAt: null })
      .where(
        and(
          eq(reviewOccurrences.preparationId, input.preparationId),
          eq(reviewOccurrences.status, "canceled"),
          eq(reviewOccurrences.canceledAt, alvo.archivedAt),
          /*
            O assunto precisa continuar no plano. Se ele foi desativado entre o
            encerramento e a reabertura, a revisão não deve voltar — seria
            cobrar conteúdo que o aluno tirou de propósito.
          */
          sql`exists (
            select 1 from ${studyPlanTopics}
            where ${studyPlanTopics.id} = ${reviewOccurrences.planTopicId}
              and ${studyPlanTopics.isActive} = true
              and ${studyPlanTopics.deletedAt} is null
          )`,
        ),
      );

    return restored.count;
  });

  return { ok: true, restoredReviews };
}
