import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { planLimits, planPrices, plans } from "@/server/db/schema";

import { promocoesVigentes } from "./promotions";

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
  /**
   * Preço anual à vista, quando existe.
   *
   * ⚠️ ESTAVA CADASTRADO E ATIVO NO BANCO, E A PÁGINA NÃO MOSTRAVA. A consulta
   * filtrava só `monthly` e descartava a linha anual em silêncio — a oferta de
   * 50% do README (R$ 419,40 e R$ 539,40) simplesmente não existia para quem
   * abria a página de planos.
   */
  annualCents: number | null;
  /** A promoção do mensal que vale hoje, quando há. */
  monthlyPromo: { amountCents: number; endsOn: string } | null;
  /** A promoção do anual que vale hoje, quando há. */
  annualPromo: { amountCents: number; endsOn: string } | null;
  /** `null` = ilimitado. Nunca zero: zero significaria "não pode nenhuma". */
  dailyQuestionLimit: number | null;
  maxActivePreparations: number | null;
  monthlyEditalUploadLimit: number | null;
};

export async function listPublicPlans(): Promise<PlanView[]> {
  const rows = await db
    .select({
      id: plans.id,
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

  const promocoes = await promocoesVigentes();
  const promoDe = (planId: string, periodo: "monthly" | "annual") => {
    const achada = promocoes.find((p) => p.planId === planId && p.billingPeriod === periodo);
    return achada ? { amountCents: achada.amountCents, endsOn: achada.endsOn } : null;
  };

  const monthlyBy = new Map(
    prices
      .filter((price) => price.period === "monthly")
      .map((price) => [price.planCode, price.amountCents]),
  );

  const annualBy = new Map(
    prices
      .filter((price) => price.period === "annual")
      .map((price) => [price.planCode, price.amountCents]),
  );

  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    tagline: row.tagline,
    isFeatured: row.isFeatured,
    monthlyCents: monthlyBy.get(row.code) ?? null,
    annualCents: annualBy.get(row.code) ?? null,
    monthlyPromo: promoDe(row.id, "monthly"),
    annualPromo: promoDe(row.id, "annual"),
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

/**
 * Quanto o anual sai por mês, e quanto economiza.
 *
 * O número que convence é o EQUIVALENTE MENSAL — "R$ 419,40 por ano" exige que
 * a pessoa divida de cabeça para comparar com os R$ 69,90 ao lado.
 */
export function annualSavings(
  monthlyCents: number | null,
  annualCents: number | null,
): { perMonthCents: number; percentOff: number } | null {
  if (!monthlyCents || !annualCents) return null;

  const fullYear = monthlyCents * 12;
  if (annualCents >= fullYear) return null;

  return {
    perMonthCents: Math.round(annualCents / 12),
    percentOff: Math.round((1 - annualCents / fullYear) * 100),
  };
}

export function formatPrice(cents: number | null): string {
  if (cents === null || cents === 0) return "Grátis";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}
