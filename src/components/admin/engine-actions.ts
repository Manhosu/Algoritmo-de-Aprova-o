"use server";

import { requireAdmin } from "@/server/auth/guards";
import { publishEngineConfig } from "@/server/engine/publish-config";
import type { EngineConfigKind } from "@/modules/engine-config/schemas";

/** ⚠️ Arquivo `"use server"`: só exporta `async function`. Tipo é apagado. */

export type EngineFormState = {
  ok: boolean;
  message?: string;
  problems?: string[];
};

/**
 * Publica pesos do Motor 1 ou valores de XP.
 *
 * Os campos chegam como texto e viram número aqui. A VALIDAÇÃO REAL é do
 * schema Zod, em `publishEngineConfig` — ele é quem sabe que os cinco pesos
 * precisam somar 100 e que o bônus de acerto não pode ser zero, e é ele que o
 * motor consulta. Repetir essas regras na tela criaria uma segunda fonte, que
 * um dia discordaria da primeira.
 */
export async function publishEngineConfigAction(
  kind: EngineConfigKind,
  _prev: EngineFormState,
  formData: FormData,
): Promise<EngineFormState> {
  const session = await requireAdmin();

  const payload: Record<string, number> = {};

  for (const [chave, valor] of formData.entries()) {
    if (chave === "note" || typeof valor !== "string") continue;

    const numero = Number(valor.replace(",", "."));
    if (Number.isNaN(numero)) {
      return { ok: false, message: `"${valor}" não é um número.` };
    }
    payload[chave] = numero;
  }

  const resultado = await publishEngineConfig({
    kind,
    payload,
    userId: session.user.id,
    note: (formData.get("note") as string | null) ?? null,
  });

  if (!resultado.ok) {
    return {
      ok: false,
      message: "A configuração não passou na conferência.",
      problems: resultado.problems,
    };
  }

  return {
    ok: true,
    message: `Publicado. Versão ${resultado.version}, valendo a partir de agora.`,
  };
}
