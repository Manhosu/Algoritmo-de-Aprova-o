import "server-only";

import { and, eq, lte } from "drizzle-orm";

import { quandoEncerrar } from "@/modules/billing/cancel-policy";
import { db } from "@/server/db";
import { plans, subscriptions } from "@/server/db/schema";

import { cancelPreapproval, getPreapproval } from "./mercadopago";
import { voltarParaFree } from "./webhook";

/**
 * CANCELAR A ASSINATURA PELO PERFIL DO ALUNO.
 * ============================================================================
 *
 * Ver a regra em `modules/billing/cancel-policy`: o cancelamento para as
 * cobranças no Mercado Pago na hora, e o plano continua até o fim do período
 * que o aluno já pagou.
 */

export type MinhaAssinatura = {
  planName: string;
  planCode: string;
  billingPeriod: "monthly" | "annual" | null;
  /** Assinatura cobrada pelo Mercado Pago — a única que tem o que cancelar. */
  paga: boolean;
  /** O aluno já cancelou; o plano segue até `fimDoPeriodo`. */
  cancelada: boolean;
  fimDoPeriodo: Date | null;
};

export async function getMinhaAssinatura(userId: string): Promise<MinhaAssinatura | null> {
  const [linha] = await db
    .select({
      planName: plans.name,
      planCode: plans.code,
      billingPeriod: subscriptions.billingPeriod,
      provider: subscriptions.provider,
      externalSubscriptionId: subscriptions.externalSubscriptionId,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    .limit(1);

  if (!linha) return null;

  return {
    planName: linha.planName,
    planCode: linha.planCode,
    billingPeriod: linha.billingPeriod,
    paga: linha.provider === "mercadopago" && Boolean(linha.externalSubscriptionId),
    cancelada: linha.cancelAtPeriodEnd,
    fimDoPeriodo: linha.currentPeriodEnd,
  };
}

export type ResultadoDoCancelamento =
  | { ok: true; acessoAte: Date | null }
  | { ok: false; message: string };

export async function cancelarAssinaturaDoAluno(
  userId: string,
  now: Date = new Date(),
): Promise<ResultadoDoCancelamento> {
  const [linha] = await db
    .select({
      id: subscriptions.id,
      provider: subscriptions.provider,
      externalSubscriptionId: subscriptions.externalSubscriptionId,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
    })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    .limit(1);

  if (!linha || linha.provider !== "mercadopago" || !linha.externalSubscriptionId) {
    return { ok: false, message: "Não há assinatura paga para cancelar." };
  }

  /* Segundo clique, ou outra aba: já está cancelada, e a resposta é a mesma. */
  if (linha.cancelAtPeriodEnd) return { ok: true, acessoAte: linha.currentPeriodEnd };

  /*
    ⚠️ PRIMEIRO O MERCADO PAGO, DEPOIS O BANCO.

    Na ordem inversa, uma falha de rede deixaria a assinatura marcada como
    cancelada aqui e cobrando lá — o pior resultado possível, e o aluno só
    descobriria na fatura do cartão.
  */
  try {
    await cancelPreapproval(linha.externalSubscriptionId);
  } catch (erro) {
    /* Já cancelada lá (pelo painel do Mercado Pago, por exemplo): segue. */
    const remota = await getPreapproval(linha.externalSubscriptionId).catch(() => null);

    if (remota?.status !== "cancelled") {
      console.error("[mercadopago] falha ao cancelar a assinatura", erro);
      return {
        ok: false,
        message: "Não consegui falar com o Mercado Pago agora. Tente de novo em alguns minutos.",
      };
    }
  }

  const decisao = quandoEncerrar({ currentPeriodEnd: linha.currentPeriodEnd, now });

  if (decisao.quando === "fim_do_periodo") {
    await db
      .update(subscriptions)
      .set({
        cancelAtPeriodEnd: true,
        canceledAt: now,
        cancelReason: "Cancelada pelo aluno no perfil",
        updatedAt: now,
      })
      .where(eq(subscriptions.id, linha.id));

    return { ok: true, acessoAte: decisao.ate };
  }

  await db
    .update(subscriptions)
    .set({
      status: "canceled",
      cancelAtPeriodEnd: true,
      canceledAt: now,
      cancelReason: "Cancelada pelo aluno no perfil",
      endedAt: now,
      updatedAt: now,
    })
    .where(eq(subscriptions.id, linha.id));

  await voltarParaFree(userId);

  return { ok: true, acessoAte: null };
}

/**
 * Encerra a assinatura cancelada pelo aluno cujo período pago já acabou.
 *
 * Chamada por `getStudentContext` a cada requisição da área do aluno — ver a
 * nota lá. Devolve verdadeiro quando encerrou alguma.
 */
export async function encerrarAssinaturaVencida(
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const [vencida] = await db
    .select({ id: subscriptions.id, fim: subscriptions.currentPeriodEnd })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active"),
        eq(subscriptions.cancelAtPeriodEnd, true),
        lte(subscriptions.currentPeriodEnd, now),
      ),
    )
    .limit(1);

  if (!vencida) return false;

  await db
    .update(subscriptions)
    .set({ status: "canceled", endedAt: vencida.fim ?? now, updatedAt: now })
    .where(and(eq(subscriptions.id, vencida.id), eq(subscriptions.status, "active")));

  await voltarParaFree(userId);

  return true;
}
