import { FileUp, Plus, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PreparationCard } from "@/components/preparations/preparation-card";
import { EmptyState, Surface } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import { LOGIN_ROUTE } from "@/config/routes";
import { getStudentContext } from "@/server/auth/current-user";
import { listPreparations } from "@/server/preparations/manage";
import { checkPreparationLimit } from "@/server/preparations/service";

export const metadata: Metadata = { title: "Minhas preparações" };

/**
 * GESTÃO DA PREPARAÇÃO (README 1.10): trocar, editar e encerrar.
 *
 * A tela também é onde o gate de plano fica VISÍVEL. No plano Free o limite é
 * uma preparação ativa — dizer isso aqui, com o número, é diferente de deixar o
 * aluno descobrir no meio do fluxo de criação.
 */
export default async function PreparationsPage() {
  const context = await getStudentContext();
  if (!context) redirect(LOGIN_ROUTE);

  const [items, gate] = await Promise.all([
    listPreparations(context.user.id),
    checkPreparationLimit(context.user.id),
  ]);

  const active = items.filter((item) => item.status !== "archived");
  const archived = items.filter((item) => item.status === "archived");

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 py-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Minhas preparações</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {gate.limit === null
              ? "Seu plano permite quantas preparações você quiser."
              : `Seu plano permite ${gate.limit} ${gate.limit === 1 ? "preparação ativa" : "preparações ativas"}. Você tem ${gate.current}.`}
          </p>
        </div>

        {gate.allowed ? (
          <Button asChild size="sm" className="shrink-0">
            <Link href="/preparacoes/nova" aria-label="Nova preparação">
              <Plus aria-hidden />
              Nova
            </Link>
          </Button>
        ) : null}
      </header>

      {items.length === 0 ? (
        <Surface glow>
          <EmptyState
            icon={<FileUp />}
            title="Você ainda não tem preparação"
            description="Suba o PDF do concurso que você vai fazer. A partir dele o sistema monta seu plano de estudo."
            action={
              <Button asChild size="lg" className="mt-2">
                <Link href="/preparacoes/nova">Criar minha preparação</Link>
              </Button>
            }
          />
        </Surface>
      ) : (
        <ul className="flex flex-col gap-3">
          {active.map((item) => (
            <PreparationCard key={item.id} preparation={item} canReopen={gate.allowed} />
          ))}
        </ul>
      )}

      {archived.length > 0 ? (
        <>
          <h2 className="mt-2 text-sm font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Encerradas
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">
            O conteúdo e o histórico continuam guardados. Reabrir depende de ter vaga no
            seu plano.
          </p>
          <ul className="flex flex-col gap-3">
            {archived.map((item) => (
              <PreparationCard key={item.id} preparation={item} canReopen={gate.allowed} />
            ))}
          </ul>
        </>
      ) : null}

      {!gate.allowed && archived.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface/40 px-4 py-3 text-sm text-pretty text-muted-foreground">
          Para estudar para mais de um concurso ao mesmo tempo, é preciso o plano
          Premium — ou encerrar a preparação atual, que libera a vaga sem apagar nada.
        </p>
      ) : null}

      {/*
        O caminho para os planos, aqui (pedido da cliente em 27/08/2026).
        
        Esta é a tela onde o aluno esbarra no limite do plano — e era também a
        única sem saída para resolvê-lo. Ele lia "seu plano permite 1
        preparação" e tinha de procurar Planos por conta própria.
        
        ⚠️ Só aparece para quem NÃO tem plano ilimitado. Oferecer upgrade a
        quem já está no topo é ruído.
      */}
      {gate.limit !== null ? (
        <Button asChild size="lg" variant="outline" className="mt-2 border-primary/50">
          <Link href="/planos">
            <Sparkles aria-hidden />
            Mudar de plano agora
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
