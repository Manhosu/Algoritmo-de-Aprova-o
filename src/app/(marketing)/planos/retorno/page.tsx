import { eq } from "drizzle-orm";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { db } from "@/server/db";
import { plans, subscriptions } from "@/server/db/schema";

export const metadata: Metadata = { title: "Pagamento" };

export const dynamic = "force-dynamic";

/**
 * PARA ONDE O MERCADO PAGO DEVOLVE O ALUNO.
 * ============================================================================
 *
 * ⚠️ ESTA TELA NÃO LIBERA NADA, e a distinção é a coisa mais importante aqui.
 *
 * Quem ativa a assinatura é o webhook, com o estado lido de volta da API do
 * Mercado Pago. Esta página só CONSULTA o que já foi gravado.
 *
 * Confiar no retorno do navegador seria entregar o Premium a quem digitasse a
 * URL com `?status=approved` na barra de endereços.
 *
 * ⚠️ E O WEBHOOK PODE NÃO TER CHEGADO AINDA.
 *
 * O aluno costuma voltar antes da notificação, então "pendente" é um estado
 * normal e frequente, não um erro. A tela diz isso com todas as letras em vez de
 * mostrar falha — um "não foi possível" logo depois de o cartão passar gera
 * exatamente a mensagem de suporte que ninguém quer responder.
 */
export default async function RetornoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const bruto = params.assinatura;
  const id = Array.isArray(bruto) ? bruto[0] : bruto;

  const linha = id
    ? (
        await db
          .select({
            status: subscriptions.status,
            planName: plans.name,
          })
          .from(subscriptions)
          .innerJoin(plans, eq(plans.id, subscriptions.planId))
          .where(eq(subscriptions.id, id))
          .limit(1)
      )[0]
    : null;

  const estado = linha?.status ?? "desconhecida";

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-5 px-4 py-16 text-center">
      {estado === "active" ? (
        <>
          <CheckCircle2 className="size-12 text-success" aria-hidden />
          <h1 className="text-2xl font-bold text-foreground">
            Pronto! Seu {linha?.planName} está ativo.
          </h1>
          <p className="text-pretty text-muted-foreground">
            Todo o conteúdo do seu plano já está liberado.
          </p>
          <Button asChild size="lg">
            <Link href="/inicio">Ir para a Tarefa do Dia</Link>
          </Button>
        </>
      ) : estado === "pending" ? (
        <>
          <Clock className="size-12 text-warning" aria-hidden />
          <h1 className="text-2xl font-bold text-foreground">
            Estamos confirmando seu pagamento
          </h1>
          <p className="text-pretty text-muted-foreground">
            {/*
              Pix e cartão confirmam em segundos; boleto leva até três dias
              úteis. Dizer o prazo evita a segunda pergunta.
            */}
            Cartão e Pix costumam liberar em alguns segundos. Boleto leva até três
            dias úteis. Você recebe um e-mail assim que confirmar, e o acesso
            aparece sozinho.
          </p>
          <Button asChild size="lg" variant="outline">
            <Link href="/inicio">Voltar aos estudos</Link>
          </Button>
        </>
      ) : (
        <>
          <XCircle className="size-12 text-muted-foreground" aria-hidden />
          <h1 className="text-2xl font-bold text-foreground">Pagamento não concluído</h1>
          <p className="text-pretty text-muted-foreground">
            Nada foi cobrado. Sua conta continua no plano em que estava, e você
            pode tentar de novo quando quiser.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild size="lg">
              <Link href="/planos">Ver os planos</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/suporte">Falar com o suporte</Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
