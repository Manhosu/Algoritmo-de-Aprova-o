import {
  BookOpen,
  Check,
  FileText,
  Headphones,
  Layers,
  Lock,
  Network,
  PlayCircle,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { MaterialCard } from "@/server/content/library";

/** Um ícone por tipo. O aluno reconhece o formato antes de ler o título. */
const ICONE: Record<MaterialCard["type"], ReactNode> = {
  mind_map: <Network />,
  flashcard_deck: <Layers />,
  video: <PlayCircle />,
  study_text: <BookOpen />,
  pdf: <FileText />,
  audio: <Headphones />,
};

const NOME_TIPO: Record<MaterialCard["type"], string> = {
  mind_map: "Mapa mental",
  flashcard_deck: "Flashcards",
  video: "Videoaula",
  study_text: "Resumo",
  pdf: "PDF",
  audio: "Áudio",
};

export function MaterialGrid({ items }: { items: MaterialCard[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-6 text-pretty text-sm text-muted-foreground">
        Nenhum material com esses filtros. Tente outro tipo ou outra disciplina.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <li key={item.id} className="min-w-0">
          <MaterialTile item={item} />
        </li>
      ))}
    </ul>
  );
}

function MaterialTile({ item }: { item: MaterialCard }) {
  /*
    ⚠️ O ITEM BLOQUEADO NÃO É UM LINK.

    Um `<a>` que leva a uma tela de "assine para ver" é uma promessa quebrada
    em dois passos. Pior: leitores de tela anunciariam "link, Mapa mental de
    Crase" para algo que não abre. Como <div>, ele é o que é — um cartão
    visível e indisponível, com o motivo escrito.
  */
  if (item.locked) {
    return (
      <div className="flex h-full flex-col gap-2 rounded-xl border border-border bg-card p-4 opacity-70">
        <Cabecalho item={item} bloqueado />
        <p className="mt-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5 shrink-0" aria-hidden />
          Disponível em planos com biblioteca completa
        </p>
      </div>
    );
  }

  return (
    <Link
      href={`/estudos/${item.id}`}
      className="lift neon-hover flex h-full flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Cabecalho item={item} />

      <p className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {item.inPlan ? (
          <span className="rounded-full border border-primary/40 px-2 py-0.5 text-primary">
            do seu edital
          </span>
        ) : null}

        {item.cardCount !== null ? (
          <span>
            {item.cardCount} {item.cardCount === 1 ? "cartão" : "cartões"}
          </span>
        ) : null}

        {item.durationSeconds ? <span>{minutos(item.durationSeconds)}</span> : null}

        {item.completed ? (
          <span className="flex items-center gap-1 text-success">
            <Check className="size-3.5 shrink-0" aria-hidden />
            concluído
          </span>
        ) : item.progressPercent > 0 ? (
          <span>{item.progressPercent}% lido</span>
        ) : null}
      </p>
    </Link>
  );
}

function Cabecalho({ item, bloqueado }: { item: MaterialCard; bloqueado?: boolean }) {
  return (
    <>
      <div className="flex items-start gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background/60 text-primary [&>svg]:size-4"
          aria-hidden
        >
          {bloqueado ? <Lock /> : ICONE[item.type]}
        </span>

        <span className="min-w-0">
          <span className="block text-xs text-muted-foreground">
            {NOME_TIPO[item.type]}
          </span>
          <span className="mt-0.5 block text-pretty font-semibold text-foreground">
            {item.title}
          </span>
        </span>
      </div>

      {item.topicName ?? item.subjectName ? (
        <p className="text-pretty text-xs text-muted-foreground">
          {item.topicName ?? item.subjectName}
        </p>
      ) : null}
    </>
  );
}

function minutos(segundos: number): string {
  const total = Math.round(segundos / 60);
  return total < 1 ? "menos de 1 min" : `${total} min`;
}
