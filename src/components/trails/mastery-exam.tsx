"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MasteryQuestion } from "@/server/engine/mastery";

import { gradeMasteryAction, type MasteryState } from "./mastery-actions";

const INICIAL: MasteryState = { done: false };

/**
 * A PROVA DE DOMÍNIO, uma questão por vez.
 *
 * ⚠️ SEM CORREÇÃO ENTRE AS QUESTÕES, e é o que a distingue do Banco.
 *
 * No Banco, o aluno responde e vê na hora se acertou, com o comentário. Aqui é
 * uma prova: dizer "errou" na terceira mudaria a forma de responder as outras
 * dezessete, e o resultado deixaria de medir domínio para medir reação.
 *
 * ⚠️ AS RESPOSTAS FICAM NO CLIENTE ATÉ O ENVIO.
 *
 * Uma escrita por questão seriam vinte idas ao servidor no meio de uma prova,
 * num pool com teto de 15 conexões. E a correção acontece toda no servidor de
 * qualquer forma — o navegador não sabe nenhum gabarito.
 */
export function MasteryExam({
  planTopicId,
  topicName,
  questions,
}: {
  planTopicId: string;
  topicName: string;
  questions: MasteryQuestion[];
}) {
  const [estado, dispatch] = useActionState(gradeMasteryAction, INICIAL);
  const [enviando, startTransition] = useTransition();

  const [indice, setIndice] = useState(0);
  const [respostas, setRespostas] = useState<Record<string, string>>({});

  const respondidas = Object.keys(respostas).length;
  const atual = questions[indice];
  const ultima = indice === questions.length - 1;

  const payload = useMemo(
    () =>
      JSON.stringify(
        Object.entries(respostas).map(([questionId, optionId]) => ({
          questionId,
          optionId,
        })),
      ),
    [respostas],
  );

  if (estado.done) {
    return <Resultado estado={estado} topicName={topicName} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Questão {indice + 1} de {questions.length}
        </p>
        <p className="text-sm text-muted-foreground">
          {respondidas} respondida{respondidas === 1 ? "" : "s"}
        </p>
      </div>

      {/* Barra de progresso da prova, sem informar acerto nenhum. */}
      <span className="h-1.5 w-full overflow-hidden rounded-full bg-secondary" aria-hidden>
        <span
          className="block h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${(respondidas / questions.length) * 100}%` }}
        />
      </span>

      <p className="text-pretty text-foreground">{atual.statement}</p>

      <ul className="flex flex-col gap-2">
        {atual.options.map((alternativa) => {
          const escolhida = respostas[atual.id] === alternativa.id;

          return (
            <li key={alternativa.id}>
              <button
                type="button"
                onClick={() =>
                  setRespostas((antes) => ({ ...antes, [atual.id]: alternativa.id }))
                }
                aria-pressed={escolhida}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors",
                  escolhida
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card text-foreground hover:border-primary/40",
                )}
              >
                <span className="shrink-0 font-semibold">{alternativa.label}</span>
                <span className="min-w-0 text-pretty">{alternativa.content}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={indice === 0}
          onClick={() => setIndice((i) => Math.max(0, i - 1))}
        >
          Anterior
        </Button>

        {!ultima ? (
          <Button
            type="button"
            onClick={() => setIndice((i) => Math.min(questions.length - 1, i + 1))}
          >
            Próxima
          </Button>
        ) : null}

        {/*
          O envio aparece quando TODAS estão respondidas, e não só na última.
          O aluno pode pular e voltar; exigir que ele chegue à última tela para
          ver o botão esconderia a saída de quem já terminou.
        */}
        {respondidas === questions.length ? (
          <form
            onSubmit={(evento) => {
              evento.preventDefault();
              const dados = new FormData(evento.currentTarget);
              startTransition(() => dispatch(dados));
            }}
          >
            <input type="hidden" name="planTopicId" value={planTopicId} />
            <input type="hidden" name="answers" value={payload} />
            <Button type="submit" disabled={enviando}>
              {enviando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {enviando ? "Corrigindo…" : "Enviar e ver o resultado"}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Faltam {questions.length - respondidas} para poder enviar.
          </p>
        )}
      </div>

      {estado.message && !estado.done ? (
        <p role="status" className="text-sm text-destructive">
          {estado.message}
        </p>
      ) : null}
    </div>
  );
}

function Resultado({ estado, topicName }: { estado: MasteryState; topicName: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      {estado.passed ? (
        <CheckCircle2 className="size-12 text-success" aria-hidden />
      ) : (
        <XCircle className="size-12 text-warning" aria-hidden />
      )}

      <h2 className="text-xl font-bold text-pretty text-foreground">
        {estado.passed ? `Você domina ${topicName}` : "Ainda não"}
      </h2>

      <p className="text-pretty text-muted-foreground">{estado.message}</p>

      {estado.passed ? (
        <p className="text-sm text-pretty text-muted-foreground">
          O assunto saiu da fila do algoritmo. Ele volta se você começar a errar
          questões dele.
        </p>
      ) : null}

      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/trilhas">Voltar às trilhas</Link>
        </Button>
        {!estado.passed ? (
          <Button asChild variant="outline">
            <Link href="/questoes">Praticar mais</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
