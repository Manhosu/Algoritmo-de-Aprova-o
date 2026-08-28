import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ExamDetailsForm } from "@/components/preparations/exam-details-form";
import type { ExamBoardOption } from "@/components/preparations/new-preparation-form";
import { LOGIN_ROUTE } from "@/config/routes";
import { getStudentContext } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { listSelectableBoards } from "@/server/preparations/boards";

export const metadata: Metadata = { title: "Dados da prova" };

/**
 * Editar cargo, órgão, banca e data depois da preparação criada.
 *
 * POR QUE ESTA TELA EXISTE
 * ----------------------------------------------------------------------------
 * Esses quatro campos eram preenchidos uma vez, no passo 1, e nunca mais. A
 * cliente marcou "ainda não sei a data", o sistema projetou o cronograma para
 * uma data estimada e ela ficou presa a ela — sem caminho para corrigir depois
 * de a banca publicar a data real.
 *
 * A data da prova é o sinal de URGÊNCIA do Motor 1. Errada, ela distorce a
 * priorização de todos os dias seguintes — e é justamente o campo que o aluno
 * tem menos condição de acertar no começo, quando o edital ainda nem saiu.
 */
export default async function ExamDetailsPage({
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
    columns: {
      id: true,
      targetPosition: true,
      institution: true,
      examBoardId: true,
      examDate: true,
      examDateIsEstimated: true,
    },
  });

  if (!preparation) notFound();

  const boards = await listSelectableBoards();

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 py-4">
      <header>
        <Link
          href="/preparacoes"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Minhas preparações
        </Link>
        <h1 className="mt-2 text-xl font-bold text-foreground">Dados da prova</h1>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          Cargo, órgão, banca e data. Mudar a data faz o cronograma se refazer na
          hora — o conteúdo que você já revisou continua onde está.
        </p>
      </header>

      <ExamDetailsForm
        preparationId={preparation.id}
        examBoards={boards as ExamBoardOption[]}
        initial={{
          cargo: preparation.targetPosition,
          orgao: preparation.institution ?? "",
          banca: preparation.examBoardId ?? "",
          dataProva: preparation.examDate ?? "",
          estimada: preparation.examDateIsEstimated,
        }}
      />
    </div>
  );
}
