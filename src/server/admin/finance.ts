import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/server/db";

/**
 * ASSINATURAS E FINANCEIRO (pedido da cliente em 02/09/2026).
 * ============================================================================
 *
 * O que ela pediu, palavra por palavra: total de assinantes, assinantes pagos,
 * cancelamentos, renovações, upgrades/downgrades, inadimplência, MRR e ARR.
 * "Objetivo: acompanhar não apenas o número de usuários, mas também a saúde
 * financeira e o crescimento do negócio."
 *
 * ⚠️ TUDO SAI DE `subscriptions` E `payments`, e nada é estimado.
 *
 * Um painel financeiro que projeta número tem um problema: ninguém consegue
 * conferir se ele está certo. Cada linha aqui é contagem ou soma de registro
 * existente, então qualquer valor pode ser rastreado até a assinatura ou o
 * pagamento que o produziu.
 *
 * ⚠️ MRR É NORMALIZADO PARA O MÊS, e é o único cálculo do arquivo.
 *
 * Uma assinatura anual de R$ 539,40 não são R$ 539,40 de receita mensal
 * recorrente: são R$ 44,95. Somar o valor cheio infla o MRR em doze vezes para
 * cada assinante anual, e é o erro clássico deste indicador — ele apareceria
 * como crescimento explosivo no mês em que alguém migrasse para o anual.
 */

export type FinanceSummary = {
  /** Assinaturas ativas, incluindo Free. */
  totalSubscribers: number;
  /** Só os planos pagos. */
  payingSubscribers: number;
  /** Ativos por plano. */
  byPlan: Array<{ planName: string; billingPeriod: string | null; count: number }>;
  /** Assinaturas canceladas nos últimos 30 dias. */
  canceledLast30: number;
  /** Pagamentos aprovados nos últimos 30 dias — cada um é uma renovação ou 1ª cobrança. */
  paymentsLast30: number;
  /** Soma aprovada nos últimos 30 dias, em centavos. */
  revenueLast30Cents: number;
  /** Assinaturas em `past_due`: cobrança falhou e ainda não foi resolvida. */
  pastDue: number;
  /** Receita recorrente mensal, em centavos. */
  mrrCents: number;
  /** MRR × 12. */
  arrCents: number;
  /** Trocas de plano nos últimos 30 dias, separadas por direção. */
  upgrades: number;
  downgrades: number;
};

export async function getFinanceSummary(): Promise<FinanceSummary> {
  const [ativos, porPlano, cancelados, pagamentos, inadimplentes, mrr, trocas] =
    await Promise.all([
      db.execute<{ total: number; pagos: number }>(sql`
        select count(*)::int as total,
               count(*) filter (
                 where pp.amount_cents is not null and pp.amount_cents > 0
               )::int as pagos
          from subscriptions s
          left join plan_prices pp on pp.id = s.plan_price_id
         where s.status = 'active'
      `),

      db.execute<{ plan_name: string; billing_period: string | null; count: number }>(sql`
        select p.name as plan_name, s.billing_period, count(*)::int as count
          from subscriptions s
          join plans p on p.id = s.plan_id
         where s.status = 'active'
         group by p.name, s.billing_period
         order by count desc
      `),

      db.execute<{ count: number }>(sql`
        select count(*)::int as count from subscriptions
         where status = 'canceled' and canceled_at >= now() - interval '30 days'
      `),

      db.execute<{ count: number; total_cents: number }>(sql`
        select count(*)::int as count,
               coalesce(sum(amount_cents), 0)::int as total_cents
          from payments
         where status = 'approved' and paid_at >= now() - interval '30 days'
      `),

      db.execute<{ count: number }>(sql`
        select count(*)::int as count from subscriptions where status = 'past_due'
      `),

      /*
        A normalização acontece no SQL, não em JavaScript: assim o número que a
        tela mostra e o número que uma consulta manual devolve são o mesmo, e
        conferir o painel não exige ler código.
      */
      db.execute<{ mrr_cents: number }>(sql`
        select coalesce(sum(
                 case when s.billing_period = 'annual'
                      then pp.amount_cents / 12.0
                      else pp.amount_cents
                 end
               ), 0)::int as mrr_cents
          from subscriptions s
          join plan_prices pp on pp.id = s.plan_price_id
         where s.status = 'active'
      `),

      /*
        ⚠️ UPGRADE E DOWNGRADE SÃO INFERIDOS, e o método está declarado aqui.

        Não existe coluna dizendo "isto foi um upgrade". O que existe é a
        assinatura ENCERRADA e a que a substituiu no mesmo aluno. Comparando o
        preço mensal normalizado das duas, a direção fica clara.

        Só conta troca entre planos DIFERENTES: renovar o mesmo plano encerra e
        recria a linha, e sem este filtro toda renovação apareceria como troca
        lateral.
      */
      db.execute<{ upgrades: number; downgrades: number }>(sql`
        with mensal as (
          select s.id, s.user_id, s.plan_id, s.started_at, s.ended_at,
                 case when s.billing_period = 'annual'
                      then coalesce(pp.amount_cents, 0) / 12.0
                      else coalesce(pp.amount_cents, 0)
                 end as valor
            from subscriptions s
            left join plan_prices pp on pp.id = s.plan_price_id
        ),
        trocas as (
          select antiga.valor as de, nova.valor as para
            from mensal antiga
            join mensal nova
              on nova.user_id = antiga.user_id
             and nova.plan_id <> antiga.plan_id
             and nova.started_at >= antiga.ended_at
             and nova.started_at < antiga.ended_at + interval '1 day'
           where antiga.ended_at >= now() - interval '30 days'
        )
        select count(*) filter (where para > de)::int as upgrades,
               count(*) filter (where para < de)::int as downgrades
          from trocas
      `),
    ]);

  const mrrCents = Math.round(mrr[0]?.mrr_cents ?? 0);

  return {
    totalSubscribers: ativos[0]?.total ?? 0,
    payingSubscribers: ativos[0]?.pagos ?? 0,
    byPlan: porPlano.map((linha) => ({
      planName: linha.plan_name,
      billingPeriod: linha.billing_period,
      count: linha.count,
    })),
    canceledLast30: cancelados[0]?.count ?? 0,
    paymentsLast30: pagamentos[0]?.count ?? 0,
    revenueLast30Cents: pagamentos[0]?.total_cents ?? 0,
    pastDue: inadimplentes[0]?.count ?? 0,
    mrrCents,
    arrCents: mrrCents * 12,
    upgrades: trocas[0]?.upgrades ?? 0,
    downgrades: trocas[0]?.downgrades ?? 0,
  };
}

/** Reais com duas casas, a partir de centavos inteiros. */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
