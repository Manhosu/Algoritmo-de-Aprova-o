import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { QuestionForm } from "@/components/admin/question-form";
import { requireAdmin } from "@/server/auth/guards";
import { getQuestionForAdmin } from "@/server/admin/question-admin";

export const metadata: Metadata = { title: "Editar questão" };

export const dynamic = "force-dynamic";

/**
 * Uma questão aberta para correção (pedido de 02/09/2026).
 *
 * ⚠️ MOSTRA O DESEMPENHO REAL DA QUESTÃO no topo.
 *
 * "312 respostas, 19% de acerto" é o sinal mais forte de que algo está errado
 * com a questão em si — gabarito trocado, enunciado ambíguo, alternativa
 * duplicada. Quem revisa precisa dessa informação antes de ler o texto, não
 * depois.
 */
export default async function EditarQuestaoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const questao = await getQuestionForAdmin(id);

  if (!questao) notFound();

  const acerto =
    questao.attemptCount > 0
      ? Math.round((questao.correctCount / questao.attemptCount) * 100)
      : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header>
        <p className="text-eyebrow">
          <Link href="/admin/questoes/acervo" className="hover:text-foreground">
            Acervo
          </Link>{" "}
          › Editar
        </p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Editar questão</h1>

        <p className="mt-2 text-sm text-muted-foreground">
          {questao.attemptCount === 0
            ? "Ainda não foi respondida por ninguém."
            : `${questao.attemptCount} ${questao.attemptCount === 1 ? "resposta" : "respostas"}, ${acerto}% de acerto.`}
          {/*
            Abaixo de 25% num múltipla escolha de 4 alternativas, o acaso acerta
            mais que os alunos. Quase sempre é gabarito trocado.
          */}
          {acerto !== null && acerto < 25 && questao.attemptCount >= 10 ? (
            <span className="ml-1 font-medium text-warning">
              Acerto abaixo do acaso. Confira o gabarito.
            </span>
          ) : null}
        </p>
      </header>

      <QuestionForm
        question={questao}
        hasAttempts={questao.attemptCount > 0}
      />
    </div>
  );
}
