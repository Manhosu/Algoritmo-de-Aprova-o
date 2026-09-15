import { CalendarCheck, RotateCcw } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ReviewCard } from "@/components/reviews/review-card";
import { PendingStep } from "@/components/shared/pending-step";
import { EmptyState, Metric, Surface } from "@/components/shared/surface";
import { LOGIN_ROUTE } from "@/config/routes";
import { nextStep } from "@/modules/onboarding/next-step";
import { textoDoCiclo } from "@/modules/review/cycle-text";
import { getStudentContext } from "@/server/auth/current-user";
import { getActiveConfig } from "@/server/engine/config";
import { getReviewsToday } from "@/server/engine/review";

export const metadata: Metadata = { title: "Revisões" };

/**
 * REVISÕES PARA HOJE (README 1.7).
 *
 * A tela mostra o que vence hoje E o que venceu antes. Revisão atrasada
 * ACUMULA, não some — decisão do Eduardo. Fazer ela desaparecer por não ter
 * sido cumprida no dia certo transformaria o esquecimento em silêncio, que é o
 * problema que este motor existe para combater.
 */
export default async function ReviewsPage() {
  const context = await getStudentContext();
  if (!context) redirect(LOGIN_ROUTE);

  /*
    Sem plano montado não existe revisão nenhuma, e a tela dizia isso de um
    jeito que não ajudava: "as revisões nascem quando você conclui um estudo".
    Verdade, e sem caminho — o estudo depende do edital, que ainda não subiu.
  */
  const pendente = nextStep(context.currentPreparation);

  if (pendente) {
    return (
      <div className="mx-auto w-full max-w-2xl py-4">
        <PendingStep step={pendente} />
      </div>
    );
  }

  /*
    O ciclo vem da configuração ativa, a mesma que o motor usa para agendar
    (pedido da cliente em 15/09/2026). Escrito à mão, o texto continuava
    dizendo "7, 30, 60 e 90 dias" depois que ela mudasse a periodicidade.
  */
  const [reviews, ciclo] = await Promise.all([
    getReviewsToday({
      userId: context.user.id,
      preparationId: context.currentPreparation?.id ?? null,
    }),
    getActiveConfig("review_intervals"),
  ]);

  const late = reviews.due.filter((review) => review.isLate).length;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-4">
      <header>
        <h1 className="text-xl font-bold text-foreground">Revisões</h1>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          {textoDoCiclo(ciclo.value)}
        </p>
      </header>

      <Surface className="grid grid-cols-3 gap-y-4 py-4">
        <Metric label="Para hoje" value={String(reviews.due.length)} />
        <Metric
          label="Atrasadas"
          value={String(late)}
          hint={late > 0 ? "acumulam" : "em dia"}
          hintTone={late > 0 ? "neutral" : "positive"}
        />
        <Metric label="Aderência" value={`${reviews.adherencePercent}%`} />
      </Surface>

      {reviews.due.length === 0 ? (
        <Surface>
          <EmptyState
            icon={<CalendarCheck />}
            title="Nenhuma revisão para hoje"
            description={
              reviews.upcoming > 0
                ? `Você tem ${reviews.upcoming} ${reviews.upcoming === 1 ? "revisão marcada" : "revisões marcadas"} para os próximos 7 dias. Elas aparecem aqui no dia.`
                : "As revisões nascem quando você conclui um estudo da sua Tarefa do Dia. Comece por lá."
            }
          />
        </Surface>
      ) : (
        <>
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-[0.12em] text-foreground uppercase">
            <RotateCcw className="size-4 text-primary" aria-hidden />
            Revisar agora
          </h2>

          <ul className="flex flex-col gap-3">
            {reviews.due.map((review) => (
              <ReviewCard key={review.occurrenceId} review={review} />
            ))}
          </ul>

          {reviews.upcoming > 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              Mais {reviews.upcoming}{" "}
              {reviews.upcoming === 1 ? "revisão marcada" : "revisões marcadas"} para os
              próximos 7 dias.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
