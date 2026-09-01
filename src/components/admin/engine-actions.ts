"use server";

import { revalidatePath } from "next/cache";

import { engineFormPayload } from "@/modules/engine-config/form-payload";
import type { EngineConfigKind } from "@/modules/engine-config/schemas";
import { requireAdmin } from "@/server/auth/guards";
import { publishEngineConfig } from "@/server/engine/publish-config";

/** ⚠️ Arquivo `"use server"`: só exporta `async function`. Tipo é apagado. */

export type EngineFormState = {
  ok: boolean;
  message?: string;
  problems?: string[];
};

/**
 * Publica pesos do Motor 1 ou valores de XP.
 *
 * A leitura do formulário fica em `engineFormPayload`, que é puro e testado —
 * inclusive contra os campos internos que o React injeta na Server Action, que
 * foi o que quebrou o primeiro envio real.
 *
 * A VALIDAÇÃO REAL é do schema Zod, em `publishEngineConfig`: ele é quem sabe
 * que os cinco pesos somam 100 e que o bônus de acerto não pode ser zero, e é
 * ele que o motor consulta. Repetir essas regras aqui criaria uma segunda
 * fonte, que um dia discordaria da primeira.
 */
export async function publishEngineConfigAction(
  kind: EngineConfigKind,
  _prev: EngineFormState,
  formData: FormData,
): Promise<EngineFormState> {
  const session = await requireAdmin();

  const lido = engineFormPayload(kind, formData);
  if (!lido.ok) return { ok: false, message: lido.message };

  const resultado = await publishEngineConfig({
    kind,
    payload: lido.payload,
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

  /**
   * ⚠️ SEM ISTO A TELA MENTE.
   *
   * `force-dynamic` faz a página ser montada a cada requisição, mas a Server
   * Action não é uma requisição nova: o React reaproveita a árvore que já está
   * na tela. O primeiro teste publicou a versão 2 e o cabeçalho continuou
   * dizendo "No ar: versão 1", com o histórico ainda em uma entrada.
   *
   * Quem publica e não vê o número mudar conclui que não funcionou — e publica
   * de novo, criando versões repetidas.
   */
  revalidatePath("/admin/algoritmo");

  return {
    ok: true,
    message: `Publicado. Versão ${resultado.version}, valendo a partir de agora.`,
  };
}
