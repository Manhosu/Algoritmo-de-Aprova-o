"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { subscribeAction, type SubscribeState } from "./subscribe-actions";

const INICIAL: SubscribeState = { ok: false };

/**
 * "Assinar" — leva ao checkout do Mercado Pago.
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
  variant = "default",
  className,
}: {
  planCode: string;
  billingPeriod: "monthly" | "annual";
  label: string;
  variant?: "default" | "outline";
  className?: string;
}) {
  const [estado, dispatch] = useActionState(subscribeAction, INICIAL);
  const [pending, startTransition] = useTransition();

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    startTransition(() => dispatch(dados));
  }

  return (
    <form onSubmit={enviar} className={className}>
      <input type="hidden" name="planCode" value={planCode} />
      <input type="hidden" name="billingPeriod" value={billingPeriod} />

      <Button type="submit" size="lg" variant={variant} disabled={pending} className="w-full">
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {pending ? "Abrindo pagamento…" : label}
      </Button>

      {estado.message ? (
        <p role="status" className="mt-2 text-sm text-destructive">
          {estado.message}
        </p>
      ) : null}
    </form>
  );
}
