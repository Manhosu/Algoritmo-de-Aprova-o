import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { SubscribeButton } from "@/components/plans/subscribe-button";
import { Button } from "@/components/ui/button";
import { getCurrentSession } from "@/server/auth/session";
import {
  annualSavings,
  describeLimit,
  formatPrice,
  listPublicPlans,
} from "@/server/billing/plans";
import { socialMetadata } from "@/lib/metadata";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Planos",
  description:
    "Comece de graça. Suba de plano quando quiser mais questões por dia e mais de uma preparação ao mesmo tempo.",
  ...socialMetadata({ title: "Planos que cabem no seu ritmo de estudo", path: "/planos" }),
};

/**
 * Planos.
 *
 * ⚠️ Os limites vêm do BANCO — são os mesmos que o servidor aplica em
 * `checkPreparationLimit` e `getDailyLimit`. Escrever os números à mão aqui
 * criaria uma promessa separada da regra, e no dia em que a cliente mudasse o
 * teto do Free esta página continuaria anunciando o antigo.
 *
 * ⚠️ O BOTÃO MUDA CONFORME QUEM OLHA.
 *
 * Sem sessão ele leva ao cadastro: um checkout precisa de conta, e mandar
 * alguém para o Mercado Pago antes disso deixaria um pagamento sem dono. Com
 * sessão, ele abre o checkout direto.
 */
export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const [plans, session] = await Promise.all([listPublicPlans(), getCurrentSession()]);
  const logado = Boolean(session);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
      <header className="rise rise-1 max-w-2xl">
        <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
          Planos
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-balance text-foreground sm:text-5xl">
          Comece de graça. Suba quando o estudo apertar.
        </h1>
        <p className="mt-4 text-lg text-pretty text-muted-foreground">
          O algoritmo é o mesmo nos três planos. O que muda é quanto você pratica
          por dia e quantos concursos consegue tocar ao mesmo tempo.
        </p>
      </header>

      <div className="reveal mt-12 grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <section
            key={plan.code}
            className={cn(
              "relative flex flex-col p-6",
              plan.isFeatured
                ? "lift rounded-2xl border border-primary/60 bg-primary-soft/40 glow-ring"
                : "bento-card",
            )}
          >
            {/*
              ⚠️ A etiqueta sai de `isFeatured`, que vem do banco — o mesmo
              campo que decide a borda acesa. Escrever "Mais popular" fixo no
              plano do meio criaria uma segunda fonte de verdade: no dia em que
              a cliente destacasse outro plano, a borda mudaria de lugar e a
              etiqueta ficaria para trás.
            */}
            {plan.isFeatured ? (
              <span className="absolute -top-2.5 left-6 rounded-full border border-primary/50 bg-background px-2.5 py-0.5 text-[0.65rem] font-semibold tracking-[0.1em] text-primary uppercase">
                Mais popular
              </span>
            ) : null}

            <h2 className="text-sm font-semibold tracking-[0.12em] text-foreground uppercase">
              {plan.name}
            </h2>

            <p className="mt-4 flex items-baseline gap-1.5">
              <span className="text-metric text-3xl text-foreground">
                {formatPrice(plan.monthlyCents)}
              </span>
              {plan.monthlyCents ? (
                <span className="text-sm text-muted-foreground">/mês</span>
              ) : null}
            </p>

            {/*
              O anual, quando existe. Mostrado como EQUIVALENTE MENSAL: quem lê
              "R$ 419,40 por ano" precisa dividir de cabeça para comparar com os
              R$ 69,90 logo acima, e quase ninguém divide.
            */}
            {(() => {
              const savings = annualSavings(plan.monthlyCents, plan.annualCents);
              if (!savings) return null;

              return (
                <p className="mt-2 text-sm text-muted-foreground">
                  ou{" "}
                  <span className="font-medium text-primary">
                    {formatPrice(savings.perMonthCents)}/mês
                  </span>{" "}
                  no plano anual de {formatPrice(plan.annualCents)} — economia de{" "}
                  {savings.percentOff}%
                </p>
              );
            })()}

            {plan.tagline ? (
              <p className="mt-2 text-sm text-pretty text-muted-foreground">
                {plan.tagline}
              </p>
            ) : null}

            <ul className="mt-6 flex flex-1 flex-col gap-2.5">
              <Feature>
                {describeLimit(plan.dailyQuestionLimit, "questão por dia", "questões por dia")}
              </Feature>
              <Feature>
                {describeLimit(
                  plan.maxActivePreparations,
                  "preparação ativa",
                  "preparações ativas",
                )}
              </Feature>
              {/*
                ⚠️ Sem "por mês" (pedido da cliente). O limite continua mensal
                no servidor; o que mudou é o rótulo. Ela achou que "2 leituras
                por mês" soava como cobrança recorrente de algo que o aluno faz
                uma vez, no começo da preparação.
              */}
              <Feature>
                {describeLimit(
                  plan.monthlyEditalUploadLimit,
                  "leitura de edital",
                  "leituras de edital",
                )}
              </Feature>
              <Feature>Tarefa do Dia, revisões e cronograma adaptativo</Feature>
            </ul>

            {logado && plan.monthlyCents ? (
              <SubscribeButton
                planCode={plan.code}
                billingPeriod="monthly"
                label={`Assinar ${plan.name}`}
                variant={plan.isFeatured ? "default" : "outline"}
                className="mt-6"
              />
            ) : (
              <Button
                asChild
                size="lg"
                variant={plan.isFeatured ? "default" : "outline"}
                className="mt-6"
              >
                <Link href={logado ? "/inicio" : "/cadastrar"}>
                  {plan.monthlyCents
                    ? "Começar no Free e migrar"
                    : logado
                      ? "Você já tem conta"
                      : "Criar conta grátis"}
                </Link>
              </Button>
            )}

            {/*
              Botão só do anual (pedido da cliente em 27/08/2026). O desconto
              estava numa linha de texto acima do preço, onde o olho passa reto;
              como botão, ele vira uma escolha e não uma observação.
            */}
            {(() => {
              const savings = annualSavings(plan.monthlyCents, plan.annualCents);
              if (!savings) return null;

              return logado ? (
                <SubscribeButton
                  planCode={plan.code}
                  billingPeriod="annual"
                  label={`Quero o plano anual · ${savings.percentOff}% OFF`}
                  variant="outline"
                  className="mt-2"
                />
              ) : (
                <Button asChild size="lg" variant="outline" className="mt-2 border-primary/50">
                  <Link href="/cadastrar">
                    Quero o plano anual · {savings.percentOff}% OFF
                  </Link>
                </Button>
              );
            })()}
          </section>
        ))}
      </div>

      {/*
        O aviso de "contratação em finalização" SAIU junto com o checkout. Ele
        existia para não prometer o que não havia; mantê-lo agora faria o oposto,
        desanimando quem acabou de ver o botão de assinar.
      */}
      <p className="reveal mt-10 max-w-2xl text-sm text-pretty text-muted-foreground">
        Você pode criar sua conta no plano gratuito e usar a plataforma inteira — o
        algoritmo, as revisões e o cronograma não têm versão reduzida. O que muda
        entre os planos é exatamente o que está listado acima: quantas questões
        você pratica por dia, quantas leituras de edital faz por mês e quantas
        preparações mantém ao mesmo tempo.
      </p>
    </div>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-muted-foreground">
      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <span className="text-pretty">{children}</span>
    </li>
  );
}
