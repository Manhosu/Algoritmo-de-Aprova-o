import type { Metadata } from "next";

import { EngineForm } from "@/components/admin/engine-form";
import { LevelsForm } from "@/components/admin/levels-form";
import { camposDe } from "@/components/admin/engine-fields";
import { ReviewIntervalsForm } from "@/components/admin/review-intervals-form";
import { TechniquesForm } from "@/components/admin/techniques-form";
import type {
  CoinValues,
  DailyTaskWeights,
  XpValues,
} from "@/modules/engine-config/schemas";
import { listLevelsForAdmin } from "@/server/admin/levels-admin";
import { requireAdmin } from "@/server/auth/guards";
import { getActiveConfig } from "@/server/engine/config";
import { listConfigVersions } from "@/server/engine/publish-config";

export const metadata: Metadata = { title: "Algoritmo" };

/**
 * Os nomes em pt-BR de cada sinal, um por chave do schema.
 *
 * `Record<keyof …>` é o ponto: acrescentar um peso ao Motor 1 sem dar nome a
 * ele passa a ser erro de compilação, e não um campo sem rótulo na tela — ou,
 * pior, um campo ausente que só aparece como "veio vazio" ao publicar.
 */
const ROTULOS_PESOS: Record<keyof DailyTaskWeights, { rotulo: string; ajuda?: string }> =
  {
    hardReviews: {
      rotulo: "Revisões difíceis",
      ajuda: "Quantas revisões do assunto o aluno marcou como Difícil.",
    },
    editalWeight: {
      rotulo: "Peso no edital",
      ajuda: "Quantas questões o tema costuma valer na prova.",
    },
    urgency: { rotulo: "Urgência", ajuda: "Proximidade da data da prova." },
    recency: { rotulo: "Recência", ajuda: "Há quanto tempo o aluno não vê o assunto." },
    knowledgeGap: { rotulo: "Lacunas", ajuda: "Onde ele mais erra." },
  };

const ROTULOS_MOEDAS: Record<keyof CoinValues, { rotulo: string; ajuda?: string }> = {
  dailyTaskCompleted: {
    rotulo: "Tarefa do Dia concluída",
    ajuda: "A recompensa principal: todos os blocos do dia terminados.",
  },
  reviewCompleted: { rotulo: "Revisão realizada" },
  streakDay: {
    rotulo: "Dia de sequência",
    ajuda: "Uma vez por dia, na primeira atividade — não a cada questão.",
  },
  materialStudied: {
    rotulo: "Material estudado",
    ajuda:
      "Uma vez por material da biblioteca. É um clique auto declarado, então " +
      "vale menos que uma revisão.",
  },
};

const ROTULOS_XP: Record<keyof XpValues, { rotulo: string; ajuda?: string }> = {
  studyCompleted: { rotulo: "Estudo concluído" },
  questionAnswered: { rotulo: "Questão respondida" },
  correctBonus: {
    rotulo: "Bônus de acerto",
    ajuda: "Somado ao valor acima. Precisa ser maior que zero.",
  },
  streakDay: { rotulo: "Dia de constância" },
  dailyGoalCompleted: { rotulo: "Meta diária concluída" },
  reviewCompleted: { rotulo: "Revisão realizada" },
};

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

  const [
    pesos,
    xp,
    moedas,
    revisoes,
    tecnicas,
    niveis,
    versoesPesos,
    versoesXp,
    versoesMoedas,
    versoesRevisoes,
    versoesTecnicas,
  ] = await Promise.all([
    getActiveConfig("daily_task_weights"),
    getActiveConfig("xp_values"),
    getActiveConfig("coin_values"),
    getActiveConfig("review_intervals"),
    getActiveConfig("study_techniques"),
    listLevelsForAdmin(),
    listConfigVersions("daily_task_weights"),
    listConfigVersions("xp_values"),
    listConfigVersions("coin_values"),
    listConfigVersions("review_intervals"),
    listConfigVersions("study_techniques"),
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
          campos={camposDe(pesos.value, ROTULOS_PESOS, "%")}
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

        <EngineForm kind="xp_values" campos={camposDe(xp.value, ROTULOS_XP, "XP")} />

        <Historico versoes={versoesXp} />
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-8">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Faixa de XP de cada nível
          </h2>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">
            Onde cada nível começa. Diferente do resto desta tela, a mudança vale
            para o XP que os alunos JÁ têm: a faixa descreve o que o XP significa
            hoje, e o XP deles não muda junto.
          </p>
        </div>

        <LevelsForm niveis={niveis} />
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-8">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Moedas por atividade
          </h2>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">
            O que o aluno gasta na Loja. Separado do XP de propósito: XP mede
            progresso e nunca é gasto; moeda é saldo e sai da conta ao ser
            trocada.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            No ar: versão {moedas.version}
          </p>
        </div>

        <EngineForm
          kind="coin_values"
          campos={camposDe(moedas.value, ROTULOS_MOEDAS, "moedas")}
        />

        <Historico versoes={versoesMoedas} />
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-8">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Periodicidade das revisões
          </h2>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">
            Quando cada revisão de um assunto vence, contando do dia em que ele
            foi estudado. Vale para as séries que nascerem daqui em diante — as
            já agendadas mantêm o intervalo com que foram criadas.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            No ar: versão {revisoes.version}
          </p>
        </div>

        <ReviewIntervalsForm atuais={revisoes.value.intervalsInDays} />

        <Historico versoes={versoesRevisoes} />
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-8">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Técnicas de estudo
          </h2>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">
            Quais modos de estudo a Tarefa do Dia prescreve, e quanto de amostra
            a Melhor Técnica precisa para dizer alguma coisa. Vale para as
            tarefas que nascerem daqui em diante — as de hoje mantêm a técnica
            com que foram criadas.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            No ar: versão {tecnicas.version}
          </p>
        </div>

        <TechniquesForm atual={tecnicas.value} />

        <Historico versoes={versoesTecnicas} />
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
