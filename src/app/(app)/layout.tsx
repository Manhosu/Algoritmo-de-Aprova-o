import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { examCountdown } from "@/modules/metrics";
import type { CivilDate } from "@/modules/shared/dates";
import { getStudentContext } from "@/server/auth/current-user";
import { LOGIN_ROUTE } from "@/config/routes";

/**
 * Moldura da área do aluno.
 *
 * ⚠️ É AQUI que a autorização acontece de verdade, não no `proxy.ts`. O proxy
 * só olha se existe cookie; quem valida a sessão contra o banco é este layout,
 * que roda em toda página filha.
 *
 * `getStudentContext` é memoizado por requisição, então o cabeçalho e a página
 * consultam o mesmo dado sem ir ao banco duas vezes.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const context = await getStudentContext();
  if (!context) redirect(LOGIN_ROUTE);

  const countdown = context.currentPreparation?.examDate
    ? examCountdown(
        context.today as CivilDate,
        context.currentPreparation.examDate as CivilDate,
        context.currentPreparation.examDateIsEstimated,
      )
    : null;

  return (
    <AppShell
      userName={context.user.name}
      avatarUrl={context.user.avatarUrl}
      countdownLabel={countdown?.label ?? null}
      streakDays={context.gamification.currentStreak}
    >
      {children}
    </AppShell>
  );
}
