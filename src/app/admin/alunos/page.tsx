import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/server/auth/guards";
import { listStudentsDetailed } from "@/server/admin/student-detail";

export const metadata: Metadata = { title: "Alunos" };

/**
 * Progresso individual e ficha de cada aluno (README 2.6).
 *
 * ⚠️ SÓ LEITURA, e de propósito.
 *
 * Editar XP pelo painel quebraria a auditoria: o saldo é reconstruível a partir
 * do livro-razão de lançamentos, e um valor digitado à mão não teria lançamento
 * que o explicasse. Se um aluno reclamar de XP faltando, a correção é lançar o
 * evento que faltou, não sobrescrever o total.
 *
 * ⚠️ CADA LINHA É UM LINK. A cliente pediu para ver, por aluno, "praticamente
 * tudo que ele vê na Dashboard dele" — isso vive em `/admin/alunos/[id]`, e sem
 * o link não havia como chegar lá.
 */
export const dynamic = "force-dynamic";

export default async function AlunosPage() {
  await requireAdmin();
  const alunos = await listStudentsDetailed(100);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header>
        <p className="text-eyebrow">Administração</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Alunos</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          Clique num aluno para ver o desempenho e o cronograma dele. Ordenado
          por XP.
        </p>
      </header>

      {alunos.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Nenhum aluno ativo ainda.
        </p>
      ) : (
        /*
          A tabela rola dentro da própria caixa. Sem este `overflow-x-auto`, as
          colunas empurrariam a largura da PÁGINA em 390px e toda a navegação
          passaria a rolar de lado junto.
        */
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Aluno</th>
                <th scope="col" className="px-4 py-3 font-medium">Plano</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">XP</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Sequência</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Questões</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Acerto</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Cadastro</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Ativo em</th>
              </tr>
            </thead>

            <tbody>
              {alunos.map((aluno) => (
                <tr
                  key={aluno.id}
                  className="border-b border-border/60 transition-colors last:border-0 hover:bg-background/40"
                >
                  <th scope="row" className="max-w-[18rem] px-4 py-3 text-left font-normal">
                    {/*
                      O link cobre a célula do nome, não a linha inteira: uma
                      linha-link inteira engole o clique de selecionar o e-mail,
                      que é o que a operação faz para copiar e contatar.
                    */}
                    <Link
                      href={`/admin/alunos/${aluno.id}`}
                      className="block focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="block truncate font-medium text-primary">
                        {aluno.name ?? "Conta anonimizada"}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {aluno.email ?? "—"}
                      </span>
                    </Link>
                  </th>

                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {aluno.planName ?? "—"}
                  </td>
                  <td className="text-metric px-4 py-3 text-right text-foreground">
                    {aluno.totalXp}
                  </td>
                  <td className="text-metric px-4 py-3 text-right text-foreground">
                    {aluno.currentStreak}
                  </td>
                  <td className="text-metric px-4 py-3 text-right text-foreground">
                    {aluno.questionsAnswered}
                  </td>
                  <td className="text-metric px-4 py-3 text-right text-foreground">
                    {aluno.accuracyPercent === null ? "—" : `${aluno.accuracyPercent}%`}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-muted-foreground">
                    {aluno.createdAt.toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-muted-foreground">
                    {formatarData(aluno.lastActiveDate)}
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

/**
 * `last_active_date` é `date`, não `timestamp` — chega como "2026-08-31".
 *
 * ⚠️ `new Date("2026-08-31")` seria lido como UTC e, em Brasília, voltaria
 * um dia. Partir a string evita a conversão inteira.
 */
function formatarData(data: string | null): string {
  if (!data) return "—";

  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}
