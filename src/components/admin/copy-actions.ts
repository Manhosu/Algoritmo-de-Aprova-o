"use server";

import { requireAdmin } from "@/server/auth/guards";
import { publishLandingCopy, restoreLandingVersion } from "@/server/content/landing";

/**
 * ⚠️ ARQUIVO `"use server"`: SÓ PODE EXPORTAR `async function`.
 *
 * Exportar uma constante daqui compila, passa no lint e quebra a tela em tempo
 * de execução — foi o que derrubou Configurações uma vez. Tipo compartilhado
 * vai em outro arquivo.
 */

export type CopyFormState = {
  ok: boolean;
  message?: string;
  problems?: string[];
};

/**
 * Publica a copy vinda do formulário.
 *
 * O formulário manda campos planos com o CAMINHO no nome — `hero.titleLine1`,
 * `mockup.tasks.0.value`. Aqui eles voltam a ser um objeto, que é o formato do
 * schema.
 *
 * Reconstruir em vez de mandar JSON num campo escondido é o que permite ao
 * navegador manter o formulário preenchido quando a validação recusa: o estado
 * continua sendo o dos inputs, não uma cópia paralela que sai de sincronia.
 */
export async function publishCopyAction(
  _prev: CopyFormState,
  formData: FormData,
): Promise<CopyFormState> {
  const session = await requireAdmin();

  const objeto: Record<string, unknown> = {};

  for (const [chave, valor] of formData.entries()) {
    if (chave === "note" || typeof valor !== "string") continue;
    atribuir(objeto, chave.split("."), valor);
  }

  const resultado = await publishLandingCopy({
    content: objeto,
    userId: session.user.id,
    note: (formData.get("note") as string | null) ?? null,
  });

  if (!resultado.ok) {
    return {
      ok: false,
      message: "Alguns textos precisam de ajuste antes de publicar.",
      problems: resultado.problems,
    };
  }

  return {
    ok: true,
    message: `Publicado. Esta é a versão ${resultado.version}, e já está no ar.`,
  };
}

/**
 * Volta o site para uma versão anterior.
 *
 * A versão vem num campo escondido do formulário, e não presa por `bind`: com
 * `bind` os dois últimos parâmetros ficariam sem uso, e a assinatura passaria a
 * destoar de todas as outras ações do projeto, que leem do `FormData`.
 */
export async function restoreCopyAction(
  _prev: CopyFormState,
  formData: FormData,
): Promise<CopyFormState> {
  const session = await requireAdmin();

  const version = Number(formData.get("version"));
  if (!Number.isInteger(version) || version < 1) {
    return { ok: false, message: "Versão inválida." };
  }

  const resultado = await restoreLandingVersion({ version, userId: session.user.id });

  return resultado.ok
    ? { ok: true, message: `Voltamos para o texto da versão ${version}. Já está no ar.` }
    : { ok: false, message: "Não consegui voltar para essa versão.", problems: resultado.problems };
}

/**
 * Escreve `valor` no caminho dado, criando o que faltar.
 *
 * Um segmento que é número vira índice de lista — é assim que
 * `mockup.tasks.0.value` volta a ser um array. `"true"`/`"false"` viram
 * booleano, porque o `done` do painel de exemplo é uma caixa de seleção e o
 * schema espera booleano de verdade.
 */
function atribuir(alvo: Record<string, unknown>, caminho: string[], valor: string): void {
  let atual: Record<string, unknown> | unknown[] = alvo;

  for (let i = 0; i < caminho.length - 1; i += 1) {
    const chave = caminho[i];
    const proximaEhIndice = /^\d+$/.test(caminho[i + 1]);
    const container = atual as Record<string, unknown>;

    container[chave] ??= proximaEhIndice ? [] : {};
    atual = container[chave] as Record<string, unknown> | unknown[];
  }

  const ultima = caminho[caminho.length - 1];
  const destino = atual as Record<string, unknown>;

  destino[ultima] = valor === "true" ? true : valor === "false" ? false : valor;
}
