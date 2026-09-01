"use client";

import { Check, Loader2 } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { fulfillRedemptionAction, type StoreFormState } from "./store-actions";

/**
 * "Entreguei" — um por linha de resgate.
 *
 * ⚠️ Cada botão tem o PRÓPRIO `useActionState`, ao contrário da vitrine do
 * aluno, que usa um só para a loja inteira.
 *
 * A diferença é onde a resposta precisa aparecer. Na vitrine, a confirmação vai
 * para o topo, junto do saldo. Aqui, quem entrega percorre uma fila marcando
 * item por item e precisa ver o resultado NA LINHA que acabou de marcar — com
 * um estado compartilhado, marcar o quinto resgate apagaria a confirmação do
 * quarto e nada diria qual dos dois foi.
 */
export function FulfillButton({ redemptionId }: { redemptionId: string }) {
  const [state, formAction, pending] = useActionState<StoreFormState, FormData>(
    fulfillRedemptionAction,
    { ok: false },
  );

  if (state.ok) {
    return (
      <span
        role="status"
        className="flex shrink-0 items-center gap-1 text-xs text-success"
      >
        <Check className="size-3.5" aria-hidden />
        Entregue
      </span>
    );
  }

  return (
    <form action={formAction} className="shrink-0">
      <input type="hidden" name="redemptionId" value={redemptionId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Entreguei
      </Button>
      {state.message ? (
        <span role="status" className="ml-2 text-xs text-destructive">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
