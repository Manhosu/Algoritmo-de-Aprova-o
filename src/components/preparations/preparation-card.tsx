"use client";

import { Archive, Check, Loader2, Pencil, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PreparationSummary } from "@/server/preparations/manage";

import {
  archivePreparationAction,
  renamePreparationAction,
  reopenPreparationAction,
  switchPreparationAction,
} from "./manage-actions";

/**
 * Um cartão de preparação, com trocar, renomear e encerrar (README 1.10).
 *
 * O card da preparação ATUAL não oferece "usar esta" — o botão estaria ali só
 * para não fazer nada. E o encerrar pede confirmação inline: é a ação que para
 * a Tarefa do Dia e cancela as revisões, e um toque acidental na lista custaria
 * caro.
 */

const STATUS_LABEL: Record<string, string> = {
  draft: "Falta o edital",
  extracting: "Lendo o edital",
  review_pending: "Aguardando sua revisão",
  diagnosis_pending: "Falta o diagnóstico",
  active: "Em andamento",
  failed: "A leitura falhou",
  archived: "Encerrada",
};

export function PreparationCard({
  preparation,
  canReopen,
}: {
  preparation: PreparationSummary;
  /** Falso quando o plano já está no limite de preparações ativas. */
  canReopen: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(preparation.title);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const archived = preparation.status === "archived";

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message ?? "Não conseguimos concluir. Tente de novo.");
        return;
      }
      setEditing(false);
      setConfirmArchive(false);
      router.refresh();
    });
  }

  const progress =
    preparation.topicCount === 0
      ? 0
      : Math.round((preparation.studiedCount / preparation.topicCount) * 100);

  return (
    <li
      className={cn(
        "rounded-2xl border bg-card p-4",
        preparation.isCurrent ? "border-primary/50 glow-ring" : "border-border",
        archived && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                aria-label="Nome da preparação"
                autoFocus
                className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-input px-3 text-sm text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
              <button
                type="button"
                onClick={() => run(() => renamePreparationAction(preparation.id, title))}
                disabled={pending}
                aria-label="Salvar nome"
                className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/50 text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Check className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => {
                  setTitle(preparation.title);
                  setEditing(false);
                }}
                aria-label="Cancelar"
                className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold text-pretty text-foreground">
                {preparation.title}
              </p>
              {preparation.institution ? (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {preparation.institution}
                </p>
              ) : null}
            </>
          )}
        </div>

        {!editing ? (
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold tracking-wider uppercase",
              preparation.isCurrent
                ? "border-primary/50 bg-primary-soft text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            {preparation.isCurrent ? "Atual" : (STATUS_LABEL[preparation.status] ?? preparation.status)}
          </span>
        ) : null}
      </div>

      {preparation.topicCount > 0 ? (
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-xs text-muted-foreground">
            <span>
              {preparation.studiedCount} de {preparation.topicCount} assuntos estudados
            </span>
            <span className="text-metric">{progress}%</span>
          </div>
          <span
            className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-secondary"
            aria-hidden
          >
            <span
              className="block h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </span>
        </div>
      ) : null}

      {preparation.examDate ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Prova em {formatDate(preparation.examDate)}
          {preparation.examDateIsEstimated ? " (estimada)" : ""}
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-pretty text-foreground">
          {error}
        </p>
      ) : null}

      {confirmArchive ? (
        <div className="mt-3 rounded-xl border border-warning/40 bg-warning/10 p-3">
          <p className="text-sm text-pretty text-muted-foreground">
            Encerrar para de gerar Tarefa do Dia e cancela as revisões pendentes desta
            preparação. O conteúdo e o histórico ficam guardados, e você pode reabrir
            depois.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setConfirmArchive(false)}
            >
              Não
            </Button>
            <Button
              size="sm"
              className="flex-1"
              disabled={pending}
              onClick={() => run(() => archivePreparationAction(preparation.id))}
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : "Encerrar"}
            </Button>
          </div>
        </div>
      ) : !editing ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {archived ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending || !canReopen}
              title={canReopen ? undefined : "Seu plano já está no limite de preparações ativas."}
              onClick={() => run(() => reopenPreparationAction(preparation.id))}
            >
              <RotateCcw aria-hidden />
              Reabrir
            </Button>
          ) : (
            <>
              {!preparation.isCurrent ? (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => switchPreparationAction(preparation.id))}
                >
                  {pending ? <Loader2 className="animate-spin" aria-hidden /> : "Usar esta"}
                </Button>
              ) : null}

              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil aria-hidden />
                Renomear
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmArchive(true)}
              >
                <Archive aria-hidden />
                Encerrar
              </Button>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}
