import { ArrowLeft, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FlashcardDeck } from "@/components/content/flashcard-deck";
import { MarkComplete } from "@/components/content/mark-complete";
import { MindMapViewer } from "@/components/content/mind-map-viewer";
import { PdfViewer } from "@/components/content/pdf-viewer";
import { requireUser } from "@/server/auth/guards";
import { getMaterial, touchContentProgress } from "@/server/content/library";
import { signContentUrl } from "@/server/storage";

export const metadata: Metadata = { title: "Material" };

/**
 * O material é PDF, pelo endereço?
 *
 * A coluna `type` diz "resumo", que descreve o PAPEL do material e não o
 * formato do arquivo — e o acervo dela tem resumo em imagem e resumo em PDF. A
 * extensão do caminho é o que separa os dois. `?` corta a query da URL assinada,
 * que vem sempre com token no fim.
 */
function ehPdf(endereco: string | null): boolean {
  return /\.pdf(\?|$)/i.test(endereco ?? "");
}

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

    ⚠️ A FALHA DA ASSINATURA NÃO PODE DERRUBAR A PÁGINA.

    Este era o erro intermitente que a cliente reportou duas vezes:
    "em alguns momentos ele funciona normalmente e, em outros, apresenta o
    erro", e "apareceu também quando eu cliquei seguidamente em todas as
    tarefas das Missões do Dia".

    `signContentUrl` faz uma chamada HTTP ao Supabase e LANÇA em qualquer
    resposta que não seja 200 — arquivo removido do bucket, instabilidade de
    rede, ou o limite de requisições que vários cliques seguidos disparam ao
    mesmo tempo. Sem captura, isso derruba o Server Component inteiro e o aluno
    vê a tela de erro em vez do material.

    Falhar aqui devolve `null`, o corpo da página se adapta e o aviso abaixo
    explica o que houve. Perder o arquivo é ruim; perder a página inteira, com
    o botão de marcar como estudado e o caminho de volta, é pior.
  */
  let arquivo: string | null = material.externalUrl;
  let falhouAoAbrir = false;

  if (material.storagePath) {
    try {
      arquivo = await signContentUrl(material.storagePath);
    } catch (erro) {
      console.error("[estudos] falha ao assinar a URL do material", material.id, erro);
      arquivo = null;
      falhouAoAbrir = true;
    }
  }

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

          {/*
            ⚠️ O PDF ABRE DENTRO DA PÁGINA (pedido da cliente em 08/09/2026).

            Era um link com `target="_blank"`: o aluno saía da plataforma para
            uma aba do visualizador do navegador, sem menu, sem o botão de marcar
            como estudado e sem caminho de volta a não ser fechar a aba. Ver a
            nota em `PdfViewer` sobre o que o celular consegue e o que não.
          */}
          {material.type === "pdf" && arquivo ? (
            <PdfViewer src={arquivo} title={material.title} />
          ) : null}

          {/*
            "Resumo" pode ser imagem (a maioria do acervo dela) ou PDF. A
            extensão do caminho decide: um `<img>` com PDF dentro fica quebrado,
            e um `<object>` com PNG dentro abre uma caixa de download.
          */}
          {material.type === "study_text" && arquivo ? (
            ehPdf(material.storagePath ?? material.externalUrl) ? (
              <PdfViewer src={arquivo} title={material.title} />
            ) : (
              <MindMapViewer
                src={arquivo}
                alt={`Resumo: ${material.title}`}
                width={material.imageWidth}
                height={material.imageHeight}
              />
            )
          ) : null}

          {material.type === "audio" && arquivo ? (
            <audio src={arquivo} controls className="w-full" />
          ) : null}

          {/*
            O aviso aparece só quando a assinatura falhou. Um material sem
            arquivo nenhum cadastrado (baralho de flashcards, por exemplo) não
            passa por aqui.
          */}
          {falhouAoAbrir ? (
            <p
              role="status"
              className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-pretty text-foreground"
            >
              Não consegui carregar o arquivo agora. Atualize a página em alguns
              segundos. Se continuar, avise no Suporte que eu verifico.
            </p>
          ) : null}

          <MarkComplete contentItemId={material.id} alreadyDone={material.completed} />
        </>
      )}
    </div>
  );
}
