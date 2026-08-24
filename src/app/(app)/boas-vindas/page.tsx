import { CalendarClock } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AvailabilityForm } from "@/components/onboarding/availability-form";
import { Surface } from "@/components/shared/surface";
import { requireUser } from "@/server/auth/guards";
import { getAvailability } from "@/server/preparations/availability";

export const metadata: Metadata = { title: "Quanto tempo você tem?" };

/**
 * Disponibilidade de estudo — primeiro passo depois do cadastro, e também a
 * tela de ajuste depois.
 *
 * A cliente pediu tempo de estudo e dias da semana "no cadastro do perfil".
 * Ficou aqui, e não no formulário de criar conta, porque aquela é a tela onde
 * mais se perde gente — cada campo a mais custa conversão. Perguntar a quem já
 * criou a conta tem taxa de resposta muito melhor que perguntar a quem ainda
 * está decidindo se entra.
 *
 * OS DOIS MODOS
 * ----------------------------------------------------------------------------
 * Sem `?editar=1`, quem já preencheu é mandado para a Home: no onboarding, a
 * tela existe para ser vencida uma vez.
 *
 * Com `?editar=1`, ela abre sempre. Esse modo existe porque a Home precisa
 * poder dizer "hoje é seu dia de folga — ajuste se mudou de ideia", e sem ele
 * aquele botão levaria a um redirecionamento de volta para a própria Home. Um
 * link que não vai a lugar nenhum é pior que a ausência do link.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ editar?: string }>;
}) {
  const { editar } = await searchParams;
  const isEditing = editar === "1";

  const session = await requireUser(
    isEditing ? "/boas-vindas?editar=1" : "/boas-vindas",
  );
  const availability = await getAvailability(session.user.id);
  const alreadyAnswered = availability.some((day) => day.minutesAvailable > 0);

  if (alreadyAnswered && !isEditing) redirect("/inicio");

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
          {isEditing
            ? "Quanto tempo você tem?"
            : firstName
              ? `Boas-vindas, ${firstName}!`
              : "Boas-vindas!"}
        </h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          {isEditing
            ? "Mudou sua rotina? Ajuste os dias e o tempo. Seu cronograma é refeito na hora."
            : "Antes de montar seu plano, precisamos saber quanto tempo você tem. É o que impede o sistema de te entregar oito horas de estudo num dia em que você tem uma."}
        </p>
      </div>

      <Surface className="p-5 sm:p-6">
        <AvailabilityForm
          initial={availability}
          submitLabel={isEditing ? "Salvar alterações" : "Salvar e continuar"}
        />
      </Surface>
    </div>
  );
}
