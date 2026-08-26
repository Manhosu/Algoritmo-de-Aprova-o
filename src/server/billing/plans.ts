import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { planLimits, planPrices, plans } from "@/server/db/schema";

/**
 * Os planos, como a página pública precisa deles.
 *
 * ⚠️ VÊM DO BANCO, não de constante no código. Os limites que aparecem aqui
 * são os MESMOS que o servidor aplica em `checkPreparationLimit` e em
 * `getDailyLimit` — se a página fosse escrita à mão, ela viraria uma promessa
 * separada da regra, e o dia em que a cliente mudasse o teto do Free a página
 * continuaria anunciando o antigo.
 */

export type PlanView = {
  code: string;
  name: string;
  tagline: string | null;
  isFeatured: boolean;
  /** `null` = grátis. */
  monthlyCents: number | null;
  /** `null` = ilimitado. Nunca zero: zero significaria "não pode nenhuma". */
  dailyQuestionLimit: number | null;
  maxActivePreparations: number | null;
  monthlyEditalUploadLimit: number | null;
};

export async function listPublicPlans(): Promise<PlanView[]> {
  const rows = await db
    .select({
      code: plans.code,
      name: plans.name,
      tagline: plans.tagline,
      isFeatured: plans.isFeatured,
      sortOrder: plans.sortOrder,
      dailyQuestionLimit: planLimits.dailyQuestionLimit,
      maxActivePreparations: planLimits.maxActivePreparations,
      monthlyEditalUploadLimit: planLimits.monthlyEditalUploadLimit,
    })
    .from(plans)
    .leftJoin(planLimits, eq(planLimits.planId, plans.id))
    .where(eq(plans.isActive, true))
    .orderBy(asc(plans.sortOrder));

  if (rows.length === 0) return [];

  const prices = await db
    .select({
      planCode: plans.code,
      amountCents: planPrices.amountCents,
      period: planPrices.billingPeriod,
    })
    .from(planPrices)
    .innerJoin(plans, eq(planPrices.planId, plans.id))
    .where(eq(planPrices.isActive, true));

  const monthlyBy = new Map(
    prices
      .filter((price) => price.period === "monthly")
      .map((price) => [price.planCode, price.amountCents]),
  );

  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    tagline: row.tagline,
    isFeatured: row.isFeatured,
    monthlyCents: monthlyBy.get(row.code) ?? null,
    dailyQuestionLimit: row.dailyQuestionLimit,
    maxActivePreparations: row.maxActivePreparations,
    monthlyEditalUploadLimit: row.monthlyEditalUploadLimit,
  }));
}

/**
 * Traduz um limite em frase.
 *
 * `null` é ILIMITADO — nunca "0" nem um número mágico grande. A distinção
 * existe no banco de propósito e some se a UI a achatar.
 */
export function describeLimit(value: number | null, singular: string, plural: string): string {
  if (value === null) return `${plural} ilimitadas`;
  return value === 1 ? `1 ${singular}` : `${value} ${plural}`;
}

export function formatPrice(cents: number | null): string {
  if (cents === null || cents === 0) return "Grátis";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}
