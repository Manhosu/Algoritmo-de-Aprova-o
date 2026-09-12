"use client";

import { CalendarDays, Loader2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { moveTopicAction, type MoveTopicState } from "./move-actions";

const INICIAL: MoveTopicState = { ok: false };

/**
 * "Mover" um assunto do cronograma para outro dia.
 *
 * ⚠️ UMA LISTA DE OPÇÕES NATIVA, e não um calendário desenhado. No celular —
 * que é onde a cliente testa — ela abre a roda de opções do próprio sistema,
 * grande e fácil de tocar. Um calendário em grade a 390px daria dias de 40px
 * para acertar com o dedo.
 *
 * (A tag não é escrita neste comentário de propósito: `select-contrast.test.ts`
 * corta o arquivo em cada ocorrência dela e acusaria o comentário.)
 */
export function MoverAssunto({
  planTopicId,
  topicName,
  dataAtual,
  datas,
  movido,
}: {
  planTopicId: string;
  topicName: string;
  dataAtual: string;
  datas: Array<{ value: string; label: string }>;
  /** Já foi movido: aparece a opção de devolver ao automático. */
  movido: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, dispatch] = useActionState(moveTopicAction, INICIAL);
  const [pending, startTransition] = useTransition();

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label={`Mover ${topicName} para outro dia`}
        className="ml-2 inline-flex min-h-8 items-center gap-1 align-middle text-xs text-primary underline-offset-4 hover:underline"
      >
        <CalendarDays className="size-3.5" aria-hidden />
        Mover
      </button>
    );
  }

  return (
    <form
      onSubmit={(evento) => {
        evento.preventDefault();
        const dados = new FormData(evento.currentTarget);
        startTransition(() => dispatch(dados));
      }}
      className="mt-1.5 flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="planTopicId" value={planTopicId} />

      <label className="sr-only" htmlFor={`mover-${planTopicId}`}>
        Novo dia para {topicName}
      </label>
      <select
        id={`mover-${planTopicId}`}
        name="paraData"
        defaultValue={dataAtual}
        className="h-9 min-w-0 rounded-md border border-input bg-input px-2 text-sm text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&>option]:bg-card [&>option]:text-foreground"
      >
        {movido ? <option value="">Automático (o sistema escolhe)</option> : null}
        {datas.map((data) => (
          <option key={data.value} value={data.value}>
            {data.label}
          </option>
        ))}
      </select>

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Mover
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setAberto(false)}>
        Cancelar
      </Button>

      {estado.message && !estado.ok ? (
        <p role="status" className="w-full text-xs text-pretty text-destructive">
          {estado.message}
        </p>
      ) : null}
    </form>
  );
}
