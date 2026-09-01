import type { Metadata } from "next";

import { requireAdmin } from "@/server/auth/guards";
import { listStudents } from "@/server/admin/overview";

export const metadata: Metadata = { title: "Alunos" };

/**
 * Progresso individual: XP, sequência, questões e acerto (README 2.6).
 *
 * ⚠️ SÓ LEITURA, e de propósito.
 *
 * Editar XP pelo painel quebraria a auditoria: o saldo é reconstruível a partir
 * do livro-razão de lançamentos, e um valor digitado à mão não teria lançamento
 * que o explicasse. Se um aluno reclamar de XP faltando, a correção é lançar o
 * evento que faltou, não sobrescrever o total.
 */
export const dynamic = "force-dynamic";

export default async function AlunosPage() {
  await requireAdmin();
  const alunos = await listStudents(100);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header>
        <p className="text-eyebrow">Administração</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Alunos</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          Quem está estudando, quanto já andou e onde está travando. Ordenado por
          XP.
        </p>
      </header>

      {alunos.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Nenhum aluno ativo ainda.
        </p>
      ) : (
        /*
          A tabela rola dentro da própria caixa. Sem este `overflow-x-auto`, as
          sete colunas empurrariam a largura da PÁGINA em 390px e toda a
          navegação passaria a rolar de lado junto.
        */
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Aluno</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">XP</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Sequência</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Questões</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Acerto</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Última atividade</th>
              </tr>
            </thead>

            <tbody>
              {alunos.map((aluno) => (
                <tr
                  key={aluno.id}
                  className="border-b border-border/60 last:border-0"
                >
                  <th scope="row" className="max-w-[18rem] px-4 py-3 text-left font-normal">
                    <span className="block truncate font-medium text-foreground">
                      {aluno.name ?? "Conta anonimizada"}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {aluno.email ?? "—"}
                    </span>
                  </th>
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
