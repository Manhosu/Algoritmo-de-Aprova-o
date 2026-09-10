"use client";

import { Loader2, Upload } from "lucide-react";
import { useActionState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { importFlashcardsAction, type FlashcardImportState } from "./import-actions";
import { SheetSourceFields } from "./sheet-source-fields";

const INICIAL: FlashcardImportState = {};

/**
 * Importação de baralhos de flashcards por planilha.
 *
 * ⚠️ EXISTE PORQUE BARALHO NÃO É ARQUIVO.
 *
 * Palavras da cliente em 08/09/2026: "tentei cadastrar um arquivo xlsx de
 * flashcards e um mapa mental, não deu certo, coloquei o link do drive. Liberar
 * o cadastro por upload".
 *
 * O mapa mental o botão de enviar arquivo resolveu. O baralho não: o conteúdo
 * dele são os CARTÕES, que viram linhas no banco para o aluno virar um a um.
 * Guardar o .xlsx no acervo entregaria uma planilha para download no lugar de
 * um baralho.
 *
 * ⚠️ A AÇÃO É CHAMADA DE DENTRO DO `onSubmit`, e não por `action={}`.
 *
 * O React 19 limpa o formulário assim que a ação termina, e num formulário com
 * arquivo isso quebra o fluxo inteiro: "Conferir sem gravar" roda, mostra o
 * relatório e apaga o arquivo escolhido, então "Importar" responde "Escolha uma
 * planilha". A conferência ficaria inútil justamente por funcionar.
 */
export function FlashcardImportForm({ colunas }: { colunas: readonly string[] }) {
  const [state, dispatch] = useActionState<FlashcardImportState, FormData>(
    importFlashcardsAction,
    INICIAL,
  );
  const [pending, startTransition] = useTransition();

  function enviar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    /* `submitter` é o botão que enviou: é como "conferir" e "importar" se distinguem. */
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const dados = new FormData(
      event.currentTarget,
      submitter instanceof HTMLButtonElement ? submitter : null,
    );

    startTransition(() => dispatch(dados));
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <SheetSourceFields id="flashcard-sheet" />
          <p className="text-xs text-pretty text-muted-foreground">
            Colunas: <span className="text-metric">{colunas.join(", ")}</span>. Cada
            linha é um cartão. Assunto que ainda não existe no catálogo é criado.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            name="acao"
            value="conferir"
            variant="outline"
            disabled={pending}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Conferir sem gravar
          </Button>

          <Button type="submit" name="acao" value="importar" disabled={pending}>
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Upload aria-hidden />
            )}
            Importar
          </Button>
        </div>
      </form>

      {state.message ? (
        <p
          role="status"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-pretty text-foreground"
        >
          {state.message}
        </p>
      ) : null}

      {state.report ? <Relatorio report={state.report} /> : null}
    </div>
  );
}

function Relatorio({
  report,
}: {
  report: NonNullable<FlashcardImportState["report"]>;
}) {
  const conferencia = report.created === 0 && report.updated === 0;

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 text-sm"
    >
      <p className="font-semibold text-foreground">{report.fileName}</p>

      <p className="text-pretty text-muted-foreground">
        {conferencia
          ? `${report.parsed} ${report.parsed === 1 ? "cartão lido" : "cartões lidos"} em ${report.decks.length} ${report.decks.length === 1 ? "baralho" : "baralhos"}. Nada foi gravado.`
          : `${report.created} ${report.created === 1 ? "baralho novo" : "baralhos novos"} · ${report.updated} ${report.updated === 1 ? "substituído" : "substituídos"}.`}
      </p>

      {report.decks.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {report.decks.slice(0, 12).map((deck) => (
            <li key={deck.label} className="flex items-baseline gap-2 text-pretty">
              <span className="text-metric shrink-0 text-xs text-muted-foreground">
                {deck.cards}
              </span>
              <span
                className={
                  deck.status === "recusado" ? "text-destructive" : "text-foreground"
                }
              >
                {deck.label}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {/*
        ⚠️ O QUE FOI CRIADO É AVISADO, e não silenciado.

        Criar assunto no catálogo é uma escrita que a cliente não pediu de
        forma explícita: ela pediu para o baralho entrar. Ela precisa saber que
        o catálogo cresceu, para conferir se o nome ficou do jeito dela.
      */}
      {report.createdTopics.length > 0 ? (
        <p className="text-pretty text-muted-foreground">
          Assuntos criados no catálogo:{" "}
          <span className="text-foreground">{report.createdTopics.join(", ")}</span>
        </p>
      ) : null}

      {report.unknownSubjects.length > 0 ? (
        <p className="text-pretty text-warning">
          Disciplina fora do catálogo, baralho não importado:{" "}
          {report.unknownSubjects.join(", ")}
        </p>
      ) : null}

      {report.issues.length > 0 ? (
        <ul className="flex flex-col gap-1 text-pretty text-muted-foreground">
          {report.issues.map((issue) => (
            <li key={`${issue.row}-${issue.message}`}>
              Linha {issue.row}: {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
