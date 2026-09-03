import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MaterialForm } from "@/components/admin/material-form";
import { requireAdmin } from "@/server/auth/guards";
import { getMaterialForAdmin } from "@/server/admin/material-admin";
import { loadCatalog } from "@/server/taxonomy/mapping";

export const metadata: Metadata = { title: "Editar material" };

export const dynamic = "force-dynamic";

export default async function EditarMaterialPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [material, catalogo] = await Promise.all([getMaterialForAdmin(id), loadCatalog()]);

  if (!material) notFound();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header>
        <p className="text-eyebrow">
          <Link href="/admin/materiais" className="hover:text-foreground">
            Materiais
          </Link>{" "}
          › Editar
        </p>
        <h1 className="mt-2 text-2xl font-bold text-pretty text-foreground">
          {material.title}
        </h1>
      </header>

      {query.aviso === "criado" ? (
        <p
          role="status"
          className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-foreground"
        >
          Material cadastrado.
          {material.status !== "published"
            ? " Ele está como rascunho: mude a situação para Publicado quando quiser que os alunos vejam."
            : null}
        </p>
      ) : null}

      {material.externalUrl ? (
        <p className="text-sm text-muted-foreground">
          {/*
            Conferir o link antes de publicar é a única forma de saber que ele
            abre. `noopener` porque a página de destino não é nossa.
          */}
          <a
            href={material.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline underline-offset-4"
          >
            Abrir o material numa aba nova
          </a>{" "}
          para conferir o link.
        </p>
      ) : null}

      <MaterialForm
        material={material}
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
