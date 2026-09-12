"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { cancelSubscriptionAction, type CancelSubscriptionState } from "./subscription-actions";

const INICIAL: CancelSubscriptionState = { ok: false };

/**
 * "Cancelar assinatura", com um passo de confirmação.
 *
 * ⚠️ O PASSO DE CONFIRMAÇÃO DIZ O QUE ACONTECE, e não "tem certeza?". Quem
 * cancela quer saber duas coisas antes de apertar: até quando continua com o
 * plano e se vai ser cobrado de novo. As duas respostas estão no texto.
 */
export function CancelarAssinatura({
  planName,
  acessoAte,
}: {
  planName: string;
  /** "11 de outubro" — o fim do período já pago, formatado no servidor. */
  acessoAte: string | null;
}) {
  const [confirmando, setConfirmando] = useState(false);
  /* A ação não recebe nada: quem cancela é o aluno da sessão, lido no servidor. */
  const [estado, dispatch] = useActionState<CancelSubscriptionState>(
    () => cancelSubscriptionAction(),
    INICIAL,
  );
  const [pending, startTransition] = useTransition();

  if (estado.ok) {
    return (
      <p role="status" className="text-pretty text-sm text-foreground">
        Assinatura cancelada. {estado.message}
      </p>
    );
  }

  if (!confirmando) {
    return (
      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() => setConfirmando(true)}
      >
        Cancelar assinatura
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
      <p className="text-pretty text-sm text-foreground">
        Cancelar o {planName}?{" "}
        {acessoAte
          ? `Você continua com ele até ${acessoAte}, e depois volta para o plano Gratuito.`
          : "Você volta para o plano Gratuito agora."}{" "}
        O Mercado Pago não faz novas cobranças.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="destructive"
          disabled={pending}
          onClick={() => startTransition(() => dispatch())}
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Sim, cancelar
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => setConfirmando(false)}>
          Manter assinatura
        </Button>
      </div>

      {estado.message ? (
        <p role="status" className="text-pretty text-sm text-destructive">
          {estado.message}
        </p>
      ) : null}
    </div>
  );
}
