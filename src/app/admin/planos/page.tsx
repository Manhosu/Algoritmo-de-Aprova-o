import { asc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";

import { formatCents, getFinanceSummary } from "@/server/admin/finance";
import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";
import {
  planContentAccess,
  planLimits,
  planPrices,
  plans,
  subscriptions,
  users,
} from "@/server/db/schema";

export const metadata: Metadata = { title: "Planos" };

export const dynamic = "force-dynamic";

const ROTULO_TIPO: Record<string, string> = {
  flashcard_deck: "Flashcards",
  mind_map: "Mapas mentais",
  video: "Videoaulas",
  study_text: "Resumos",
  pdf: "PDFs",
  audio: "Áudios",
};

const ROTULO_ACESSO: Record<string, string> = {
  limited: "Limitado",
  extended: "Ampliado",
  full: "Completo",
};

/** ⚠️ As chaves são os valores do enum `billing_period`: "monthly" e "annual". */
const ROTULO_PERIODO: Record<string, string> = {
  monthly: "Mensal",
  annual: "Anual",
};

/**
 * As regras de cada plano (README 2.6, "Configuração").
 *
 * ⚠️ SÓ LEITURA, e por enquanto é o certo.
 *
 * Mexer em limite de plano tem consequência sobre quem já assinou: baixar o teto
 * diário do Intermediário muda o que pessoas pagantes recebem, sem aviso e sem
 * registro. Preço é pior ainda, porque `plan_prices` nunca é editado no lugar —
 * cria-se uma linha nova para a assinatura antiga continuar apontando para o
 * valor contratado.
 *
 * Enquanto isso não passa por Mercado Pago e por uma decisão de comunicação com
 * o assinante, a tela mostra o que vale hoje e eu mudo por script quando ela
 * pedir. Editar aqui seria construir o botão antes de existir a regra do que
 * acontece depois de apertá-lo.
 */
export default async function AdminPlanosPage() {
  await requireAdmin();

  const [financeiro, linhas, precos, acessos] = await Promise.all([
    getFinanceSummary(),
    db
      .select({
        id: plans.id,
        code: plans.code,
        name: plans.name,
        tagline: plans.tagline,
        isActive: plans.isActive,
        dailyQuestionLimit: planLimits.dailyQuestionLimit,
        maxActivePreparations: planLimits.maxActivePreparations,
        monthlyEditalUploadLimit: planLimits.monthlyEditalUploadLimit,
        /*
          ⚠️ SÓ ALUNOS. A conta de administração também tem assinatura Free, e
          contá-la faria esta tela dizer "5 assinantes" ao lado de uma Visão
          Geral que diz "4 alunos ativos" — dois números para a mesma pergunta,
          sem nada explicando a diferença.
        */
        assinantes: sql<number>`(
          select count(*)::int from ${subscriptions}
          join ${users} on ${users.id} = ${subscriptions.userId}
          where ${subscriptions.planId} = ${plans.id}
            and ${subscriptions.status} = 'active'
            and ${users.role} = 'student'
            and ${users.status} = 'active'
        )`,
      })
      .from(plans)
      .leftJoin(planLimits, eq(planLimits.planId, plans.id))
      .orderBy(asc(plans.sortOrder)),

    db
      .select({
        planId: planPrices.planId,
        billingPeriod: planPrices.billingPeriod,
        amountCents: planPrices.amountCents,
        discountPercent: planPrices.discountPercent,
      })
      .from(planPrices)
      .where(eq(planPrices.isActive, true))
      .orderBy(asc(planPrices.amountCents)),

    db
      .select({
        planId: planContentAccess.planId,
        contentType: planContentAccess.contentType,
        accessLevel: planContentAccess.accessLevel,
        maxItems: planContentAccess.maxItems,
      })
      .from(planContentAccess),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header>
        <p className="text-eyebrow">Administração</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Planos</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          O que cada plano libera e quantas pessoas estão em cada um.
        </p>
      </header>

      {/*
        ASSINATURAS E FINANCEIRO (pedido da cliente em 02/09/2026).

        ⚠️ VEM ANTES DA LISTA DE PLANOS, e a ordem responde à pergunta dela:
        "acompanhar não apenas o número de usuários, mas também a saúde
        financeira". A configuração de cada plano é consulta ocasional; a saúde
        do negócio é o que se olha ao abrir a aba.
      */}
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div>
          <h2 className="font-semibold text-foreground">Assinaturas e financeiro</h2>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">
            Tudo somado de assinaturas e pagamentos reais. Nada é projetado.
          </p>
        </div>

        <dl className="grid gap-4 sm:grid-cols-3">
          <Indicador rotulo="Assinantes ativos" valor={String(financeiro.totalSubscribers)} />
          <Indicador rotulo="Assinantes pagos" valor={String(financeiro.payingSubscribers)} />
          <Indicador
            rotulo="Inadimplência"
            valor={String(financeiro.pastDue)}
            ajuda="Cobranças que falharam e ainda não foram resolvidas."
          />

          <Indicador
            rotulo="MRR"
            valor={formatCents(financeiro.mrrCents)}
            ajuda="Receita recorrente mensal. Plano anual entra dividido por 12."
          />
          <Indicador rotulo="ARR" valor={formatCents(financeiro.arrCents)} ajuda="MRR × 12." />
          <Indicador
            rotulo="Recebido em 30 dias"
            valor={formatCents(financeiro.revenueLast30Cents)}
            ajuda={`${financeiro.paymentsLast30} ${
              financeiro.paymentsLast30 === 1 ? "pagamento aprovado" : "pagamentos aprovados"
            }.`}
          />

          <Indicador rotulo="Cancelamentos (30d)" valor={String(financeiro.canceledLast30)} />
          <Indicador rotulo="Upgrades (30d)" valor={String(financeiro.upgrades)} />
          <Indicador rotulo="Downgrades (30d)" valor={String(financeiro.downgrades)} />
        </dl>

        {financeiro.payingSubscribers === 0 ? (
          <p className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-pretty text-muted-foreground">
            Ainda não há assinante pago. Os valores acima passam a se mover
            assim que a primeira assinatura for confirmada pelo Mercado Pago.
          </p>
        ) : null}
      </section>

      <ul className="flex flex-col gap-4">
        {linhas.map((plano) => {
          const meusPrecos = precos.filter((p) => p.planId === plano.id);
          const meusAcessos = acessos.filter((a) => a.planId === plano.id);

          return (
            <li key={plano.id}>
              <section className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="text-lg font-semibold text-foreground">{plano.name}</h2>
                  <span className="text-metric text-sm text-primary">
                    {plano.assinantes}{" "}
                    {plano.assinantes === 1 ? "assinante" : "assinantes"}
                  </span>
                  {!plano.isActive ? (
                    <span className="text-xs text-muted-foreground">inativo</span>
                  ) : null}
                </div>

                {plano.tagline ? (
                  <p className="mt-1 text-pretty text-sm text-muted-foreground">
                    {plano.tagline}
                  </p>
                ) : null}

                <dl className="mt-4 flex flex-col gap-2 text-sm">
                  <Linha
                    rotulo="Questões por dia"
                    valor={ilimitado(plano.dailyQuestionLimit)}
                  />
                  <Linha
                    rotulo="Preparações ativas"
                    valor={ilimitado(plano.maxActivePreparations)}
                  />
                  <Linha
                    rotulo="Leituras de edital por mês"
                    valor={ilimitado(plano.monthlyEditalUploadLimit)}
                  />

                  {meusPrecos.map((preco) => (
                    <Linha
                      key={`${preco.billingPeriod}-${preco.amountCents}`}
                      rotulo={ROTULO_PERIODO[preco.billingPeriod] ?? preco.billingPeriod}
                      valor={
                        preco.amountCents === 0
                          ? "Grátis"
                          : `R$ ${(preco.amountCents / 100).toFixed(2).replace(".", ",")}${
                              preco.discountPercent
                                ? ` (${preco.discountPercent}% OFF)`
                                : ""
                            }`
                      }
                    />
                  ))}

                  {meusAcessos.map((acesso) => (
                    <Linha
                      key={acesso.contentType}
                      rotulo={ROTULO_TIPO[acesso.contentType] ?? acesso.contentType}
                      valor={`${ROTULO_ACESSO[acesso.accessLevel] ?? acesso.accessLevel}${
                        acesso.maxItems === null ? "" : ` (até ${acesso.maxItems})`
                      }`}
                    />
                  ))}
                </dl>
              </section>
            </li>
          );
        })}
      </ul>

      <p className="text-pretty text-sm text-muted-foreground">
        Mudar limite ou preço afeta quem já assinou, então isso não é um botão
        aqui. Me diga o que precisa alterar e eu ajusto com o registro da
        mudança.
      </p>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="min-w-0 flex-1 text-pretty text-muted-foreground">{rotulo}</dt>
      <dd className="shrink-0 text-right text-foreground">{valor}</dd>
    </div>
  );
}

/** NULO significa sem teto, e "—" seria lido como "não tem". */
function ilimitado(valor: number | null): string {
  return valor === null ? "Ilimitado" : String(valor);
}

/** Um número do painel financeiro, com a explicação do que ele mede. */
function Indicador({
  rotulo,
  valor,
  ajuda,
}: {
  rotulo: string;
  valor: string;
  ajuda?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {rotulo}
      </dt>
      <dd className="text-metric mt-1 text-xl text-foreground">{valor}</dd>
      {ajuda ? (
        <dd className="mt-0.5 text-xs text-pretty text-muted-foreground">{ajuda}</dd>
      ) : null}
    </div>
  );
}
