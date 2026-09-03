import type { Metadata } from "next";
import Link from "next/link";

import { MaterialForm } from "@/components/admin/material-form";
import { requireAdmin } from "@/server/auth/guards";
import { loadCatalog } from "@/server/taxonomy/mapping";

export const metadata: Metadata = { title: "Novo material" };

export const dynamic = "force-dynamic";

export default async function NovoMaterialPage() {
  await requireAdmin();
  const catalogo = await loadCatalog();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header>
        <p className="text-eyebrow">
          <Link href="/admin/materiais" className="hover:text-foreground">
            Materiais
          </Link>{" "}
          › Novo
        </p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Novo material</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          Salve como rascunho enquanto o conteúdo não está pronto. Rascunho não
          aparece para nenhum aluno.
        </p>
      </header>

      <MaterialForm
        subjects={catalogo.subjects.map((d) => ({ id: d.id, name: d.name }))}
        topics={catalogo.topics.flatMap((a) =>
          /* Assunto órfão não pertence a nenhuma disciplina, então nenhuma
             lista o mostraria. Fica de fora em vez de virar string vazia. */
          a.subjectId ? [{ id: a.id, name: a.name, subjectId: a.subjectId }] : [],
        )}
      />
    </div>
  );
}
