"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { CardCheckout } from "./card-checkout";
import { subscribeAction, type SubscribeState } from "./subscribe-actions";

const INICIAL: SubscribeState = { ok: false };

/**
 * "Assinar".
 *
 * Com a chave pública do Mercado Pago, o clique abre o formulário de cartão
 * aqui mesmo — ver a nota em `CardCheckout`. O checkout do Mercado Pago
 * continua como segunda opção, para quem prefere pagar com a conta de lá.
 *
 * ⚠️ O BOTÃO FICA DESABILITADO ENQUANTO A AÇÃO CORRE, e não é enfeite.
 *
 * Criar a assinatura no Mercado Pago leva um segundo ou dois. Sem o bloqueio,
 * dois cliques criam duas linhas em `subscriptions` e dois checkouts — e o aluno
 * pode acabar pagando os dois. A chave de idempotência cobre a retentativa da
 * mesma requisição; o clique duplo é uma requisição nova, e quem barra é isto.
 */
export function SubscribeButton({
  planCode,
  billingPeriod,
  label,
  valor,
  chavePublica,
  variant = "default",
  className,
}: {
  planCode: string;
  billingPeriod: "monthly" | "annual";
  label: string;
  valor: string;
  chavePublica: string | null;
  variant?: "default" | "outline";
  className?: string;
}) {
  const [estado, dispatch] = useActionState(subscribeAction, INICIAL);
  const [pending, startTransition] = useTransition();
  const [comCartao, setComCartao] = useState(false);

  function irAoMercadoPago(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    startTransition(() => dispatch(dados));
  }

  const checkoutDeles = (
    <form onSubmit={irAoMercadoPago}>
      <input type="hidden" name="planCode" value={planCode} />
      <input type="hidden" name="billingPeriod" value={billingPeriod} />

      {chavePublica ? (
        <button
          type="submit"
          disabled={pending}
          className="mt-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-60"
        >
          {pending ? "Abrindo o Mercado Pago…" : "Prefiro pagar com a minha conta do Mercado Pago"}
        </button>
      ) : (
        <Button type="submit" size="lg" variant={variant} disabled={pending} className="w-full">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? "Abrindo pagamento…" : label}
        </Button>
      )}

      {estado.message ? (
        <p role="status" className="mt-2 text-sm text-destructive">
          {estado.message}
        </p>
      ) : null}
    </form>
  );

  if (!chavePublica) return <div className={className}>{checkoutDeles}</div>;

  return (
    <div className={className}>
      {comCartao ? (
        <>
          <CardCheckout
            chavePublica={chavePublica}
            planCode={planCode}
            billingPeriod={billingPeriod}
            valor={valor}
            onCancelar={() => setComCartao(false)}
          />
          {checkoutDeles}
        </>
      ) : (
        <Button
          type="button"
          size="lg"
          variant={variant}
          className="w-full"
          onClick={() => setComCartao(true)}
        >
          {label}
        </Button>
      )}
    </div>
  );
}
