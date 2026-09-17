import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PlanContentForm } from "@/components/admin/plan-content-form";
import { getStudentProfile } from "@/server/admin/student-detail";
import { requireAdmin } from "@/server/auth/guards";
import { getPlanContent } from "@/server/preparations/content";

export const metadata: Metadata = { title: "Conteúdo do edital" };

export const dynamic = "force-dynamic";

/**
 * O CONTEÚDO DO EDITAL DE UM ALUNO, EDITÁVEL PELA CLIENTE.
 *
 * Pedido de 17/09/2026: a leitura do edital deixou uma parte de fora, o aluno
 * confirmou sem corrigir, e o cronograma dele nasceu incompleto.
 *
 * ⚠️ DADO PESSOAL DE OUTRA PESSOA. A rota é `requireAdmin`, como a ficha.
 */
export default async function AdminConteudoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const perfil = await getStudentProfile(id);
  if (!perfil?.preparation) notFound();

  const conteudo = await getPlanContent(perfil.preparation.id, perfil.id, { asAdmin: true });
  if (!conteudo) notFound();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <Link
        href={`/admin/alunos/${id}`}
        className="flex items-center gap-1.5 self-start text-sm text-primary underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Voltar para o aluno
      </Link>

      <header>
        <p className="text-eyebrow">Conteúdo do edital</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">
          {perfil.name ?? "Conta anonimizada"}
        </h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          {conteudo.targetPosition}. O que estiver marcado como &ldquo;no plano&rdquo; entra no
          cronograma e na Tarefa do Dia. Assunto acrescentado aqui aparece para o
          aluno na próxima vez que ele abrir o cronograma.
        </p>
      </header>

      <PlanContentForm content={conteudo} alunoId={id} />
    </div>
  );
}
