import { ArrowLeft, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FlashcardDeck } from "@/components/content/flashcard-deck";
import { MarkComplete } from "@/components/content/mark-complete";
import { MindMapViewer } from "@/components/content/mind-map-viewer";
import { requireUser } from "@/server/auth/guards";
import { getMaterial, touchContentProgress } from "@/server/content/library";
import { signContentUrl } from "@/server/storage";

export const metadata: Metadata = { title: "Material" };

export const dynamic = "force-dynamic";

/**
 * Um material aberto.
 *
 * ⚠️ ABRIR JÁ CONTA COMO PROGRESSO, mas só como "em andamento".
 *
 * Marcar concluído na abertura inflaria o progresso do aluno com material que
 * ele só espiou — e o progresso é insumo do Motor 1. "Concluído" continua
 * sendo um ato dele, no botão.
 */
export default async function MaterialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireUser();

  const material = await getMaterial({ userId: session.user.id, contentItemId: id });
  if (!material) notFound();

  if (!material.locked) {
    await touchContentProgress({ userId: session.user.id, contentItemId: id });
  }

  /*
    A URL assinada é gerada no servidor e expira. O caminho no bucket nunca
    chega ao navegador — quem tiver o HTML não consegue montar um endereço
    permanente para o arquivo.
  */
  const arquivo = material.storagePath
    ? await signContentUrl(material.storagePath)
    : material.externalUrl;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 pb-bottom-nav">
      <Link
        href="/estudos"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4 shrink-0" aria-hidden />
        Estudos
      </Link>

      <header>
        {material.subjectName ? (
          <p className="text-eyebrow">{material.subjectName}</p>
        ) : null}
        <h1 className="mt-2 text-pretty text-2xl font-bold text-foreground">
          {material.title}
        </h1>
        {material.topicName ? (
          <p className="mt-1 text-pretty text-sm text-muted-foreground">
            {material.topicName}
          </p>
        ) : null}
        {material.description ? (
          <p className="mt-3 text-pretty text-muted-foreground">{material.description}</p>
        ) : null}
      </header>

      {material.locked ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
          <Lock className="size-5 text-primary" aria-hidden />
          <p className="text-pretty text-muted-foreground">
            Este material faz parte dos planos com biblioteca completa.
          </p>
          <Link
            href="/planos"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Ver planos
          </Link>
        </div>
      ) : (
        <>
          {material.type === "mind_map" && arquivo ? (
            <MindMapViewer
              src={arquivo}
              alt={`Mapa mental: ${material.title}`}
              width={material.imageWidth}
              height={material.imageHeight}
            />
          ) : null}

          {material.type === "flashcard_deck" ? (
            <FlashcardDeck cards={material.cards} />
          ) : null}

          {material.type === "video" && arquivo ? (
            <div className="overflow-hidden rounded-xl border border-border bg-black">
              <video src={arquivo} controls playsInline className="w-full" />
            </div>
          ) : null}

          {(material.type === "pdf" || material.type === "study_text") && arquivo ? (
            <a
              href={arquivo}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center rounded-xl border border-border bg-card p-6 text-primary underline-offset-4 hover:underline"
            >
              Abrir material
            </a>
          ) : null}

          {material.type === "audio" && arquivo ? (
            <audio src={arquivo} controls className="w-full" />
          ) : null}

          <MarkComplete contentItemId={material.id} />
        </>
      )}
    </div>
  );
}
