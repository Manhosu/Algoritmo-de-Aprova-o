"use client";

import { useActionState, useState } from "react";

import {
  deleteQuestionAction,
  saveQuestionAction,
  type QuestionFormState,
} from "./question-actions";

/**
 * EDIÇÃO DE UMA QUESTÃO.
 *
 * ⚠️ A ALTERNATIVA CORRETA É UM GRUPO DE RÁDIO, não uma caixa por alternativa.
 *
 * Caixas independentes deixariam marcar duas corretas ou nenhuma, e o servidor
 * teria de recusar depois de a pessoa ter escrito tudo. O rádio torna o estado
 * inválido impossível de expressar — a validação no servidor continua lá, mas
 * como rede, não como o caminho normal.
 */

export type QuestionFormProps = {
  question: {
    id: string;
    statement: string;
    explanation: string | null;
    difficulty: string;
    status: string;
    options: Array<{ id: string; label: string; content: string; isCorrect: boolean }>;
  };
  /** Muda o texto do aviso de exclusão: arquivar preserva, excluir não. */
  hasAttempts: boolean;
};

const INICIAL: QuestionFormState = { ok: false };

export function QuestionForm({ question, hasAttempts }: QuestionFormProps) {
  const [estado, salvar, salvando] = useActionState(saveQuestionAction, INICIAL);
  const [corretaId, setCorretaId] = useState(
    question.options.find((o) => o.isCorrect)?.id ?? "",
  );

  return (
    <div className="flex flex-col gap-5">
      <form action={salvar} className="flex flex-col gap-5">
      <input type="hidden" name="questionId" value={question.id} />
      {/*
        Os ids das alternativas viajam declarados. A action lê cada uma por id em
        vez de varrer o FormData atrás de um prefixo — varredura traria junto os
        campos `$ACTION_REF_*` que o React injeta aqui dentro.
      */}
      <input
        type="hidden"
        name="optionIds"
        value={question.options.map((o) => o.id).join(",")}
      />
      <input type="hidden" name="correctOptionId" value={corretaId} />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">Enunciado</span>
        <textarea
          name="statement"
          defaultValue={question.statement}
          rows={6}
          required
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed"
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-foreground">
          Alternativas{" "}
          <span className="font-normal text-muted-foreground">
            (marque a correta à esquerda)
          </span>
        </legend>

        {question.options.map((alternativa) => (
          <div
            key={alternativa.id}
            className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
          >
            <label className="flex shrink-0 items-center gap-2 pt-2">
              <input
                type="radio"
                name="correta"
                checked={corretaId === alternativa.id}
                onChange={() => setCorretaId(alternativa.id)}
                className="size-4 accent-primary"
                aria-label={`Alternativa ${alternativa.label} é a correta`}
              />
              <span className="text-sm font-semibold text-foreground">
                {alternativa.label}
              </span>
            </label>
            <textarea
              name={`option:${alternativa.id}`}
              defaultValue={alternativa.content}
              rows={2}
              required
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">Comentário</span>
        <span className="-mt-1 text-xs text-muted-foreground">
          Obrigatório para publicar. É o que o aluno lê depois de responder.
        </span>
        <textarea
          name="explanation"
          defaultValue={question.explanation ?? ""}
          rows={6}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Dificuldade</span>
          <select
            name="difficulty"
            defaultValue={question.difficulty}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm [&>option]:bg-card [&>option]:text-foreground"
          >
            <option value="easy">Fácil</option>
            <option value="medium">Média</option>
            <option value="hard">Difícil</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Situação</span>
          <select
            name="status"
            defaultValue={question.status}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm [&>option]:bg-card [&>option]:text-foreground"
          >
            <option value="published">Publicada</option>
            <option value="draft">Rascunho</option>
            <option value="archived">Arquivada</option>
          </select>
        </label>
      </div>

      {estado.message ? (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-sm ${
            estado.ok
              ? "bg-primary/10 text-foreground"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {estado.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={salvando}
        className="self-start rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {salvando ? "Salvando…" : "Salvar questão"}
      </button>
      </form>

      <ExcluirQuestao id={question.id} hasAttempts={hasAttempts} />
    </div>
  );
}

/**
 * ⚠️ IRMÃO do formulário de edição, nunca filho.
 *
 * HTML não aninha `<form>`. O React montaria a árvore assim mesmo no cliente,
 * mas o HTML do servidor passa pelo parser do navegador, que DESCARTA o
 * formulário interno — e a hidratação encontra uma árvore diferente da que
 * gerou. O componente monta o próprio formulário, então precisa ficar de fora.
 */
function ExcluirQuestao({ id, hasAttempts }: { id: string; hasAttempts: boolean }) {
  const [estado, excluir, excluindo] = useActionState(deleteQuestionAction, INICIAL);
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="self-start text-sm font-medium text-destructive underline-offset-4 hover:underline"
      >
        Excluir esta questão
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
      <p className="text-sm text-pretty text-foreground">
        {hasAttempts
          ? "Alunos já responderam esta questão. Ela será arquivada: sai de circulação e as respostas ficam preservadas, para não mudar o desempenho de ninguém."
          : "Ninguém respondeu esta questão ainda. Ela será excluída de verdade."}
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          Digite <strong>excluir</strong> para confirmar
        </span>
        <input
          name="confirm"
          form="excluir-questao"
          autoComplete="off"
          className="max-w-48 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
      </label>

      {estado.message ? (
        <p role="status" className="text-sm text-destructive">
          {estado.message}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          form="excluir-questao"
          disabled={excluindo}
          className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {excluindo ? "Excluindo…" : hasAttempts ? "Arquivar" : "Excluir"}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground"
        >
          Cancelar
        </button>
      </div>

      {/*
        O formulário real da exclusão fica aqui, vazio e referenciado pelo
        atributo `form` dos controles acima — assim ele não é filho do
        formulário de edição, que o navegador desmontaria.
      */}
      <form id="excluir-questao" action={excluir} className="hidden">
        <input type="hidden" name="questionId" value={id} />
      </form>
    </div>
  );
}
