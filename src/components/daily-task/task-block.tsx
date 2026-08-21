import { BookOpen, Check, ChevronRight, Lock, Target } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Surface } from "@/components/shared/surface";
import { practiceLink, studyLabel, studyLink, type LinkableTechnique } from "@/lib/deep-links";
import { cn } from "@/lib/utils";

/**
 * Um bloco da Tarefa do Dia.
 *
 * Formato definido pela cliente: estudo e prática emparelhados sobre o MESMO
 * assunto, e cada linha leva para o lugar certo ao ser clicada.
 *
 *     🧠 Estude: Flash Cards — Crase   → abre os flash cards de Crase
 *     🎯 Pratique: Questões — Crase    → abre o banco de questões, filtrado
 *
 * ⚠️ A quantidade de questões NÃO é exibida (decisão fechada): no plano Free o
 * teto diário é menor que a meta interna, e anunciar um número que o plano não
 * entrega seria prometer o que não se cumpre.
 */

export type TaskBlockItem = {
  status: "pending" | "in_progress" | "completed" | "skipped";
  closedByPlanLimit?: boolean;
};

export type TaskBlockProps = {
  topicName: string;
  subjectName: string;
  technique: LinkableTechnique | null;
  contentItemId?: string | null;
  topicSlug?: string | null;
  study: TaskBlockItem;
  /** Ausente quando o assunto não casou com o catálogo ou não há questão. */
  practice?: TaskBlockItem;
  reasonLabel?: string | null;
};

export function TaskBlock({
  topicName,
  subjectName,
  technique,
  contentItemId,
  topicSlug,
  study,
  practice,
  reasonLabel,
}: TaskBlockProps) {
  return (
    <Surface className="overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-2.5">
        <span className="truncate text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          {subjectName}
        </span>
        {reasonLabel ? (
          <span className="hidden truncate text-xs text-muted-foreground sm:block">
            {reasonLabel}
          </span>
        ) : null}
      </div>

      <ul className="divide-y divide-border">
        <li>
          <TaskRow
            icon={<BookOpen />}
            action="Estude"
            label={studyLabel(technique, topicName)}
            href={studyLink({ technique, contentItemId, topicSlug })}
            item={study}
          />
        </li>

        {practice ? (
          <li>
            <TaskRow
              icon={<Target />}
              action="Pratique"
              label={`Questões — ${topicName}`}
              href={practiceLink(topicSlug)}
              item={practice}
            />
          </li>
        ) : (
          <li className="flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground">
            <Target className="size-4 shrink-0" aria-hidden />
            {/* Honesto sobre o motivo, sem culpar o aluno nem soar quebrado. */}
            <span>Ainda não temos questões deste assunto no acervo.</span>
          </li>
        )}
      </ul>
    </Surface>
  );
}

function TaskRow({
  icon,
  action,
  label,
  href,
  item,
}: {
  icon: ReactNode;
  action: string;
  label: string;
  href: string | null;
  item: TaskBlockItem;
}) {
  const done = item.status === "completed";
  const closedByLimit = item.closedByPlanLimit === true;

  const content = (
    <>
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg border [&>svg]:size-4",
          done
            ? "border-success/40 bg-success/10 text-success"
            : "border-primary/40 bg-primary-soft text-primary",
        )}
        aria-hidden
      >
        {done ? <Check /> : icon}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {action}
        </span>
        <span
          className={cn(
            "block truncate text-sm",
            done ? "text-muted-foreground line-through" : "text-foreground",
          )}
        >
          {label}
        </span>
      </span>

      {closedByLimit ? (
        // Bater no limite do plano fecha o item como CUMPRIDO, não como
        // pendência. Quem estudou tudo que o plano permitia não pode ver
        // tarefa vermelha — e este é o momento de maior intenção de upgrade.
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Lock className="size-3.5" aria-hidden />
          Limite do dia
        </span>
      ) : href && !done ? (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : null}
    </>
  );

  const shared = "flex w-full items-center gap-3 px-4 py-3 text-left";

  // Sem rota implementada, o item aparece sem link em vez de levar a 404.
  if (!href || done) {
    return <div className={shared}>{content}</div>;
  }

  return (
    <Link
      href={href}
      className={cn(
        shared,
        "transition-colors hover:bg-accent/60",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:-outline-offset-2",
      )}
    >
      {content}
    </Link>
  );
}
