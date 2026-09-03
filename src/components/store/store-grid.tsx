"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/shared/surface";
import { cn } from "@/lib/utils";
import type { StoreItemView } from "@/server/engine/store";

import { redeemItemAction, type RedeemState } from "./redeem-actions";

/**
 * A vitrine.
 *
 * ⚠️ UM `useActionState` PARA A LOJA INTEIRA, não um por card.
 *
 * Com um por item, cada card viraria um componente de cliente com o próprio
 * estado, e a mensagem de "resgatado" apareceria dentro do card — no lugar onde
 * o aluno acabou de clicar e já não está olhando. Um estado só coloca a
 * confirmação no topo, junto do saldo, que é o número que ele quer conferir
 * depois de gastar.
 */
export function StoreGrid({
  items,
  balance,
}: {
  items: StoreItemView[];
  balance: number;
}) {
  const [state, formAction, pending] = useActionState<RedeemState, FormData>(
    redeemItemAction,
    { ok: false },
  );

  return (
    <div className="flex flex-col gap-4">
      {state.message ? (
        <p
          role="status"
          className={cn(
            "rounded-xl border px-4 py-3 text-sm text-pretty",
            state.ok
              ? "border-success/40 bg-success/10 text-foreground"
              : "border-warning/40 bg-warning/10 text-foreground",
          )}
        >
          {state.message}
        </p>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.id}>
            <Surface className="flex h-full min-w-0 flex-col gap-3 p-4">
              {/*
                ⚠️ `<img>` cru, e não `next/image`.

                O endereço é externo e cadastrado pela cliente (Drive, Canva, o
                que ela usar). `next/image` exigiria declarar cada domínio em
                `next.config` — e ela cadastraria um item novo hoje que só
                apareceria depois de um deploy meu.

                `onError` esconde a imagem quebrada em vez de deixar o ícone de
                falha do navegador no meio do card.
              */}
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.imageUrl}
                  alt=""
                  loading="lazy"
                  className="h-32 w-full rounded-lg border border-border object-cover"
                  onError={(evento) => {
                    evento.currentTarget.style.display = "none";
                  }}
                />
              ) : null}

              <div className="min-w-0 flex-1">
                <p className="text-pretty font-semibold text-foreground">{item.name}</p>
                {item.description ? (
                  <p className="mt-1 text-pretty text-sm text-muted-foreground">
                    {item.description}
                  </p>
                ) : null}
                {item.stock !== null ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.stock > 0
                      ? `${item.stock} ${item.stock === 1 ? "restante" : "restantes"}`
                      : "Esgotado"}
                  </p>
                ) : null}
              </div>

              <form action={formAction} className="flex items-center gap-3">
                <input type="hidden" name="storeItemId" value={item.id} />

                <span className="text-metric flex-1 text-sm text-primary">
                  {item.costCoins} moedas
                </span>

                <Button
                  type="submit"
                  size="sm"
                  variant={item.affordable ? "default" : "outline"}
                  disabled={pending || !item.affordable}
                >
                  {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                  {/*
                    O botão diz o que FALTA, não só "indisponível". Quem está a 30
                    moedas de um item tem um motivo para estudar amanhã; quem lê
                    "indisponível" só desiste.
                  */}
                  {item.stock === 0
                    ? "Esgotado"
                    : item.affordable
                      ? "Resgatar"
                      : `Faltam ${item.costCoins - balance}`}
                </Button>
              </form>
            </Surface>
          </li>
        ))}
      </ul>
    </div>
  );
}
