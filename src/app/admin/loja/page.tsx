import type { Metadata } from "next";

import { FulfillButton } from "@/components/admin/fulfill-button";
import { StoreForm } from "@/components/admin/store-form";
import { requireAdmin } from "@/server/auth/guards";
import { listStoreItemsForAdmin, pendingRedemptions } from "@/server/engine/store";

export const metadata: Metadata = { title: "Loja" };

export const dynamic = "force-dynamic";

/**
 * A loja pelo lado de quem entrega.
 *
 * ⚠️ OS RESGATES PENDENTES VÊM PRIMEIRO, antes do cadastro de itens.
 *
 * Cadastrar item é tarefa ocasional; entregar o que um aluno já resgatou é
 * dívida com prazo. Uma tela que abre no formulário faria a fila de entrega
 * ficar abaixo da dobra — e resgate esquecido é a forma mais rápida de a
 * gamificação virar promessa quebrada.
 */
export default async function AdminLojaPage() {
  await requireAdmin();

  const [itens, pendentes] = await Promise.all([
    listStoreItemsForAdmin(),
    pendingRedemptions(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <header>
        <p className="text-eyebrow">Administração</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Loja</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          O que os alunos podem trocar pelas moedas que ganham estudando, e o que
          já foi resgatado e ainda não foi entregue.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-foreground">
          Resgates aguardando entrega
        </h2>

        {pendentes.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            Nada pendente.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pendentes.map((resgate) => (
              <li
                key={resgate.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card px-4 py-3 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-pretty font-medium text-foreground">
                    {resgate.itemName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {resgate.studentName ?? "Conta anonimizada"}
                    {resgate.studentEmail ? ` · ${resgate.studentEmail}` : ""}
                  </span>
                </span>

                <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                  {resgate.redeemedAt.toLocaleDateString("pt-BR")}
                </span>

                <FulfillButton redemptionId={resgate.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-8">
        <h2 className="font-semibold text-foreground">Itens da loja</h2>

        {itens.length === 0 ? (
          <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-pretty text-foreground">
            A loja está vazia. Os alunos continuam acumulando moedas, e sem item
            nenhum elas não compram nada — uma promessa que fica em aberto.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {itens.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-border bg-card px-4 py-3 text-sm"
              >
                <span className="min-w-0 flex-1 text-pretty font-medium text-foreground">
                  {item.name}
                </span>
                <span className="text-metric shrink-0 text-primary">
                  {item.costCoins} moedas
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {item.stock === null ? "estoque ilimitado" : `${item.stock} em estoque`}
                </span>
                {!item.isActive ? (
                  <span className="shrink-0 text-xs text-muted-foreground">oculto</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-8">
        <div>
          <h2 className="font-semibold text-foreground">Cadastrar ou editar item</h2>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">
            Para editar um item, use o mesmo código dele. Salvar com um código
            existente atualiza aquele item.
          </p>
        </div>

        <StoreForm />
      </section>
    </div>
  );
}
