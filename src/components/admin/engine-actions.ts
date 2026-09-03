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

/**
 * Publica os intervalos do Motor 2 — a periodicidade das revisões.
 *
 * ⚠️ AÇÃO PRÓPRIA, e não o `EngineForm` genérico.
 *
 * Aquele formulário edita configuração PLANA de números, e `review_intervals` é
 * um array. Forçá-lo a caber ali exigiria um campo por posição com nomes
 * inventados, e a regra que importa — os intervalos serem estritamente
 * crescentes — não teria onde morar.
 *
 * A conferência de verdade continua no schema Zod: é ele que recusa
 * "1, 7, 5, 60" com a mensagem que explica por que uma curva do esquecimento
 * não anda para trás.
 */
export async function publishReviewIntervalsAction(
  _prev: EngineFormState,
  formData: FormData,
): Promise<EngineFormState> {
  const session = await requireAdmin();

  const bruto = formData.get("intervals");
  if (typeof bruto !== "string") {
    return { ok: false, message: "Informe os intervalos." };
  }

  /*
    Aceita vírgula, ponto e vírgula ou espaço como separador. Quem digita
    "1, 7, 30" e quem digita "1 7 30" quer a mesma coisa, e recusar um dos dois
    seria exigir que a pessoa adivinhe o formato.
  */
  const numeros = bruto
    .split(/[,;\s]+/)
    .map((parte) => parte.trim())
    .filter(Boolean)
    .map(Number);

  if (numeros.length === 0 || numeros.some((n) => !Number.isInteger(n))) {
    return {
      ok: false,
      message: "Use números inteiros de dias, separados por vírgula. Ex.: 1, 7, 30, 60, 90",
    };
  }

  const resultado = await publishEngineConfig({
    kind: "review_intervals",
    payload: {
      intervalsInDays: numeros,
      /*
        As duas decisões de comportamento ficam como estão: a cliente pediu para
        editar a PERIODICIDADE, e mudar "conta a partir da execução real" ou
        "desempenho ruim reinicia o ciclo" muda o significado da métrica de
        aderência. São decisões de produto, não de calibração.
      */
      countNextFromCompletion: true,
      resetCycleOnPoorPerformance: false,
    },
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

  revalidatePath("/admin/algoritmo");

  return {
    ok: true,
    message: `Publicado. Versão ${resultado.version}: revisões em ${numeros.join(", ")} dias.`,
  };
}
