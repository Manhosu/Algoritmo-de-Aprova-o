import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TopicExplanation } from "@/components/explain/topic-explanation";
import { PendingStep } from "@/components/shared/pending-step";
import { EmptyState, SectionTitle, Surface } from "@/components/shared/surface";
import { APP_TIMEZONE } from "@/config/app";
import { LOGIN_ROUTE } from "@/config/routes";
import { SIGNAL_COPY, SIGNAL_ORDER } from "@/modules/daily-task/signal-copy";
import { nextStep } from "@/modules/onboarding/next-step";
import { toCivilDate, type CivilDate } from "@/modules/shared/dates";
import { getStudentContext } from "@/server/auth/current-user";
import { explainDailyTask, recentTaskDates } from "@/server/engine/explain";

export const metadata: Metadata = {
  title: "Entenda o Algoritmo",
  description:
    "Por que cada assunto entrou na sua tarefa de hoje, sinal por sinal.",
};

/**
 * ENTENDA O ALGORITMO (README 2.5).
 * ============================================================================
 *
 * A tela que cobra a promessa do produto. O README manda a priorização ser
 * "regra de negócio explícita, não delegar à IA — precisa ser previsível e
 * explicável"; aqui o aluno vê a conta.
 *
 * ⚠️ MOSTRA A DECISÃO GRAVADA, não uma recalculada agora.
 *
 * Os sinais mudam ao longo do dia: responder questões move o desempenho, a
 * prova fica um dia mais perto, a recência anda. Uma explicação recalculada às
 * 22h descreveria uma decisão que não foi a das 6h — números plausíveis para
 * uma escolha que ninguém fez. Ver a nota em `server/engine/explain.ts`.
 */
export const dynamic = "force-dynamic";

export default async function EntendaOAlgoritmoPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>;
}) {
  const context = await getStudentContext();
  if (!context) redirect(LOGIN_ROUTE);

  const pendente = nextStep(context.currentPreparation);
  if (pendente) {
    return (
      <div className="mx-auto w-full max-w-2xl py-4">
        <PendingStep step={pendente} />
      </div>
    );
  }

  const preparationId = context.currentPreparation!.id;
  const { dia } = await searchParams;
  const hoje = toCivilDate(new Date(), APP_TIMEZONE);

  const dias = await recentTaskDates(preparationId, 14);

  /*
    O parâmetro da URL é conferido contra as datas que EXISTEM, e não parseado.
    Assim `?dia=qualquer-coisa` cai no dia mais recente em vez de virar consulta
    com data inválida, e não há string de fora chegando ao banco.
  */
  const diaEscolhido: CivilDate | undefined =
    dias.find((d) => d === dia) ?? dias.find((d) => d === hoje) ?? dias[0];

  const explicacao = diaEscolhido
    ? await explainDailyTask({ preparationId, taskDate: diaEscolhido })
    : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <Sparkles className="size-5 shrink-0 text-primary" aria-hidden />
          Entenda o Algoritmo
        </h1>
        <p className="mt-2 text-pretty text-sm text-muted-foreground">
          Nada aqui é sorteio nem palpite de IA. Todo dia o sistema cruza cinco
          sinais sobre você e sobre a sua prova, e a conta fica registrada.
        </p>
      </header>

      <Surface className="flex flex-col gap-4 p-5">
        <SectionTitle>Os cinco sinais</SectionTitle>

        <dl className="flex flex-col gap-3">
          {SIGNAL_ORDER.map((sinal) => (
            <div key={sinal} className="flex flex-col gap-0.5">
              <dt className="flex items-baseline gap-2 text-sm font-medium text-foreground">
                {SIGNAL_COPY[sinal].label}
                {explicacao ? (
                  <span className="text-metric text-xs text-primary">
                    {explicacao.weights[sinal]}%
                  </span>
                ) : null}
              </dt>
              <dd className="text-pretty text-sm text-muted-foreground">
                {SIGNAL_COPY[sinal].explanation}
              </dd>
            </div>
          ))}
        </dl>
      </Surface>

      {dias.length > 1 ? (
        <nav aria-label="Dias com tarefa" className="flex flex-col gap-2">
          <SectionTitle>Ver outro dia</SectionTitle>
          <ul className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {dias.map((d) => (
              <li key={d}>
                <a
                  href={`/entenda-o-algoritmo?dia=${d}`}
                  aria-current={d === diaEscolhido ? "page" : undefined}
                  className={
                    d === diaEscolhido
                      ? "text-metric block shrink-0 rounded-lg bg-primary/15 px-3 py-2 text-sm font-semibold text-primary"
                      : "text-metric block shrink-0 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  }
                >
                  {formatarDia(d)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {!explicacao ? (
        <EmptyState
          title="Ainda não há uma tarefa para explicar"
          description="Assim que a sua primeira Tarefa do Dia for montada, a conta dela aparece aqui."
        />
      ) : (
        <>
          <SectionTitle>
            {diaEscolhido === hoje
              ? "A fila de hoje"
              : `A fila de ${formatarDia(explicacao.taskDate)}`}
          </SectionTitle>

          {!explicacao.weightsAreCurrent ? (
            /*
              Sem este aviso a tela pareceria errada de um jeito específico: os
              pesos exibidos no topo (que são os DESTA tarefa) não bateriam com
              os que a operação vê no painel hoje, e não haveria nada explicando
              a diferença.
            */
            <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-pretty text-muted-foreground">
              Esta tarefa foi montada com a versão {explicacao.weightsVersion} dos
              pesos. Eles mudaram depois, e a explicação abaixo mostra a conta que
              foi feita no dia — não a que seria feita hoje.
            </p>
          ) : null}

          <ol className="flex flex-col gap-3">
            {explicacao.topics.map((topico) => (
              <li key={topico.planTopicId}>
                <TopicExplanation topico={topico} />
              </li>
            ))}
          </ol>

          <p className="text-pretty text-xs text-muted-foreground">
            As barras mostram quanto cada sinal contribuiu para a nota do
            assunto. A soma das cinco é exatamente a nota — é assim que a ordem
            da fila é decidida.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * "31/08". O ano só aparece quando a data não é do ano corrente.
 *
 * ⚠️ `new Date("2026-08-31")` seria lido como UTC e, em Brasília, voltaria um
 * dia. Partir a string evita a conversão inteira.
 */
function formatarDia(data: CivilDate): string {
  const [ano, mes, dia] = data.split("-");
  const anoAtual = String(new Date().getFullYear());

  return ano === anoAtual ? `${dia}/${mes}` : `${dia}/${mes}/${ano}`;
}
