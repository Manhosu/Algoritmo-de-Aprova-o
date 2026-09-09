"use client";

import { Loader2, Upload } from "lucide-react";
import { useActionState, useRef, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { importQuestionsAction, type ImportState } from "./import-actions";

/**
 * Envio da planilha de questões.
 *
 * ⚠️ DOIS BOTÕES NO MESMO FORMULÁRIO, e o `name="acao"` é o que os distingue.
 *
 * "Conferir" mostra o que aconteceria sem gravar nada; "Importar" grava. Um
 * botão só obrigaria a escolher entre uma tela que arrisca (importa direto) e
 * uma que dá trabalho (obriga a conferir sempre). Com os dois, quem confia na
 * planilha importa de uma vez e quem não confia olha antes.
 *
 * O `value` de um `<button type="submit" name="…">` só entra no FormData quando
 * é AQUELE botão que enviou — é o mecanismo nativo do HTML, e não precisa de
 * estado nenhum.
 *
 * ⚠️ A AÇÃO É CHAMADA À MÃO, e não pelo `action={}` do formulário.
 *
 * O React 19 LIMPA um formulário que ele governa pelo `action` assim que a ação
 * termina. Num formulário com arquivo isso quebra o fluxo inteiro: "Conferir
 * sem gravar" rodava, mostrava o relatório e apagava o arquivo escolhido, então
 * "Importar" respondia "Escolha uma planilha .xlsx". A conferência ficava
 * inútil justamente por funcionar.
 *
 * Chamando a ação de dentro do `onSubmit`, o React não reseta nada e o arquivo
 * continua ali para o segundo clique.
 */
export function ImportForm({ colunas }: { colunas: readonly string[] }) {
  /*
    As colunas vêm por prop, e não por import.

    ⚠️ `QUESTION_SHEET_COLUMNS` mora junto do parser de xlsx. Importá-la daqui
    arrastaria o parser inteiro para o pacote do navegador — código que só roda
    no servidor — para exibir treze palavras.
  */
  const [state, dispatch] = useActionState<ImportState, FormData>(
    importQuestionsAction,
    {},
  );

  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function enviar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    /*
      `submitter` é o botão que enviou. `new FormData(form, submitter)` inclui o
      `name`/`value` dele, que é como "conferir" e "importar" se distinguem sem
      estado nenhum.
    */
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const dados = new FormData(
      event.currentTarget,
      submitter instanceof HTMLButtonElement ? submitter : null,
    );

    startTransition(() => dispatch(dados));
  }

  return (
    <div className="flex flex-col gap-4">
      <form ref={formRef} onSubmit={enviar} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sheet">Planilha (.xlsx)</Label>
          <input
            id="sheet"
            name="sheet"
            type="file"
            /*
              ⚠️ SEM `accept`, de propósito.

              Com `accept=".xlsx"` o seletor filtra por extensão, e arquivo
              escolhido pelo Google Drive chega sem uma. A cliente ficou sem
              conseguir clicar na própria planilha: "eu coloco pra selecionar no
              drive, e o sistema não permite selecionar o excel".

              Filtrar é conforto; conseguir escolher o arquivo é o requisito.
              Quem valida é o servidor, pelos bytes.
            */
            required
            className="rounded-lg border border-input bg-input px-3 py-2.5 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/15 file:px-3 file:py-1.5 file:text-sm file:text-primary focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
          <p className="text-xs text-pretty text-muted-foreground">
            Colunas esperadas, nesta ordem:{" "}
            <span className="text-metric">{colunas.join(", ")}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" name="acao" value="conferir" variant="outline" disabled={pending}>
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

function Relatorio({ report }: { report: NonNullable<ImportState["report"]> }) {
  const conferencia = report.written === 0 && report.duplicates === 0;

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 text-sm"
    >
      <p className="font-semibold text-foreground">{report.fileName}</p>

      {report.alreadyImported ? (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-pretty text-foreground">
          Uma planilha com este nome já foi importada, então nada foi gravado.
          Renomeie o arquivo se quiser importar de novo.
        </p>
      ) : null}

      <dl className="flex flex-col gap-1.5">
        <Linha rotulo="Linhas lidas" valor={report.parsed} />
        <Linha rotulo="Casaram com o catálogo" valor={report.matched} />
        {!conferencia ? (
          <>
            <Linha rotulo="Gravadas" valor={report.written} destaque />
            {report.duplicates > 0 ? (
              <Linha
                rotulo="Já existiam no acervo"
                valor={report.duplicates}
              />
            ) : null}
          </>
        ) : null}
        {report.issues.length > 0 ? (
          <Linha rotulo="Linhas com problema" valor={report.issues.length} />
        ) : null}
      </dl>

      {conferencia && !report.alreadyImported ? (
        <p className="text-pretty text-muted-foreground">
          Nada foi gravado. Se estiver de acordo, clique em Importar.
        </p>
      ) : null}

      {report.answerBalanceWarning ? (
        /*
          O aviso de gabarito desequilibrado NÃO bloqueia: é a §8 do padrão
          editorial da cliente, e quem decide se uma remessa com 33% de "A" vai
          ao ar é ela. Bloquear transformaria recomendação editorial em regra
          técnica.
        */
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-pretty text-foreground">
          {report.answerBalanceWarning}
        </p>
      ) : null}

      {report.remapped.length > 0 ? (
        <Bloco
          titulo="Assunto cadastrado em outra disciplina"
          ajuda="A questão entrou pela disciplina dona do assunto. Se discordar, corrija a planilha."
          itens={report.remapped}
        />
      ) : null}

      {report.createdTopics.length > 0 ? (
        <Bloco
          titulo="Assuntos novos criados"
          ajuda="Não existiam no catálogo e foram criados dentro da disciplina que a planilha indicou. Confira os nomes: eles vão aparecer nos filtros e nas trilhas."
          itens={report.createdTopics}
        />
      ) : null}

      {report.unknownBoards.length > 0 ? (
        <Bloco
          titulo="Bancas que não existem no cadastro"
          ajuda="Estas questões entraram como Autoral. Me diga quais bancas cadastrar e eu acrescento."
          itens={report.unknownBoards}
        />
      ) : null}

      {report.unmatched.length > 0 ? (
        <Bloco
          titulo="Fora do catálogo"
          ajuda="A disciplina não casou com nenhuma do catálogo, então nem o assunto pôde ser criado. Confira a grafia da disciplina na planilha."
          itens={report.unmatched}
        />
      ) : null}

      {report.issues.length > 0 ? (
        <details className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer text-primary">
            Ver as {report.issues.length} linhas com problema
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
            {report.issues.slice(0, 50).map((problema) => (
              <li key={`${problema.row}-${problema.message}`}>
                <span className="text-metric">linha {problema.row}</span>:{" "}
                {problema.message}
              </li>
            ))}
            {report.issues.length > 50 ? (
              <li>… e mais {report.issues.length - 50}.</li>
            ) : null}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function Linha({
  rotulo,
  valor,
  destaque = false,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="min-w-0 flex-1 text-muted-foreground">{rotulo}</dt>
      <dd
        className={cn(
          "text-metric shrink-0",
          destaque ? "text-success" : "text-foreground",
        )}
      >
        {valor}
      </dd>
    </div>
  );
}

function Bloco({
  titulo,
  ajuda,
  itens,
}: {
  titulo: string;
  ajuda: string;
  itens: Array<{ label: string; count: number }>;
}) {
  return (
    <details className="rounded-lg border border-border p-3">
      <summary className="cursor-pointer text-primary">
        {titulo} ({itens.length})
      </summary>
      <p className="mt-1 text-xs text-pretty text-muted-foreground">{ajuda}</p>
      <ul className="mt-2 flex flex-col gap-1 text-xs">
        {itens.slice(0, 30).map((item) => (
          <li key={item.label} className="flex gap-2">
            <span className="text-metric shrink-0 text-muted-foreground">
              {item.count}x
            </span>
            <span className="min-w-0 text-pretty text-foreground">{item.label}</span>
          </li>
        ))}
        {itens.length > 30 ? (
          <li className="text-muted-foreground">… e mais {itens.length - 30}.</li>
        ) : null}
      </ul>
    </details>
  );
}
