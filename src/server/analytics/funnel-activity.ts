import "server-only";

import { eq, sql } from "drizzle-orm";

import { APP_TIMEZONE } from "@/config/app";
import { db } from "@/server/db";
import { userFunnelProgress } from "@/server/db/schema";
import { toCivilDate } from "@/modules/shared/dates";

/**
 * RETENÇÃO E MONETIZAÇÃO DO FUNIL.
 * ============================================================================
 *
 * `markFunnelStage` (em `preparations/service.ts`) carimba os degraus de
 * ATIVAÇÃO — cada um chamado do lugar onde aquele degrau acontece. Este arquivo
 * cuida do que não é degrau: dia ativo, retorno, tarefa concluída e limite do
 * plano gratuito batido.
 *
 * ⚠️ TUDO EM UM ÚNICO `UPDATE`, com `CASE` e `COALESCE`.
 *
 * Ler a linha, decidir em JavaScript e gravar de volta parece mais claro e é
 * errado: duas respostas simultâneas leriam o mesmo `active_days_count` e a
 * segunda sobrescreveria a primeira. Pior no retorno D+1, que compara a data de
 * hoje com a do cadastro — duas abas abertas gravariam o mesmo dia duas vezes.
 * Deixando a decisão dentro do `UPDATE`, o Postgres resolve com a linha travada
 * e a operação vira idempotente de graça.
 */
export async function recordFunnelActivity(input: {
  userId: string;
  now: Date;
  /** Uma tarefa do dia foi concluída agora. */
  completedTask?: boolean;
  /** O aluno bateu no teto diário do plano gratuito agora. */
  reachedFreeLimit?: boolean;
}): Promise<void> {
  const { userId, now } = input;
  const hoje = toCivilDate(now, APP_TIMEZONE);
  const agora = now.toISOString();

  /*
    `dia_novo` é a condição que separa "voltou" de "continuou na mesma sessão".
    Comparar `last_active_date` com a data CIVIL de hoje (no fuso do produto, não
    em UTC) é o que faz alguém estudando às 22h de Brasília contar como o dia de
    hoje, e não como o de amanhã.
  */
  const diaNovo = sql`(${userFunnelProgress.lastActiveDate} is distinct from ${hoje}::date)`;

  await db
    .update(userFunnelProgress)
    .set({
      lastActiveDate: hoje,

      activeDaysCount: sql`${userFunnelProgress.activeDaysCount} + case when ${diaNovo} then 1 else 0 end`,

      /*
        D+1: qualquer atividade em dia civil posterior ao do cadastro. Não é
        "exatamente um dia depois" — quem volta no terceiro dia também voltou, e
        exigir o dia seguinte exato transformaria a métrica de retenção numa
        medida de sorte de calendário.
      */
      returnedNextDayAt: sql`coalesce(
        ${userFunnelProgress.returnedNextDayAt},
        case
          when ${hoje}::date > (${userFunnelProgress.signedUpAt} at time zone ${APP_TIMEZONE})::date
          then ${agora}::timestamptz
        end
      )`,

      /* Segunda semana: entre 7 e 20 dias depois do cadastro. */
      returnedWeekTwoAt: sql`coalesce(
        ${userFunnelProgress.returnedWeekTwoAt},
        case
          when ${hoje}::date >= (${userFunnelProgress.signedUpAt} at time zone ${APP_TIMEZONE})::date + 7
           and ${hoje}::date <= (${userFunnelProgress.signedUpAt} at time zone ${APP_TIMEZONE})::date + 20
          then ${agora}::timestamptz
        end
      )`,

      completedTasksCount: input.completedTask
        ? sql`${userFunnelProgress.completedTasksCount} + 1`
        : userFunnelProgress.completedTasksCount,

      /*
        O limite do Free é o instante de maior intenção de assinar. O primeiro
        carimbo nunca muda; a contagem sobe sempre, porque bater no teto cinco
        vezes na semana diz algo que bater uma vez não diz.
      */
      freeLimitFirstReachedAt: input.reachedFreeLimit
        ? sql`coalesce(${userFunnelProgress.freeLimitFirstReachedAt}, ${agora}::timestamptz)`
        : userFunnelProgress.freeLimitFirstReachedAt,

      freeLimitReachCount: input.reachedFreeLimit
        ? sql`${userFunnelProgress.freeLimitReachCount} + 1`
        : userFunnelProgress.freeLimitReachCount,
    })
    .where(eq(userFunnelProgress.userId, userId));
}
