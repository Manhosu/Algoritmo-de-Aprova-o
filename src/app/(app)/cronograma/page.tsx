import { AlertTriangle, CalendarRange, CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState, Metric, Surface } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import { LOGIN_ROUTE } from "@/config/routes";
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

  if (!preparation || preparation.status !== "active") {
    return (
      <div className="mx-auto w-full max-w-2xl py-4">
        <Surface>
          <EmptyState
            icon={<CalendarRange />}
            title="Seu cronograma aparece quando a preparação estiver pronta"
            description="Ele é montado a partir do seu edital, do seu diagnóstico e do tempo que você tem por semana."
            action={
              <Button asChild className="mt-2">
                <Link href="/inicio">Continuar de onde parei</Link>
              </Button>
            }
          />
        </Surface>
      </div>
    );
  }

  const schedule = await getSchedule({
    userId: context.user.id,
    preparationId: preparation.id,
  });

  if (!schedule) redirect("/inicio");

  const { feasibility, summary } = schedule;

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

                <ul className="flex flex-col gap-1.5">
                  {week.topics.map((topic) => (
                    <li
                      key={topic.planTopicId}
                      className="flex items-center gap-3 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate text-foreground">
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

      {feasibility.topicsAtRisk.length > 0 ? (
        <Surface className="p-4 sm:p-5">
          <p className="text-sm font-medium text-foreground">
            Não cabem antes da prova
          </p>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">
            No ritmo atual, estes assuntos ficam de fora. Eles são os de menor
            prioridade — o algoritmo protege primeiro o que mais cai e o que você
            menos domina.
          </p>
          <ul className="mt-3 flex flex-col gap-1">
            {feasibility.topicsAtRisk.slice(0, 8).map((topic) => (
              <li key={topic} className="truncate text-sm text-muted-foreground">
                · {topic}
              </li>
            ))}
          </ul>
        </Surface>
      ) : null}
    </div>
  );
}

function formatHours(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1).replace(".", ",")}h`;
}

function formatRange(start: string, end: string): string {
  const format = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
  return `${format.format(new Date(`${start}T12:00:00Z`))} – ${format.format(new Date(`${end}T12:00:00Z`))}`;
}
