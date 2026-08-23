"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useState } from "react";

import { FormError } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WEEKDAY_LABELS, type DayAvailability } from "@/lib/weekdays";

import { saveAvailabilityAction, type AvailabilityState } from "./actions";

const INITIAL: AvailabilityState = { status: "idle" };

/**
 * Quanto tempo o aluno tem para estudar, por dia da semana.
 *
 * Sem isto o Motor 1 não sabe QUANTO cabe num dia e entrega 8 horas de tarefa
 * para quem estuda 2 — o jeito mais rápido de alguém abandonar na primeira
 * semana.
 *
 * A UI é de toque, não de digitação: no celular, um campo numérico para cada um
 * dos sete dias seria sete teclados abrindo e fechando. Os botões de tempo
 * comum resolvem a maioria dos casos com um toque por dia.
 */

const PRESETS = [0, 30, 60, 90, 120, 180, 240] as const;

export function AvailabilityForm({
  initial,
  submitLabel = "Salvar e continuar",
}: {
  initial: DayAvailability[];
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(saveAvailabilityAction, INITIAL);
  const [days, setDays] = useState<DayAvailability[]>(initial);

  const total = days.reduce((sum, day) => sum + day.minutesAvailable, 0);
  const activeDays = days.filter((day) => day.minutesAvailable > 0).length;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="dias" value={JSON.stringify(days)} />

      {state.status === "error" ? <FormError>{state.message}</FormError> : null}

      <ul className="flex flex-col gap-3">
        {days.map((day) => (
          <li key={day.weekday} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-foreground">
                {WEEKDAY_LABELS[day.weekday]}
              </span>
              <span
                className={cn(
                  "text-metric text-xs",
                  day.minutesAvailable > 0 ? "text-primary" : "text-muted-foreground",
                )}
              >
                {day.minutesAvailable === 0 ? "não estudo" : label(day.minutesAvailable)}
              </span>
            </div>

            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label={`Tempo de estudo em ${WEEKDAY_LABELS[day.weekday]}`}
            >
              {PRESETS.map((minutes) => {
                const selected = day.minutesAvailable === minutes;
                return (
                  <button
                    key={minutes}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      setDays((current) =>
                        current.map((d) =>
                          d.weekday === day.weekday ? { ...d, minutesAvailable: minutes } : d,
                        ),
                      )
                    }
                    className={cn(
                      // 44px de altura: alvo de toque confortável no celular.
                      "min-h-11 rounded-lg border px-3 text-sm transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      selected
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {minutes === 0 ? "—" : label(minutes)}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

      <div className="rounded-xl border border-border bg-surface/40 px-4 py-3">
        <p className="text-sm text-muted-foreground">
          {activeDays === 0 ? (
            "Escolha pelo menos um dia para estudar."
          ) : (
            <>
              <span className="text-metric text-foreground">{label(total)}</span> por semana,
              em {activeDays} {activeDays === 1 ? "dia" : "dias"}.
            </>
          )}
        </p>
      </div>

      <Button type="submit" size="lg" disabled={pending || activeDays === 0}>
        {pending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            Salvando…
          </>
        ) : (
          submitLabel
        )}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Dá para mudar isso quando quiser. Toda alteração refaz seu cronograma.
      </p>
    </form>
  );
}

function label(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${Math.floor(hours)}h${minutes % 60}`;
}
