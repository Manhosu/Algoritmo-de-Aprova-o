/**
 * Dias da semana e formatação de tempo.
 *
 * ⚠️ ESTE ARQUIVO EXISTE PARA NÃO ARRASTAR O BANCO PARA O NAVEGADOR.
 *
 * Estas constantes estavam em `src/server/preparations/availability.ts`. O
 * formulário de disponibilidade — um Client Component — importava
 * `WEEKDAY_LABELS` de lá, e isso puxava o módulo INTEIRO para o bundle do
 * cliente, incluindo `@/server/db` e o driver `postgres`. O resultado foi
 * `Module not found: Can't resolve 'tls'` e HTTP 500 em toda a área do aluno.
 *
 * Importar só um tipo seria seguro (`import type` é apagado na compilação).
 * Importar um VALOR não é: ele precisa existir em runtime, e o bundler segue o
 * arquivo inteiro.
 *
 * Regra que fica: constante compartilhada entre servidor e cliente mora em
 * `src/lib`, nunca em `src/server`.
 *
 * weekday: 0 = domingo … 6 = sábado (mesma convenção de `Date.getDay()`).
 */

export type DayAvailability = { weekday: number; minutesAvailable: number };

export const WEEKDAY_LABELS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

/** Iniciais para os pontinhos do card de sequência: S T Q Q S S D. */
export const WEEKDAY_SHORT = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

export function totalWeeklyMinutes(days: DayAvailability[]): number {
  return days.reduce((sum, day) => sum + Math.max(0, day.minutesAvailable), 0);
}

/** "5h30", "45min", "2h" — usado no resumo da tela. */
export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}min`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h${String(rest).padStart(2, "0")}`;
}
