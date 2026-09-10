"use server";

import { requireAdmin } from "@/server/auth/guards";
import { publishLandingCopy, restoreLandingVersion } from "@/server/content/landing";

import { remontar } from "./copy-fields";

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
 * `pains.items.0` — e `remontar` devolve o objeto que o schema espera. A
 * remontagem mora em `copy-fields.ts`, junto da árvore que gera os campos, para
 * que o teste confira as duas pontas com o mesmo código que roda aqui.
 */
export async function publishCopyAction(
  _prev: CopyFormState,
  formData: FormData,
): Promise<CopyFormState> {
  const session = await requireAdmin();

  const resultado = await publishLandingCopy({
    content: remontar(formData.entries()),
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
