import { Coins, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { StoreGrid } from "@/components/store/store-grid";
import { EmptyState, Surface } from "@/components/shared/surface";
import { LOGIN_ROUTE } from "@/config/routes";
import { getStudentContext } from "@/server/auth/current-user";
import { getStore } from "@/server/engine/store";

export const metadata: Metadata = {
  title: "Loja",
  description: "Troque as moedas que você ganhou estudando.",
};

const STATUS = {
  pending: "Aguardando entrega",
  fulfilled: "Entregue",
  canceled: "Cancelado",
} as const;

/**
 * LOJA (README 2.3) — as moedas acumuladas viram alguma coisa.
 *
 * ⚠️ NÃO EXIGE PREPARAÇÃO ATIVA, diferente das outras telas do Marco 2.
 *
 * Moeda se ganha por atividade, e atividade existe antes de o edital estar
 * montado. Barrar a loja atrás do onboarding esconderia o saldo justamente de
 * quem acabou de ganhar as primeiras moedas — que é quando a recompensa
 * significa mais.
 */
export const dynamic = "force-dynamic";

export default async function LojaPage() {
  const context = await getStudentContext();
  if (!context) redirect(LOGIN_ROUTE);

  const loja = await getStore(context.user.id);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <ShoppingBag className="size-5 shrink-0 text-primary" aria-hidden />
          Loja
        </h1>
        <p className="mt-2 text-pretty text-sm text-muted-foreground">
          As moedas vêm do estudo: tarefas concluídas, revisões em dia e
          conquistas.
        </p>
      </header>

      <Surface className="flex items-center gap-3 p-5">
        <Coins className="size-6 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs tracking-wider text-muted-foreground uppercase">
            Seu saldo
          </p>
          <p className="text-metric text-2xl text-foreground">{loja.balance}</p>
        </div>
      </Surface>

      {loja.items.length === 0 ? (
        <EmptyState
          title="A loja ainda está sendo montada"
          description="Suas moedas continuam acumulando. Assim que houver itens, eles aparecem aqui."
        />
      ) : (
        <StoreGrid items={loja.items} balance={loja.balance} />
      )}

      {loja.history.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold tracking-[0.12em] text-foreground uppercase">
            Seus resgates
          </h2>

          <ul className="flex flex-col gap-2">
            {loja.history.map((resgate) => (
              <li
                key={resgate.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-border bg-card px-4 py-3 text-sm"
              >
                <span className="min-w-0 flex-1 text-pretty text-foreground">
                  {resgate.itemName}
                </span>
                <span className="text-metric shrink-0 text-muted-foreground">
                  {resgate.costCoins}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {STATUS[resgate.status]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
