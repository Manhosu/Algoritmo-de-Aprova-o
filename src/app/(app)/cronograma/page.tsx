import { AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PendingStep } from "@/components/shared/pending-step";
import { EmptyState, Metric, Surface } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import { LOGIN_ROUTE } from "@/config/routes";
import { nextStep } from "@/modules/onboarding/next-step";
import { getStudentContext } from "@/server/auth/current-user";
import { getSchedule } from "@/server/engine/schedule";

export const metadata: Metadata = { title: "Cronograma adaptativo" };

/**
 * CRONOGRAMA ADAPTATIVO (README 1.8).
 *
 * A projeção é CALCULADA na abertura da tela, a partir do estado atual dos
 * assuntos. Não existe cronograma congelado para sincronizar: se as semanas
 * fossem gravadas, cada resposta exigiria reescrever dezenas de linhas, e uma
 * falha nessa escrita deixaria o aluno olhando para um plano que não
 * corresponde mais ao que ele fez.
 */
export default async function SchedulePage() {
  const context = await getStudentContext();
  if (!context) redirect(LOGIN_ROUTE);

  const preparation = context.currentPreparation;

  const pendente = nextStep(preparation);

  if (pendente) {
    return (
      <div className="mx-auto w-full max-w-2xl py-4">
        <PendingStep step={pendente} />
      </div>
    );
  }

  // `nextStep` devolve nulo só quando a preparação está ativa, mas o
  // TypeScript não sabe disso — daí a guarda.
  if (!preparation) return null;

  const schedule = await getSchedule({
    userId: context.user.id,
    preparationId: preparation.id,
  });

  if (!schedule) redirect("/inicio");

  const { feasibility, summary } = schedule;

  /*
    Quantos dias sobram entre o fim do conteúdo e a prova.

    `horizonEnd` é a data da prova (ou o horizonte projetado); a última semana
    termina quando o conteúdo acaba, que costuma ser antes. A diferença é a
    folga — e é ela que explica por que adiar a prova não empurra a última
    semana.
  */
  const ultimoDia = schedule.weeks.at(-1)?.endDate ?? schedule.horizonStart;
  const sobra = Math.max(
    0,
    Math.round(
      (Date.parse(`${schedule.horizonEnd}T12:00:00Z`) -
        Date.parse(`${ultimoDia}T12:00:00Z`)) /
        86_400_000,
    ),
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-4">
      <header>
        <h1 className="text-xl font-bold text-foreground">Cronograma adaptativo</h1>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          Ele se refaz sozinho conforme você estuda, responde questões e revisa. Não é
          um calendário fixo — é a projeção do que falta com o tempo que você tem.
        </p>
      </header>

      <Surface className="grid grid-cols-3 gap-y-4 py-4">
        <Metric label="Assuntos" value={String(summary.topicsRemaining)} hint="faltando" />
        <Metric label="Horas" value={formatHours(summary.minutesRemaining)} hint="estimadas" />
        <Metric
          label={schedule.hasExamDate ? "Dias" : "Horizonte"}
          value={String(summary.daysRemaining)}
          hint={schedule.hasExamDate ? "até a prova" : "dias"}
        />
      </Surface>

      {/*
        A viabilidade é dita com NÚMERO, não com adjetivo. "Seu ritmo está
        apertado" não permite ao aluno decidir nada; "faltam 38 minutos por dia"
        permite. Ele pode arrumar 38 minutos, ou pode tirar um assunto do plano.
      */}
      <Surface
        className={
          feasibility.fits
            ? "border-success/40 bg-success/5 p-4 sm:p-5"
            : "border-warning/40 bg-warning/5 p-4 sm:p-5"
        }
      >
        <div className="flex gap-3">
          {feasibility.fits ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {feasibility.fits ? "O plano cabe no seu tempo" : "O plano não cabe no seu tempo"}
            </p>
            <p className="mt-1 text-sm text-pretty text-muted-foreground">
              {feasibility.message}
            </p>

            {/*
              ⚠️ OS ASSUNTOS EM RISCO, POR NOME.
              
              `topicsAtRisk` sempre foi calculado pelo motor e nunca chegou à
              tela: o aluno lia "o plano não cabe" sem saber o que ficaria de
              fora. A cliente cobrou isso — e é a diferença entre um aviso
              que assusta e um que deixa decidir o que sacrificar.
            */}
            {!feasibility.fits && feasibility.topicsAtRisk.length > 0 ? (
              <div className="mt-3 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2.5">
                <p className="text-xs font-semibold tracking-wide text-foreground uppercase">
                  Não cabem antes da prova
                </p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {feasibility.topicsAtRisk.map((nome) => (
                    <li key={nome} className="text-sm text-pretty text-muted-foreground">
                      {nome}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-pretty text-muted-foreground">
                  São os de menor prioridade. Estudando mais por dia, eles voltam
                  para o plano.
                </p>
              </div>
            ) : null}

            {!feasibility.fits ? (
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href="/boas-vindas?editar=1">Ajustar meu tempo de estudo</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </Surface>

      {schedule.weeks.length === 0 ? (
        <Surface>
          <EmptyState
            icon={<CheckCircle2 />}
            title="Nada pendente no horizonte"
            description="Todos os assuntos do seu edital já foram cobertos. Continue com as revisões para fixar."
          />
        </Surface>
      ) : (
        <ol className="flex flex-col gap-3">
          {schedule.weeks.map((week, index) => (
            <li key={week.startDate} className="rounded-2xl border border-border bg-card">
              <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
                <span className="text-sm font-semibold text-foreground">
                  Semana {index + 1}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatRange(week.startDate, week.endDate)}
                </span>
              </div>

              <div className="px-4 py-3">
                <p className="mb-2 text-xs text-muted-foreground">
                  <span className="text-metric text-foreground">
                    {formatHours(week.plannedMinutes)}
                  </span>{" "}
                  de {formatHours(week.availableMinutes)} disponíveis
                </p>

                {/*
                  Os dias vêm dentro de `<details>`, fechado por padrão.
                  
                  A cliente pediu para clicar na semana e ver a divisão por dia.
                  Fechado, porque doze semanas abertas de uma vez viram uma
                  parede de texto — e o que ela quer saber primeiro é o total da
                  semana. `<details>` faz isso sem JavaScript e já vem com o
                  teclado e o leitor de tela funcionando.
                */}
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-primary marker:content-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                    <ChevronDown
                      className="size-4 transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                    Ver por dia
                  </summary>

                  <ol className="mt-3 flex flex-col gap-2.5 border-t border-border/60 pt-3">
                    {week.days.map((day) => (
                      <li key={day.date}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-xs font-semibold text-foreground">
                            {formatDay(day.date)}
                          </span>
                          {/*
                            ⚠️ SÓ "FOLGA", NUNCA OS MINUTOS DISPONÍVEIS.

                            O número ao lado do dia era a CAPACIDADE daquele
                            dia, não o que estava planejado nele. A cliente leu
                            como promessa de estudo: "fica parecendo que vai
                            estudar todo aquele tempo em um único dia".

                            O tempo de cada assunto já aparece na linha dele,
                            logo abaixo. Repetir a capacidade em cima só criava
                            um número maior que a soma do que vem embaixo.
                          */}
                          {day.availableMinutes === 0 ? (
                            <span className="text-xs text-muted-foreground">folga</span>
                          ) : null}
                        </div>

                        {day.topics.length > 0 ? (
                          <ul className="mt-1 flex flex-col gap-1 pl-3">
                            {day.topics.map((topic) => (
                              <li
                                key={topic.planTopicId}
                                className="flex items-baseline gap-3 text-sm"
                              >
                                <span className="min-w-0 flex-1 text-pretty text-muted-foreground">
                                  {topic.topicName}
                                </span>
                                <span className="text-metric shrink-0 text-xs text-muted-foreground">
                                  {topic.minutes}min
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </details>

                {/*
                  ⚠️ SOME QUANDO O "VER POR DIA" ESTÁ ABERTO.

                  As duas visões mostram o mesmo conteúdo, uma agrupada por dia
                  e outra somada na semana. Abertas juntas, a cliente lia a
                  lista por dia e logo abaixo os mesmos assuntos de novo: "no
                  final ele se mistura com os conteúdos novamente".

                  É CSS puro (`details[open] ~ &`) e não estado de React: a
                  alternativa exigiria transformar cada semana em componente de
                  cliente para guardar um booleano que o próprio `<details>` já
                  guarda.
                */}
                <ul className="flex flex-col gap-1.5 [details[open]~&]:hidden">
                  {week.topics.map((topic) => (
                    <li
                      key={topic.planTopicId}
                      className="flex items-baseline gap-3 text-sm"
                    >
                      <span className="min-w-0 flex-1 text-pretty text-foreground">
                        {topic.topicName}
                      </span>
                      <span className="text-metric shrink-0 text-xs text-muted-foreground">
                        {topic.minutes}min
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      )}

      {/*
        ⚠️ POR QUE O CRONOGRAMA ACABA ANTES DA PROVA.

        As semanas param quando o conteúdo pendente acaba — semanas vazias só
        poluiriam a tela. Só que, sem dizer isso, mudar a data da prova parece
        não fazer efeito: a cliente adiou a prova, viu o mesmo último dia e
        concluiu que o cronograma não atualizou.

        A linha só aparece quando há folga de verdade, e diz o que fazer com
        ela.
      */}
      {/*
        ⚠️ SÓ COM FOLGA DE UMA SEMANA PARA CIMA.

        Com a distribuição espalhando o conteúdo até a prova, a sobra costuma
        ser de um ou dois dias — resto da divisão por semana. "Sobra 1 dia para
        revisar e aprofundar" é verdade e não serve para nada; abaixo de uma
        semana não há o que planejar com o tempo que ficou.
      */}
      {schedule.weeks.length > 0 && schedule.hasExamDate && sobra >= 7 ? (
        <p className="text-sm text-pretty text-muted-foreground">
          O conteúdo que falta termina em{" "}
          <span className="text-foreground">{formatDay(ultimoDia)}</span>, antes
          da sua prova. {sobra === 1 ? "Sobra 1 dia" : `Sobram ${sobra} dias`} para
          revisar e aprofundar — e o cronograma se estende sozinho se você
          acrescentar assuntos ou atrasar algum estudo.
        </p>
      ) : null}

    </div>
  );
}

function formatHours(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1).replace(".", ",")}h`;
}

/** "Seg, 01/09" — o dia da semana importa mais que a data no cronograma. */
function formatDay(date: string): string {
  const format = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
  const texto = format.format(new Date(`${date}T12:00:00Z`));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatRange(start: string, end: string): string {
  const format = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
  return `${format.format(new Date(`${start}T12:00:00Z`))} – ${format.format(new Date(`${end}T12:00:00Z`))}`;
}
