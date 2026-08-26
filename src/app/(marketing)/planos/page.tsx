import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { describeLimit, formatPrice, listPublicPlans } from "@/server/billing/plans";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Planos",
  description:
    "Comece de graça. Suba de plano quando quiser mais questões por dia e mais de uma preparação ao mesmo tempo.",
};

/**
 * Planos.
 *
 * ⚠️ Os limites vêm do BANCO — são os mesmos que o servidor aplica em
 * `checkPreparationLimit` e `getDailyLimit`. Escrever os números à mão aqui
 * criaria uma promessa separada da regra, e no dia em que a cliente mudasse o
 * teto do Free esta página continuaria anunciando o antigo.
 *
 * A contratação em si é do Marco 2 (Mercado Pago). Até lá o botão leva ao
 * cadastro, que é o passo que existe — nunca a um checkout que não abre.
 */
export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const plans = await listPublicPlans();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
      <header className="max-w-2xl">
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

      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <section
            key={plan.code}
            className={cn(
              "flex flex-col rounded-2xl border p-6 transition-colors",
              plan.isFeatured
                ? "border-primary/60 bg-primary-soft/40 glow-ring"
                : "border-border bg-card hover:border-primary/30",
            )}
          >
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
              <Feature>
                {describeLimit(
                  plan.monthlyEditalUploadLimit,
                  "leitura de edital por mês",
                  "leituras de edital por mês",
                )}
              </Feature>
              <Feature>Tarefa do Dia, revisões e cronograma adaptativo</Feature>
            </ul>

            <Button
              asChild
              size="lg"
              variant={plan.isFeatured ? "default" : "outline"}
              className="mt-6"
            >
              <Link href="/cadastrar">
                {plan.monthlyCents ? "Começar no Free e migrar" : "Criar conta grátis"}
              </Link>
            </Button>
          </section>
        ))}
      </div>

      {/*
        Honestidade sobre o que ainda não existe. Anunciar contratação com
        cartão antes de o checkout existir é o tipo de promessa que queima a
        confiança na primeira tentativa.
      */}
      <p className="mt-10 max-w-2xl text-sm text-pretty text-muted-foreground">
        A contratação dos planos pagos está sendo finalizada. Enquanto isso, você
        pode criar sua conta no plano gratuito e usar a plataforma inteira — o
        algoritmo, as revisões e o cronograma não têm versão reduzida.
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
