import { AlertCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import {
  NewPreparationForm,
  type ExamBoardOption,
} from "@/components/preparations/new-preparation-form";
import { Surface } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { checkPreparationLimit } from "@/server/preparations/service";

export const metadata: Metadata = { title: "Nova preparação" };

/**
 * Passo 1 do fluxo do "+" (README 1.4).
 *
 * O gate de plano é verificado ANTES de desenhar o formulário: deixar a pessoa
 * preencher tudo para só então descobrir que o plano não permite é o pior
 * momento possível para dar a notícia.
 */
export default async function NewPreparationPage() {
  const session = await requireUser("/preparacoes/nova");
  const gate = await checkPreparationLimit(session.user.id);

  if (!gate.allowed) {
    return <PlanLimitReached limit={gate.limit ?? 1} current={gate.current} />;
  }

  const boards = await db.query.examBoards.findMany({
    where: (t, { eq }) => eq(t.isActive, true),
    columns: { id: true, shortName: true, name: true },
    orderBy: (t, { asc }) => [asc(t.sortOrder), asc(t.shortName)],
  });

  return (
    <div className="mx-auto w-full max-w-lg py-2">
      <header className="mb-6">
        <p className="text-eyebrow">Passo 1 de 4</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Sua nova preparação</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          Só o essencial agora. No próximo passo você envia o edital e a IA faz o
          resto.
        </p>
      </header>

      <Surface className="p-5 sm:p-6">
        <NewPreparationForm examBoards={boards as ExamBoardOption[]} />
      </Surface>
    </div>
  );
}

function PlanLimitReached({ limit, current }: { limit: number; current: number }) {
  return (
    <div className="mx-auto w-full max-w-lg py-2">
      <Surface className="flex flex-col items-center gap-4 px-6 py-10 text-center">
        <span
          className="flex size-12 items-center justify-center rounded-xl border border-warning/40 bg-warning/10 text-warning"
          aria-hidden
        >
          <AlertCircle className="size-6" />
        </span>

        <h1 className="text-xl font-bold text-foreground">
          Você já tem {current === 1 ? "uma preparação" : `${current} preparações`}
        </h1>

        <p className="max-w-sm text-pretty text-muted-foreground">
          Seu plano permite {limit} preparação ativa por vez. Para estudar para mais de
          um concurso ao mesmo tempo, é preciso o plano Premium.
        </p>

        <p className="max-w-sm text-sm text-pretty text-muted-foreground">
          Se você terminou ou desistiu do concurso atual, pode encerrar aquela
          preparação e criar outra — nada do que você estudou é apagado.
        </p>

        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Button asChild>
            <Link href="/planos">Ver o Premium</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/preparacoes">Gerenciar minhas preparações</Link>
          </Button>
        </div>
      </Surface>
    </div>
  );
}
