import "server-only";

import { eq } from "drizzle-orm";

import type { DayAvailability } from "@/lib/weekdays";
import { db } from "@/server/db";
import { userAvailability } from "@/server/db/schema";

/**
 * Disponibilidade de estudo do aluno.
 *
 * Fica no USUÁRIO, não na preparação: um aluno com dois editais não tem duas
 * horas para cada um — ele tem duas horas. O motor recebe esse orçamento e o
 * distribui entre as preparações ativas.
 *
 * ⚠️ Rótulos e formatação de tempo NÃO moram aqui, e sim em `@/lib/weekdays`.
 * Este arquivo importa o banco; qualquer Client Component que puxasse um valor
 * daqui arrastaria o driver `postgres` para o navegador — foi exatamente o que
 * aconteceu e derrubou a área do aluno com HTTP 500.
 */

export type { DayAvailability };

export async function getAvailability(userId: string): Promise<DayAvailability[]> {
  const rows = await db.query.userAvailability.findMany({
    where: (t, { eq: e }) => e(t.userId, userId),
    columns: { weekday: true, minutesAvailable: true },
  });

  const byWeekday = new Map(rows.map((row) => [row.weekday, row.minutesAvailable]));

  // Sempre devolve os 7 dias, mesmo os nunca preenchidos — a tela precisa
  // desenhar a semana inteira, não só o que já existe.
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    minutesAvailable: byWeekday.get(weekday) ?? 0,
  }));
}

/**
 * Grava a semana inteira de uma vez.
 *
 * Substituir tudo, em vez de aplicar diferenças, evita um estado impossível:
 * uma semana salva pela metade porque a requisição caiu no meio.
 */
export async function saveAvailability(
  userId: string,
  days: DayAvailability[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(userAvailability).where(eq(userAvailability.userId, userId));

    const rows = days
      .filter((day) => day.minutesAvailable > 0)
      .map((day) => ({
        userId,
        weekday: day.weekday,
        minutesAvailable: Math.min(1440, Math.max(0, Math.round(day.minutesAvailable))),
      }));

    if (rows.length > 0) {
      await tx.insert(userAvailability).values(rows);
    }
  });
}
