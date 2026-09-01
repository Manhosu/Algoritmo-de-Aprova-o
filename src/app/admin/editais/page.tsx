import type { Metadata } from "next";

import { MetricGrid } from "@/components/admin/funnel";
import { requireAdmin } from "@/server/auth/guards";
import { editaisSummary, listEditais } from "@/server/admin/editais";

export const metadata: Metadata = { title: "Editais" };

export const dynamic = "force-dynamic";

const ROTULO_STATUS: Record<string, string> = {
  queued: "Na fila",
  running: "Lendo",
  succeeded: "Lida",
  failed: "Falhou",
  expired: "Expirou",
};

/**
 * Todos os editais enviados pelos alunos (README 2.6).
 *
 * ⚠️ O PDF NÃO É SERVIDO AQUI. A tela mostra o nome do arquivo, o resultado da
 * leitura e o custo. Abrir o documento de um aluno é acesso a algo que ele
 * enviou para uma finalidade específica, e a Política de Privacidade não prevê
 * isso. Ver a nota em `server/admin/editais.ts`.
 */
export default async function AdminEditaisPage() {
  await requireAdmin();

  const [resumo, editais] = await Promise.all([editaisSummary(), listEditais()]);

  const economizados = resumo.total - resumo.distinctFiles;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header>
        <p className="text-eyebrow">Administração</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Editais</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          O que os alunos enviaram, o que a IA conseguiu ler e quanto isso custou.
        </p>
      </header>

      <MetricGrid
        itens={[
          { rotulo: "Editais enviados", valor: resumo.total },
          { rotulo: "Arquivos distintos", valor: resumo.distinctFiles },
          { rotulo: "Leituras com sucesso", valor: resumo.succeeded },
          { rotulo: "Leituras com falha", valor: resumo.failed },
          {
            rotulo: "Custo acumulado",
            valor: Math.round(resumo.totalCostCents / 100),
            sufixo: " R$",
          },
          { rotulo: "Leituras poupadas", valor: economizados },
        ]}
      />

      {economizados > 0 ? (
        /*
          O reaproveitamento é a economia mais direta do produto: o segundo aluno
          do mesmo concurso envia o mesmo PDF e não paga leitura nenhuma. Sem
          esta linha o número fica invisível no meio dos outros.
        */
        <p className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-pretty text-foreground">
          {economizados}{" "}
          {economizados === 1
            ? "envio reaproveitou uma leitura já feita"
            : "envios reaproveitaram leituras já feitas"}
          . Cada um desses custou zero.
        </p>
      ) : null}

      {editais.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Nenhum edital foi enviado ainda.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[54rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Arquivo</th>
                <th scope="col" className="px-4 py-3 font-medium">Aluno</th>
                <th scope="col" className="px-4 py-3 font-medium">Cargo</th>
                <th scope="col" className="px-4 py-3 font-medium">Leitura</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Extraído</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Custo</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Enviado</th>
              </tr>
            </thead>

            <tbody>
              {editais.map((edital) => (
                <tr
                  key={edital.documentId}
                  className="border-b border-border/60 last:border-0"
                >
                  <th
                    scope="row"
                    className="max-w-[16rem] px-4 py-3 text-left font-normal"
                  >
                    <span className="block truncate font-medium text-foreground">
                      {edital.fileName}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {Math.round(edital.sizeBytes / 1024)} KB
                      {edital.pageCount ? ` · ${edital.pageCount} páginas` : ""}
                    </span>
                  </th>

                  <td className="max-w-[14rem] px-4 py-3">
                    <span className="block truncate text-foreground">
                      {edital.studentName ?? "Conta anonimizada"}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {edital.studentEmail ?? "—"}
                    </span>
                  </td>

                  <td className="max-w-[14rem] px-4 py-3">
                    <span className="block truncate text-foreground">
                      {edital.preparationTitle ?? edital.targetPosition}
                    </span>
                    {edital.institution ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {edital.institution}
                      </span>
                    ) : null}
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={
                        edital.status === "failed"
                          ? "text-destructive"
                          : edital.status === "succeeded"
                            ? "text-success"
                            : "text-muted-foreground"
                      }
                    >
                      {edital.status
                        ? (ROTULO_STATUS[edital.status] ?? edital.status)
                        : "Sem leitura"}
                    </span>
                    {edital.attempts > 1 ? (
                      <span className="block text-xs text-muted-foreground">
                        {edital.attempts} tentativas
                      </span>
                    ) : null}
                    {edital.errorMessage ? (
                      <span className="block max-w-[16rem] truncate text-xs text-destructive">
                        {edital.errorMessage}
                      </span>
                    ) : null}
                  </td>

                  <td className="px-4 py-3 text-right whitespace-nowrap text-muted-foreground">
                    {edital.subjectCount === null ? (
                      "—"
                    ) : (
                      <>
                        <span className="text-metric text-foreground">
                          {edital.subjectCount}
                        </span>{" "}
                        disc.
                        <span className="block text-xs">
                          {edital.topicCount} assuntos
                        </span>
                      </>
                    )}
                  </td>

                  <td className="text-metric px-4 py-3 text-right whitespace-nowrap text-muted-foreground">
                    {edital.costCents === null
                      ? "—"
                      : `R$ ${(edital.costCents / 100).toFixed(2).replace(".", ",")}`}
                  </td>

                  <td className="px-4 py-3 text-right whitespace-nowrap text-muted-foreground">
                    {edital.uploadedAt.toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
