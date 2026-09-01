import type { Metadata } from "next";

import { FunnelBlock, MetricGrid } from "@/components/admin/funnel";
import { findDropOff } from "@/modules/admin/funnel";
import { requireAdmin } from "@/server/auth/guards";
import { countRecentSignups, getAdminOverview } from "@/server/admin/overview";

export const metadata: Metadata = { title: "Visão geral" };

/**
 * A primeira tela do painel: o funil inteiro (README 2.6).
 *
 * ⚠️ `force-dynamic` porque a resposta É a leitura do momento.
 *
 * Uma métrica em cache mente de um jeito específico e perigoso: mostra um
 * número plausível e não avisa que ele é de ontem. Quem olha o painel para
 * decidir onde mexer precisa do que está acontecendo agora, e são seis
 * consultas — todas em paralelo, todas sobre índices.
 */
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await requireAdmin();
  const [dados, novosNaSemana] = await Promise.all([
    getAdminOverview(),
    countRecentSignups(7),
  ]);

  const quedas = findDropOff(dados.activation);
  const maiorQueda = quedas[0];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
      <header>
        <p className="text-eyebrow">Administração</p>
        {/* `name` é anulável: a anonimização da LGPD o apaga e a conta continua. */}
        <h1 className="mt-2 text-2xl font-bold text-foreground">
          {session.user.name ? `Olá, ${session.user.name.split(" ")[0]}` : "Painel"}
        </h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          Onde as pessoas entram, onde param e o que a plataforma tem no ar.
        </p>
      </header>

      <MetricGrid
        itens={[
          { rotulo: "Cadastros", valor: dados.totalSignups },
          { rotulo: "Novos em 7 dias", valor: novosNaSemana },
          { rotulo: "Alunos ativos", valor: dados.operation.activeStudents },
          {
            rotulo: "Acerto da turma",
            valor: dados.operation.classAccuracyPercent,
            sufixo: "%",
          },
          { rotulo: "Questões no ar", valor: dados.operation.publishedQuestions },
          { rotulo: "Materiais", valor: dados.operation.contentItems },
        ]}
      />

      {maiorQueda ? (
        <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-pretty text-foreground">
          Maior abandono: <strong>{maiorQueda.stage}</strong>. {maiorQueda.lost}{" "}
          {maiorQueda.lost === 1 ? "pessoa parou" : "pessoas pararam"} nesse ponto.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <FunnelBlock
          titulo="Ativação"
          descricao="Do cadastro até a primeira questão respondida."
          etapas={dados.activation}
          total={dados.totalSignups}
        />

        <FunnelBlock
          titulo="Retenção"
          descricao="Quem voltou depois do primeiro dia."
          etapas={dados.retention}
          total={dados.totalSignups}
        />

        <FunnelBlock
          titulo="Monetização"
          descricao="Quem esbarrou no limite do plano gratuito e quem assinou."
          etapas={dados.monetization}
          total={dados.totalSignups}
        />

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold text-foreground">Onde a turma mais erra</h2>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">
            Assuntos com pelo menos 20 respostas. É a fila do que produzir a
            seguir.
          </p>

          {dados.hardestTopics.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Ainda não há assunto com respostas suficientes para uma leitura
              honesta.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {dados.hardestTopics.map((assunto) => (
                <li key={assunto.name} className="flex items-baseline gap-3">
                  <span className="min-w-0 flex-1 text-pretty text-sm text-foreground">
                    {assunto.name}
                  </span>
                  <span className="text-metric shrink-0 text-sm text-destructive">
                    {assunto.errorPercent}%
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {assunto.answered} resp.
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
