import type { Metadata } from "next";

import { EngineForm } from "@/components/admin/engine-form";
import { requireAdmin } from "@/server/auth/guards";
import { getActiveConfig } from "@/server/engine/config";
import { listConfigVersions } from "@/server/engine/publish-config";

export const metadata: Metadata = { title: "Algoritmo" };

/**
 * Pesos do Motor 1 e valores de XP, editáveis sem tocar em código (README 2.6).
 *
 * ⚠️ PUBLICAR CRIA VERSÃO, NÃO EDITA A ATIVA. Cada lançamento de XP guarda o
 * `engine_config_id` que o produziu e cada Tarefa do Dia guarda os pesos com
 * que foi montada. Editar no lugar reescreveria o passado: o XP creditado
 * ontem apontaria para valores que não existiam ontem.
 */
export const dynamic = "force-dynamic";

export default async function AlgoritmoPage() {
  await requireAdmin();

  const [pesos, xp, versoesPesos, versoesXp] = await Promise.all([
    getActiveConfig("daily_task_weights"),
    getActiveConfig("xp_values"),
    listConfigVersions("daily_task_weights"),
    listConfigVersions("xp_values"),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8">
      <header>
        <p className="text-eyebrow">Administração</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Algoritmo</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          O que decide a Tarefa do Dia e quanto vale cada atividade. Publicar cria
          uma versão nova — o histórico do que já aconteceu continua apontando
          para a versão em que aconteceu.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Pesos da Tarefa do Dia
          </h2>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">
            Os cinco sinais que o Motor 1 cruza para escolher o que o aluno estuda
            hoje. Precisam somar 100.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            No ar: versão {pesos.version}
          </p>
        </div>

        <EngineForm
          kind="daily_task_weights"
          somaEsperada={100}
          campos={[
            {
              chave: "performance",
              rotulo: "Desempenho",
              ajuda: "Quanto o aluno acerta no assunto.",
              valor: pesos.value.performance,
              sufixo: "%",
            },
            {
              chave: "editalWeight",
              rotulo: "Peso no edital",
              ajuda: "Quantas questões o tema costuma valer na prova.",
              valor: pesos.value.editalWeight,
              sufixo: "%",
            },
            {
              chave: "urgency",
              rotulo: "Urgência",
              ajuda: "Proximidade da data da prova.",
              valor: pesos.value.urgency,
              sufixo: "%",
            },
            {
              chave: "recency",
              rotulo: "Recência",
              ajuda: "Há quanto tempo o aluno não vê o assunto.",
              valor: pesos.value.recency,
              sufixo: "%",
            },
            {
              chave: "knowledgeGap",
              rotulo: "Lacunas",
              ajuda: "Onde ele mais erra.",
              valor: pesos.value.knowledgeGap,
              sufixo: "%",
            },
          ]}
        />

        <Historico versoes={versoesPesos} />
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-8">
        <div>
          <h2 className="text-lg font-semibold text-foreground">XP por atividade</h2>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">
            Quanto cada ação rende. O bônus de acerto é SOMADO ao valor de questão
            respondida — acertar precisa valer mais que apenas responder.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">No ar: versão {xp.version}</p>
        </div>

        <EngineForm
          kind="xp_values"
          campos={[
            { chave: "studyCompleted", rotulo: "Estudo concluído", valor: xp.value.studyCompleted, sufixo: "XP" },
            { chave: "questionAnswered", rotulo: "Questão respondida", valor: xp.value.questionAnswered, sufixo: "XP" },
            {
              chave: "correctBonus",
              rotulo: "Bônus de acerto",
              ajuda: "Somado ao valor acima. Precisa ser maior que zero.",
              valor: xp.value.correctBonus,
              sufixo: "XP",
            },
            { chave: "streakDay", rotulo: "Dia de constância", valor: xp.value.streakDay, sufixo: "XP" },
            { chave: "dailyGoalCompleted", rotulo: "Meta diária concluída", valor: xp.value.dailyGoalCompleted, sufixo: "XP" },
            { chave: "reviewCompleted", rotulo: "Revisão realizada", valor: xp.value.reviewCompleted, sufixo: "XP" },
          ]}
        />

        <Historico versoes={versoesXp} />
      </section>
    </div>
  );
}

function Historico({
  versoes,
}: {
  versoes: Array<{ version: number; isActive: boolean; note: string | null; createdAt: Date }>;
}) {
  if (versoes.length === 0) return null;

  return (
    <details className="rounded-xl border border-border p-4">
      <summary className="cursor-pointer text-sm text-primary">
        Ver versões anteriores ({versoes.length})
      </summary>

      <ul className="mt-3 flex flex-col gap-2 text-sm">
        {versoes.map((versao) => (
          <li key={versao.version} className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-metric text-xs text-muted-foreground">
              v{versao.version}
            </span>
            <span className="text-muted-foreground">
              {versao.createdAt.toLocaleDateString("pt-BR")}
            </span>
            {versao.note ? (
              <span className="text-pretty text-foreground">— {versao.note}</span>
            ) : null}
            {versao.isActive ? (
              <span className="ml-auto rounded-full border border-primary/50 px-2 py-0.5 text-[0.65rem] text-primary">
                no ar
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
