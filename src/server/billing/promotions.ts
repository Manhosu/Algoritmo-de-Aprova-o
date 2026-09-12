import "server-only";

import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";

import { APP_TIMEZONE } from "@/config/app";
import {
  promocaoVigente,
  situacaoDaPromocao,
  validarPromocao,
  type NovaPromocao,
  type PeriodoDeCobranca,
  type Promocao,
  type SituacaoDaPromocao,
} from "@/modules/billing/promotions";
import { toCivilDate, type CivilDate } from "@/modules/shared/dates";
import { db } from "@/server/db";
import { planPrices, planPromotions, plans } from "@/server/db/schema";

/**
 * PROMOÇÕES — leitura e escrita. A regra mora em `modules/billing/promotions`.
 */

const colunas = {
  id: planPromotions.id,
  planId: planPromotions.planId,
  billingPeriod: planPromotions.billingPeriod,
  amountCents: planPromotions.amountCents,
  startsOn: planPromotions.startsOn,
  endsOn: planPromotions.endsOn,
  canceledAt: planPromotions.canceledAt,
};

function comoPromocao(linha: {
  id: string;
  planId: string;
  billingPeriod: PeriodoDeCobranca;
  amountCents: number;
  startsOn: string;
  endsOn: string;
  canceledAt: Date | null;
}): Promocao {
  return {
    ...linha,
    startsOn: linha.startsOn as CivilDate,
    endsOn: linha.endsOn as CivilDate,
  };
}

/** As promoções que valem hoje, em todos os planos — a página de planos lê daqui. */
export async function promocoesVigentes(now: Date = new Date()): Promise<Promocao[]> {
  const hoje = toCivilDate(now, APP_TIMEZONE);

  const linhas = await db
    .select(colunas)
    .from(planPromotions)
    .where(
      and(
        isNull(planPromotions.canceledAt),
        lte(planPromotions.startsOn, hoje),
        gte(planPromotions.endsOn, hoje),
      ),
    );

  return linhas.map(comoPromocao);
}

export type PrecoVigente = {
  amountCents: number;
  regularCents: number;
  promotionId: string | null;
  endsOn: CivilDate | null;
};

/**
 * O preço que vale HOJE para este plano e período: o promocional, quando há
 * promoção, e o normal fora dela. `null` quando o plano não tem preço ativo.
 */
export async function precoVigente(
  planId: string,
  periodo: PeriodoDeCobranca,
  now: Date = new Date(),
): Promise<PrecoVigente | null> {
  const hoje = toCivilDate(now, APP_TIMEZONE);

  const [normal] = await db
    .select({ amountCents: planPrices.amountCents })
    .from(planPrices)
    .where(
      and(
        eq(planPrices.planId, planId),
        eq(planPrices.billingPeriod, periodo),
        eq(planPrices.isActive, true),
      ),
    )
    .limit(1);

  if (!normal) return null;

  const candidatas = await db
    .select(colunas)
    .from(planPromotions)
    .where(
      and(
        eq(planPromotions.planId, planId),
        eq(planPromotions.billingPeriod, periodo),
        isNull(planPromotions.canceledAt),
        gte(planPromotions.endsOn, hoje),
      ),
    );

  const vigente = promocaoVigente(candidatas.map(comoPromocao), planId, periodo, hoje);

  return {
    amountCents: vigente?.amountCents ?? normal.amountCents,
    regularCents: normal.amountCents,
    promotionId: vigente?.id ?? null,
    endsOn: vigente?.endsOn ?? null,
  };
}

export type PromocaoNoPainel = Promocao & {
  planName: string;
  precoNormalCents: number | null;
  situacao: SituacaoDaPromocao;
};

/** As promoções mais recentes, para a aba Planos do painel. */
export async function listarPromocoesParaOPainel(
  now: Date = new Date(),
): Promise<PromocaoNoPainel[]> {
  const hoje = toCivilDate(now, APP_TIMEZONE);

  const [linhas, precos] = await Promise.all([
    db
      .select({ ...colunas, planName: plans.name })
      .from(planPromotions)
      .innerJoin(plans, eq(plans.id, planPromotions.planId))
      .orderBy(desc(planPromotions.startsOn))
      .limit(30),
    db
      .select({
        planId: planPrices.planId,
        billingPeriod: planPrices.billingPeriod,
        amountCents: planPrices.amountCents,
      })
      .from(planPrices)
      .where(eq(planPrices.isActive, true)),
  ]);

  return linhas.map((linha) => {
    const promocao = comoPromocao(linha);
    return {
      ...promocao,
      planName: linha.planName,
      precoNormalCents:
        precos.find((p) => p.planId === linha.planId && p.billingPeriod === linha.billingPeriod)
          ?.amountCents ?? null,
      situacao: situacaoDaPromocao(promocao, hoje),
    };
  });
}

export type ResultadoDaPromocao = { ok: true } | { ok: false; problems: string[] };

export async function criarPromocao(
  input: NovaPromocao & { createdByUserId: string | null },
  now: Date = new Date(),
): Promise<ResultadoDaPromocao> {
  const hoje = toCivilDate(now, APP_TIMEZONE);

  const plano = await db.query.plans.findFirst({
    where: (t, { eq: e }) => e(t.id, input.planId),
    columns: { id: true, name: true },
  });

  if (!plano) return { ok: false, problems: ["Escolha um plano."] };

  const [normal, existentes] = await Promise.all([
    db
      .select({ amountCents: planPrices.amountCents })
      .from(planPrices)
      .where(
        and(
          eq(planPrices.planId, input.planId),
          eq(planPrices.billingPeriod, input.billingPeriod),
          eq(planPrices.isActive, true),
        ),
      )
      .limit(1),
    db
      .select(colunas)
      .from(planPromotions)
      .where(
        and(
          eq(planPromotions.planId, input.planId),
          eq(planPromotions.billingPeriod, input.billingPeriod),
          isNull(planPromotions.canceledAt),
        ),
      ),
  ]);

  const problemas = validarPromocao(input, {
    nomeDoPlano: plano.name,
    precoNormalCents: normal[0]?.amountCents ?? null,
    hoje,
    existentes: existentes.map(comoPromocao),
  });

  if (problemas.length > 0) return { ok: false, problems: problemas };

  await db.insert(planPromotions).values({
    planId: input.planId,
    billingPeriod: input.billingPeriod,
    amountCents: input.amountCents,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    createdByUserId: input.createdByUserId,
  });

  return { ok: true };
}

/**
 * Encerra a promoção agora. Vale para a agendada (não chega a começar) e para a
 * vigente (quem já assinou nela continua com o preço dela).
 */
export async function encerrarPromocao(id: string, now: Date = new Date()): Promise<boolean> {
  const encerradas = await db
    .update(planPromotions)
    .set({ canceledAt: now, updatedAt: now })
    .where(and(eq(planPromotions.id, id), isNull(planPromotions.canceledAt)))
    .returning({ id: planPromotions.id });

  return encerradas.length > 0;
}
