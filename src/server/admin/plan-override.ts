import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { planPrices, plans, subscriptions } from "@/server/db/schema";

/**
 * TROCA MANUAL DE PLANO PELO PAINEL (pedido da cliente em 04/09/2026).
 * ============================================================================
 *
 * Palavras dela: "queria liberar o Acesso Premium para minha irmã, sem precisar
 * que ela pague. Queria ter esse acesso no Painel Administrativo para alterar o
 * plano manualmente."
 *
 * ⚠️ O SCHEMA JÁ PREVIA ISSO. `subscriptions.provider = "manual"`,
 * `changed_by_user_id` e `change_note` existem desde o Marco 1, justamente para
 * separar quem pagou de quem recebeu acesso pela operação. O que faltava era a
 * tela.
 *
 * ⚠️ CADA TROCA REGISTRA QUEM FEZ E POR QUÊ.
 *
 * Acesso pago concedido de graça é a decisão mais fácil de esquecer e a mais
 * cara de auditar depois. Sem `changed_by` e `change_note`, daqui a seis meses
 * ninguém saberia por que uma conta tem Premium sem nenhum pagamento associado
 * — e o painel financeiro contaria essa pessoa como assinante pago.
 *
 * ⚠️ E ELA NÃO ENTRA NO MRR.
 *
 * `getFinanceSummary` soma `plan_prices.amount_cents` das assinaturas ativas.
 * Uma cortesia sem `plan_price_id` fica com valor nulo e não é somada, que é o
 * comportamento certo: dinheiro que não entrou não pode aparecer como receita.
 */

export type PlanOverrideResult =
  | { ok: true; planName: string; created: boolean }
  | { ok: false; message: string };

export async function setPlanManually(input: {
  userId: string;
  planCode: string;
  /** O admin que fez a troca. */
  changedByUserId: string;
  note: string | null;
}): Promise<PlanOverrideResult> {
  const [plano] = await db
    .select({ id: plans.id, name: plans.name, code: plans.code })
    .from(plans)
    .where(and(eq(plans.code, input.planCode), eq(plans.isActive, true)))
    .limit(1);

  if (!plano) return { ok: false, message: "Plano não encontrado." };

  const [atual] = await db
    .select({ id: subscriptions.id, planId: subscriptions.planId, provider: subscriptions.provider })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, input.userId), eq(subscriptions.status, "active")))
    .limit(1);

  if (atual?.planId === plano.id) {
    return { ok: false, message: `Esta conta já está no ${plano.name}.` };
  }

  /*
    ⚠️ TROCAR UMA ASSINATURA PAGA À MÃO NÃO CANCELA A COBRANÇA.

    O Mercado Pago continua cobrando: quem manda parar é a API deles, e este
    caminho não fala com ela. Trocar por baixo deixaria a pessoa pagando por um
    plano que ela não tem mais — o pior dos dois mundos.

    Cortesia é para conta sem cobrança ativa. Para cancelar uma assinatura paga,
    o caminho é o Mercado Pago.
  */
  if (atual?.provider === "mercadopago") {
    return {
      ok: false,
      message:
        "Esta conta tem assinatura ativa no Mercado Pago. Cancele por lá antes " +
        "de trocar o plano aqui, senão a cobrança continua.",
    };
  }

  /*
    O preço do plano entra só quando existe. O Free não tem `plan_prices`, e uma
    cortesia de Premium fica DE PROPÓSITO sem preço: ver a nota do cabeçalho
    sobre o MRR.
  */
  const agora = new Date();

  await db.transaction(async (tx) => {
    /*
      `subscriptions_one_active_per_user` é índice parcial e recusa duas linhas
      ativas. Encerrar antes de criar é obrigatório, e as duas coisas juntas na
      transação evitam deixar o aluno sem plano no meio do caminho.
    */
    await tx
      .update(subscriptions)
      .set({
        status: "canceled",
        canceledAt: agora,
        endedAt: agora,
        cancelReason: "Trocado pelo painel administrativo",
        updatedAt: agora,
      })
      .where(
        and(eq(subscriptions.userId, input.userId), eq(subscriptions.status, "active")),
      );

    await tx.insert(subscriptions).values({
      userId: input.userId,
      planId: plano.id,
      status: "active",
      provider: "manual",
      startedAt: agora,
      changedByUserId: input.changedByUserId,
      changeNote: input.note?.trim() || "Concedido pelo painel administrativo.",
    });
  });

  return { ok: true, planName: plano.name, created: !atual };
}

/** Os planos que o painel pode conceder. */
export async function listAssignablePlans(): Promise<
  Array<{ code: string; name: string; hasPrice: boolean }>
> {
  const linhas = await db
    .select({
      code: plans.code,
      name: plans.name,
      priceId: planPrices.id,
    })
    .from(plans)
    .leftJoin(planPrices, and(eq(planPrices.planId, plans.id), eq(planPrices.isActive, true)))
    .where(eq(plans.isActive, true))
    .orderBy(plans.sortOrder);

  /* O left join repete o plano por preço (mensal e anual). Um por código. */
  const porCodigo = new Map<string, { code: string; name: string; hasPrice: boolean }>();
  for (const linha of linhas) {
    const existente = porCodigo.get(linha.code);
    porCodigo.set(linha.code, {
      code: linha.code,
      name: linha.name,
      hasPrice: Boolean(existente?.hasPrice || linha.priceId),
    });
  }

  return [...porCodigo.values()];
}
