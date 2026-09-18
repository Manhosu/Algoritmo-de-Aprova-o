import type { ScheduleView } from "@/server/engine/schedule";

/**
 * O cronograma projetado de um aluno, visto pela operação.
 *
 * ⚠️ ELA MARCOU ESTE ITEM COMO "MUITO IMPORTANTE", e o motivo é produção, não
 * curiosidade: saber quais assuntos entram nas próximas semanas de cada aluno é
 * o que permite preparar material e questões NA ORDEM em que serão pedidos, em
 * vez de produzir no escuro.
 *
 * Por isso a tela mostra as semanas com os assuntos nomeados, e não só um
 * gráfico de minutos: o nome do assunto é o que vira tarefa de produção.
 */
export function StudentSchedule({ cronograma }: { cronograma: ScheduleView }) {
  /*
    ⚠️ TODAS AS SEMANAS, e não as seis primeiras.

    O corte em seis fez a cliente concluir que faltava conteúdo no plano de um
    aluno (18/09/2026): o edital dele ocupava dez semanas, e a tela mostrava seis
    com uma nota discreta embaixo. Para quem usa esta tela para saber o que
    produzir, uma semana escondida é um assunto que parece não existir.
  */
  const semanas = cronograma.weeks;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="font-semibold text-foreground">Cronograma</h2>
        <p className="mt-1 text-pretty text-sm text-muted-foreground">
          {cronograma.summary.topicsRemaining} assuntos pendentes em{" "}
          {cronograma.summary.daysRemaining} dias
          {cronograma.hasExamDate ? " até a prova" : " (sem data de prova informada)"}.
        </p>
      </div>

      {!cronograma.feasibility.fits ? (
        /*
          O aviso de inviabilidade vem primeiro porque é acionável pela
          operação: significa que o aluno não tem tempo para o edital inteiro no
          ritmo declarado, e é a conversa que ela precisa ter com ele.
        */
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-pretty text-foreground">
          No ritmo declarado, o edital não cabe no tempo restante: seriam necessários{" "}
          {cronograma.feasibility.extraMinutesPerDayNeeded} minutos a mais por dia.
        </p>
      ) : null}

      {semanas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma semana projetada — o aluno não informou disponibilidade.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {semanas.map((semana) => (
            <li key={semana.startDate} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-metric text-sm text-foreground">
                  {formatarDia(semana.startDate)} a {formatarDia(semana.endDate)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {semana.plannedMinutes} de {semana.availableMinutes} min
                </span>
              </div>

              {semana.topics.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">Semana sem carga.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {semana.topics.map((assunto) => (
                    <li key={assunto.planTopicId} className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 text-pretty text-foreground">
                        {assunto.topicName}
                      </span>
                      <span className="text-metric shrink-0 text-xs text-muted-foreground">
                        {assunto.minutes} min
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}

      {semanas.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {semanas.length} {semanas.length === 1 ? "semana projetada" : "semanas projetadas"}.
        </p>
      ) : null}
    </section>
  );
}

/** "2026-09-08" → "08/09". Partir a string evita a conversão de fuso. */
function formatarDia(data: string): string {
  const [, mes, dia] = data.split("-");
  return `${dia}/${mes}`;
}
