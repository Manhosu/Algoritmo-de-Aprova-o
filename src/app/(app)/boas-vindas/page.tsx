import { CalendarClock } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AvailabilityForm } from "@/components/onboarding/availability-form";
import { Surface } from "@/components/shared/surface";
import { requireUser } from "@/server/auth/guards";
import { getAvailability } from "@/server/preparations/availability";

export const metadata: Metadata = { title: "Quanto tempo você tem?" };

/**
 * Primeiro passo depois do cadastro.
 *
 * A cliente pediu tempo de estudo e dias da semana "no cadastro do perfil".
 * Ficou aqui, e não no formulário de criar conta, porque aquela é a tela onde
 * mais se perde gente — cada campo a mais custa conversão. Perguntar a quem já
 * criou a conta tem taxa de resposta muito melhor que perguntar a quem ainda
 * está decidindo se entra.
 */
export default async function WelcomePage() {
  const session = await requireUser("/boas-vindas");
  const availability = await getAvailability(session.user.id);

  // Quem já preencheu não precisa passar por aqui de novo.
  if (availability.some((day) => day.minutesAvailable > 0)) redirect("/inicio");

  const firstName = session.user.name?.trim().split(/\s+/)[0];

  return (
    <div className="mx-auto w-full max-w-lg py-4">
      <div className="mb-6 text-center">
        <span
          className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl border border-primary/40 bg-primary-soft text-primary"
          aria-hidden
        >
          <CalendarClock className="size-6" />
        </span>

        <h1 className="text-2xl font-bold text-balance text-foreground">
          {firstName ? `Boas-vindas, ${firstName}!` : "Boas-vindas!"}
        </h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          Antes de montar seu plano, precisamos saber quanto tempo você tem. É o que
          impede o sistema de te entregar oito horas de estudo num dia em que você
          tem uma.
        </p>
      </div>

      <Surface className="p-5 sm:p-6">
        <AvailabilityForm initial={availability} />
      </Surface>
    </div>
  );
}
