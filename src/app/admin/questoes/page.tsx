import type { Metadata } from "next";
import Link from "next/link";

import { ImportForm } from "@/components/admin/import-form";
import { requireAdmin } from "@/server/auth/guards";
import { QUESTION_SHEET_COLUMNS } from "@/server/import/questions";
import {
  countPublishedWithoutExplanation,
  questionsByBoard,
  questionsBySubject,
  recentImportBatches,
} from "@/server/admin/catalog-stats";

export const metadata: Metadata = { title: "Questões" };

export const dynamic = "force-dynamic";

const ROTULO_STATUS: Record<string, string> = {
  processing: "Processando",
  completed: "Concluída",
  completed_with_errors: "Concluída com erros",
  failed: "Falhou",
};

/**
 * O banco de questões visto por disciplina, banca e importação (README 2.6).
 *
 * ⚠️ MOSTRA RASCUNHO E PUBLICADO EM COLUNAS SEPARADAS.
 *
 * Um total único esconderia a única pergunta que importa aqui: quanto do acervo
 * o aluno realmente alcança. Uma disciplina com 300 questões das quais 280 são
 * rascunho parece coberta e não está.
 */
export default async function QuestoesPage() {
  await requireAdmin();

  const [porDisciplina, porBanca, lotes, semComentario] = await Promise.all([
    questionsBySubject(),
    questionsByBoard(),
    recentImportBatches(8),
    countPublishedWithoutExplanation(),
  ]);

  const publicadas = porDisciplina.reduce((soma, d) => soma + d.published, 0);
  const rascunhos = porDisciplina.reduce((soma, d) => soma + d.draft, 0);
  const semAssunto = porDisciplina.reduce((soma, d) => soma + d.withoutTopic, 0);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
      <header>
        <p className="text-eyebrow">Administração</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Questões</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          {publicadas} no ar e {rascunhos} em rascunho.
        </p>

        {/*
          A porta de entrada da revisão questão a questão. Fica no cabeçalho
          porque corrigir conteúdo é o que se faz aqui todo dia; importar
          planilha é o que se faz de vez em quando.
        */}
        <Link
          href="/admin/questoes/acervo"
          className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Ver e editar questões
        </Link>
      </header>

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div>
          <h2 className="font-semibold text-foreground">Importar planilha</h2>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">
            Cada linha é conferida antes de gravar. O que não casar com o
            catálogo fica de fora e aparece na lista, para você corrigir e
            reenviar.
          </p>
        </div>

        <ImportForm colunas={QUESTION_SHEET_COLUMNS} />
      </section>

      {semComentario > 0 ? (
        <Link
          href="/admin/questoes/acervo?situacao=published&semComentario=1"
          className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-pretty text-foreground transition-colors hover:border-warning"
        >
          {semComentario}{" "}
          {semComentario === 1
            ? "questão publicada está sem comentário"
            : "questões publicadas estão sem comentário"}
          . O aluno erra e não descobre por quê.{" "}
          <span className="font-semibold underline underline-offset-4">Corrigir</span>
        </Link>
      ) : null}

      {semAssunto > 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-pretty text-muted-foreground">
          {semAssunto}{" "}
          {semAssunto === 1 ? "questão está" : "questões estão"} sem assunto
          definido. Elas contam na disciplina, mas não entram na Tarefa do Dia de
          um tema específico.
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-foreground">Por disciplina</h2>

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Disciplina</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">No ar</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Rascunho</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Sem assunto</th>
              </tr>
            </thead>
            <tbody>
              {porDisciplina.map((linha) => (
                <tr key={linha.subject} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="px-4 py-3 text-left font-normal text-foreground">
                    {linha.subject}
                  </th>
                  <td className="text-metric px-4 py-3 text-right text-foreground">
                    {linha.published}
                  </td>
                  <td className="text-metric px-4 py-3 text-right text-muted-foreground">
                    {linha.draft}
                  </td>
                  <td className="text-metric px-4 py-3 text-right text-muted-foreground">
                    {linha.withoutTopic}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-foreground">Por banca</h2>

        {porBanca.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            Nenhuma questão está associada a uma banca.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {porBanca.map((banca) => (
              <li
                key={banca.board}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground"
              >
                {banca.board}{" "}
                <span className="text-metric text-muted-foreground">{banca.total}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-foreground">Últimas importações</h2>

        {lotes.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            Nenhuma planilha foi importada ainda.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lotes.map((lote) => (
              <li
                key={lote.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-border bg-card px-4 py-3 text-sm"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {lote.fileName}
                </span>
                <span className="text-muted-foreground">
                  {lote.createdAt.toLocaleDateString("pt-BR")}
                </span>
                <span className="text-metric text-foreground">
                  {lote.importedRows}/{lote.totalRows}
                </span>
                {lote.failedRows > 0 ? (
                  <span className="text-destructive">{lote.failedRows} com erro</span>
                ) : null}
                {lote.skippedRows > 0 ? (
                  <span className="text-muted-foreground">
                    {lote.skippedRows} repetidas
                  </span>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {ROTULO_STATUS[lote.status] ?? lote.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
