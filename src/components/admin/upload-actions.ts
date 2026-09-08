"use server";

import { ehTipoAceito } from "@/modules/uploads/rules";
import { requireAdmin } from "@/server/auth/guards";
import {
  confirmContentUpload,
  prepareContentUpload,
  type ConfirmUploadResult,
  type PrepareUploadResult,
} from "@/server/admin/uploads";

/** ⚠️ Arquivo `"use server"`: só exporta `async function`. Tipo é apagado. */

/**
 * Pede autorização para gravar UM arquivo no acervo.
 *
 * ⚠️ `requireAdmin` aqui não é formalidade.
 *
 * Toda Server Action exportada é um ENDEREÇO PÚBLICO — o React gera uma rota
 * para ela e qualquer pessoa pode chamá-la com os argumentos que quiser. Sem
 * esta linha, um visitante qualquer conseguiria uma URL de escrita no bucket
 * que a cliente paga.
 */
export async function prepareUploadAction(input: {
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  folder?: "acervo" | "loja";
}): Promise<PrepareUploadResult> {
  await requireAdmin();

  return prepareContentUpload({
    fileName: String(input.fileName ?? "").slice(0, 260),
    mimeType: input.mimeType ? String(input.mimeType).slice(0, 120) : null,
    sizeBytes: Number(input.sizeBytes) || 0,
    folder: input.folder === "loja" ? "loja" : "acervo",
  });
}

/** Confere pelos bytes o que o navegador acabou de gravar. */
export async function confirmUploadAction(input: {
  storagePath: string;
  expected: string;
}): Promise<ConfirmUploadResult> {
  await requireAdmin();

  const esperado = String(input.expected ?? "");
  if (!ehTipoAceito(esperado)) {
    return { ok: false, message: "Formato não aceito." };
  }

  return confirmContentUpload({
    storagePath: String(input.storagePath ?? ""),
    expected: esperado,
  });
}
