import "server-only";

import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";

import { APP_TIMEZONE } from "@/config/app";
import { toCivilDate } from "@/modules/shared/dates";
import { db } from "@/server/db";
import {
  coinLedger,
  storeItems,
  storeRedemptions,
  userGamificationStates,
} from "@/server/db/schema";

/**
 * LOJA — resgate de moedas (README 2.3 e 2.4).
 * ============================================================================
 *
 * ⚠️ O SALDO NUNCA É DECREMENTADO DIRETO. O resgate lança uma linha NEGATIVA no
 * `coin_ledger` e o estado consolidado é atualizado a partir dela.
 *
 * É a mesma decisão do XP, pelo mesmo motivo: um contador que só sobe e desce
 * fica errado na primeira falha de escrita e ninguém descobre até o aluno
 * reclamar. Com livro-razão, "por que eu tenho 120 moedas?" tem resposta linha a
 * linha, e um resgate cancelado se desfaz lançando a contrapartida, não
 * "consertando" um número.
 */

export type StoreItemView = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  category: string | null;
  costCoins: number;
  /** NULO = estoque ilimitado. */
  stock: number | null;
  /** O aluno tem moedas suficientes E há estoque. */
  affordable: boolean;
};

export type StoreView = {
  balance: number;
  items: StoreItemView[];
  history: Array<{
    id: string;
    itemName: string;
    costCoins: number;
    status: "pending" | "fulfilled" | "canceled";
    redeemedAt: Date;
  }>;
};

export async function getStore(userId: string): Promise<StoreView> {
  const [estado, itens, historico] = await Promise.all([
    db.query.userGamificationStates.findFirst({
      where: (g, { eq: e }) => e(g.userId, userId),
      columns: { coinBalance: true },
    }),

    db
      .select()
      .from(storeItems)
      .where(eq(storeItems.isActive, true))
      .orderBy(asc(storeItems.sortOrder), asc(storeItems.costCoins)),

    db
      .select({
        id: storeRedemptions.id,
        itemName: storeItems.name,
        costCoins: storeRedemptions.costCoins,
        status: storeRedemptions.status,
        redeemedAt: storeRedemptions.redeemedAt,
      })
      .from(storeRedemptions)
      .innerJoin(storeItems, eq(storeItems.id, storeRedemptions.storeItemId))
      .where(eq(storeRedemptions.userId, userId))
      .orderBy(desc(storeRedemptions.redeemedAt))
      .limit(10),
  ]);

  const saldo = estado?.coinBalance ?? 0;

  return {
    balance: saldo,
    items: itens.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      imageUrl: item.imageUrl,
      category: item.category,
      costCoins: item.costCoins,
      stock: item.stock,
      affordable: saldo >= item.costCoins && (item.stock === null || item.stock > 0),
    })),
    history: historico,
  };
}

export type RedeemResult =
  | { ok: true; remaining: number }
  | { ok: false; reason: "not_found" | "no_coins" | "out_of_stock" };

/**
 * Resgata um item.
 *
 * ⚠️ A CONFERÊNCIA DE SALDO E DE ESTOQUE ACONTECE NO `UPDATE`, não antes dele.
 *
 * Ler o saldo, decidir em JavaScript e gravar depois abre a janela clássica:
 * dois toques no mesmo botão leem 100 moedas, os dois aprovam um resgate de 80,
 * e o aluno leva dois itens por 80. Com a condição dentro do `where`, o segundo
 * `UPDATE` não encontra linha e o resgate é recusado — o banco arbitra, e não a
 * ordem em que duas requisições chegaram.
 *
 * O mesmo vale para o estoque.
 */
export async function redeemItem(input: {
  userId: string;
  storeItemId: string;
  now?: Date;
}): Promise<RedeemResult> {
  const now = input.now ?? new Date();

  const item = await db.query.storeItems.findFirst({
    where: (i, { and: a, eq: e }) => a(e(i.id, input.storeItemId), e(i.isActive, true)),
    columns: { id: true, costCoins: true, stock: true },
  });

  if (!item) return { ok: false, reason: "not_found" };

  return db.transaction(async (tx) => {
    /*
      Estoque primeiro: se ele acabou, o saldo do aluno nem chega a ser tocado.
      `stock is null` é estoque ilimitado e passa direto.
    */
    if (item.stock !== null) {
      const baixa = await tx
        .update(storeItems)
        .set({ stock: sql`${storeItems.stock} - 1`, updatedAt: now })
        .where(and(eq(storeItems.id, item.id), sql`${storeItems.stock} > 0`))
        .returning({ id: storeItems.id });

      if (baixa.length === 0) return { ok: false, reason: "out_of_stock" as const };
    }

    const debitado = await tx
      .update(userGamificationStates)
      .set({
        coinBalance: sql`${userGamificationStates.coinBalance} - ${item.costCoins}`,
        updatedAt: now,
      })
      .where(
        and(
          eq(userGamificationStates.userId, input.userId),
          sql`${userGamificationStates.coinBalance} >= ${item.costCoins}`,
        ),
      )
      .returning({ balance: userGamificationStates.coinBalance });

    if (debitado.length === 0) {
      /*
        Devolve o estoque que já foi baixado. A transação seria revertida de
        qualquer jeito por um `throw`, mas lançar exceção para um caso previsto
        — "faltam moedas" — transformaria uma recusa normal em erro de servidor
        na tela do aluno.
      */
      if (item.stock !== null) {
        await tx
          .update(storeItems)
          .set({ stock: sql`${storeItems.stock} + 1` })
          .where(eq(storeItems.id, item.id));
      }
      return { ok: false, reason: "no_coins" as const };
    }

    const [resgate] = await tx
      .insert(storeRedemptions)
      .values({
        userId: input.userId,
        storeItemId: item.id,
        // O custo é congelado aqui: o preço da loja pode mudar amanhã, e o
        // histórico precisa dizer quanto ESTE resgate custou.
        costCoins: item.costCoins,
        status: "pending",
        redeemedAt: now,
      })
      .returning({ id: storeRedemptions.id });

    await tx.insert(coinLedger).values({
      userId: input.userId,
      reason: "store_redemption",
      amount: -item.costCoins,
      sourceType: "store_redemption",
      sourceId: resgate.id,
      occurredAt: now,
      occurredDate: toCivilDate(now, APP_TIMEZONE),
    });

    return { ok: true, remaining: debitado[0].balance };
  });
}

/* ========================================================================== *
 * ADMINISTRAÇÃO
 * ========================================================================== */

export type AdminStoreItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  costCoins: number;
  stock: number | null;
  isActive: boolean;
  /** Resgates pendentes deste item — o que a operação precisa entregar. */
  pendingRedemptions: number;
};

export async function listStoreItemsForAdmin(): Promise<AdminStoreItem[]> {
  return db
    .select({
      id: storeItems.id,
      code: storeItems.code,
      name: storeItems.name,
      description: storeItems.description,
      costCoins: storeItems.costCoins,
      stock: storeItems.stock,
      isActive: storeItems.isActive,
      pendingRedemptions: sql<number>`(
        select count(*)::int from ${storeRedemptions}
        where ${storeRedemptions.storeItemId} = ${storeItems.id}
          and ${storeRedemptions.status} = 'pending'
      )`,
    })
    .from(storeItems)
    .orderBy(asc(storeItems.sortOrder), asc(storeItems.name));
}

/** Os resgates que alguém precisa entregar. */
export async function pendingRedemptions(limit = 50) {
  return db
    .select({
      id: storeRedemptions.id,
      itemName: storeItems.name,
      costCoins: storeRedemptions.costCoins,
      redeemedAt: storeRedemptions.redeemedAt,
      studentName: sql<string | null>`(
        select name from users where users.id = ${storeRedemptions.userId}
      )`,
      studentEmail: sql<string | null>`(
        select email from users where users.id = ${storeRedemptions.userId}
      )`,
    })
    .from(storeRedemptions)
    .innerJoin(storeItems, eq(storeItems.id, storeRedemptions.storeItemId))
    .where(eq(storeRedemptions.status, "pending"))
    .orderBy(asc(storeRedemptions.redeemedAt))
    .limit(limit);
}

/** Marca um resgate como entregue. */
export async function fulfillRedemption(redemptionId: string): Promise<boolean> {
  const linhas = await db
    .update(storeRedemptions)
    .set({ status: "fulfilled", fulfilledAt: new Date() })
    .where(
      and(eq(storeRedemptions.id, redemptionId), eq(storeRedemptions.status, "pending")),
    )
    .returning({ id: storeRedemptions.id });

  return linhas.length > 0;
}

/**
 * Cria ou atualiza um item da loja.
 *
 * `code` é a chave natural: repetir o mesmo código atualiza o item em vez de
 * criar um segundo com o mesmo nome. É o que torna a tela do painel segura
 * contra um clique duplo no botão de salvar.
 */
export async function upsertStoreItem(input: {
  code: string;
  name: string;
  description?: string | null;
  costCoins: number;
  stock?: number | null;
  isActive?: boolean;
}): Promise<void> {
  await db
    .insert(storeItems)
    .values({
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      costCoins: input.costCoins,
      stock: input.stock ?? null,
      isActive: input.isActive ?? true,
    })
    .onConflictDoUpdate({
      target: storeItems.code,
      set: {
        name: input.name,
        description: input.description ?? null,
        costCoins: input.costCoins,
        stock: input.stock ?? null,
        isActive: input.isActive ?? true,
        updatedAt: new Date(),
      },
    });
}

/**
 * Quantos itens a loja tem no ar.
 *
 * A Visão Geral usa isto para avisar que a loja está vazia: moeda que não compra
 * nada é uma promessa quebrada em silêncio, e o aluno acumula moedas achando que
 * elas servem para alguma coisa.
 */
export async function countActiveStoreItems(): Promise<number> {
  const [linha] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(storeItems)
    .where(
      and(
        eq(storeItems.isActive, true),
        or(isNull(storeItems.stock), sql`${storeItems.stock} > 0`),
      ),
    );

  return linha?.total ?? 0;
}
