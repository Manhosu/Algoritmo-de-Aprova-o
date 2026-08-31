import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ManualPlanForm } from "@/components/preparations/manual-plan-form";
import { LOGIN_ROUTE } from "@/config/routes";
import { getStudentContext } from "@/server/auth/current-user";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Cadastrar o edital à mão" };

/**
 * A saída de quem a leitura automática não atendeu.
 *
 * A IA falha numa minoria de editais — PDF escaneado sem camada de texto,
 * arquivo grande demais, anexo com estrutura fora do comum. Até aqui o aluno
 * nessa situação tinha um caminho só: tentar de novo o mesmo arquivo, que ia
 * falhar de novo. A cliente pediu esta tela, e ela é a diferença entre um aluno
 * que usa o produto e um que desiste na primeira tela.
 *
 * ⚠️ O conteúdo digitado passa pelo MESMO casamento com o catálogo da leitura
 * automática. Quem digita "Crase" recebe as mesmas questões de quem subiu um
 * edital que diz "Crase".
 */
export const dynamic = "force-dynamic";

export default async function ManualPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getStudentContext();
  if (!context) redirect(LOGIN_ROUTE);

  const preparation = await db.query.preparations.findFirst({
    where: (t, { and, eq, isNull }) =>
      and(eq(t.id, id), eq(t.userId, context.user.id), isNull(t.deletedAt)),
    columns: { id: true, title: true, status: true },
  });

  if (!preparation) notFound();
  if (preparation.status === "archived") redirect("/preparacoes");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 py-4">
      <header>
        <Link
          href={`/preparacoes/${preparation.id}/edital`}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Voltar para o envio do edital
        </Link>

        <h1 className="mt-2 text-xl font-bold text-foreground">
          Cadastrar o edital à mão
        </h1>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          Digite as disciplinas e os assuntos do seu edital. É o mesmo plano que
          a leitura automática montaria — o algoritmo trabalha igual, e as
          questões do acervo continuam ligadas aos assuntos que reconhecermos.
        </p>
        <p className="mt-2 text-sm text-pretty text-muted-foreground">
          Você pode corrigir tudo depois, a qualquer momento.
        </p>
      </header>

      <ManualPlanForm preparationId={preparation.id} />
    </div>
  );
}
