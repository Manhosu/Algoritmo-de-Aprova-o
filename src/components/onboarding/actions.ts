"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireApiUser } from "@/server/auth/guards";
import { saveAvailability } from "@/server/preparations/availability";

export type AvailabilityState =
  | { status: "idle" }
  | { status: "error"; message: string };

const daysSchema = z
  .array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      minutesAvailable: z.number().int().min(0).max(1440),
    }),
  )
  .length(7);

/**
 * Salva a disponibilidade de estudo.
 *
 * ⚠️ A validação é feita AQUI, no servidor. Os botões da tela são conveniência:
 * qualquer pessoa pode enviar o formulário com o campo escondido alterado, e o
 * banco tem CHECK garantindo 0–1440 por dia — mas devolver erro legível é
 * melhor que deixar o Postgres recusar com mensagem técnica.
 */
export async function saveAvailabilityAction(
  _prev: AvailabilityState,
  formData: FormData,
): Promise<AvailabilityState> {
  const session = await requireApiUser();

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(formData.get("dias") ?? "[]"));
  } catch {
    return { status: "error", message: "Não foi possível ler os dias informados." };
  }

  const result = daysSchema.safeParse(parsed);
  if (!result.success) {
    return { status: "error", message: "Informe o tempo de estudo dos sete dias." };
  }

  const total = result.data.reduce((sum, day) => sum + day.minutesAvailable, 0);
  if (total === 0) {
    return {
      status: "error",
      message: "Escolha pelo menos um dia com tempo de estudo.",
    };
  }

  await saveAvailability(session.user.id, result.data);

  redirect("/inicio");
}
