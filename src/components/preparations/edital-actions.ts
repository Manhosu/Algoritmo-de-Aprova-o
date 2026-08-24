"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";

import { requireApiUser } from "@/server/auth/guards";
import { MAX_EDITAL_BYTES, receiveEdital, runExtraction } from "@/server/preparations/edital";

export type EditalUploadState = {
  status: "idle" | "error";
  message?: string;
};

/**
 * Recebe o PDF do edital e devolve o controle ao aluno IMEDIATAMENTE.
 *
 * A leitura pela IA leva de trinta segundos a alguns minutos. Segurar a
 * requisição por todo esse tempo entrega uma tela branca e, com sorte, um
 * timeout do navegador — o aluno reenviaria o arquivo achando que falhou, e
 * pagaríamos duas leituras.
 *
 * `after()` roda o trabalho pesado DEPOIS que a resposta foi enviada, dentro da
 * mesma invocação. Não é fila de verdade: se o processo morrer no meio, a
 * extração fica em `running` e ninguém a retoma. É uma limitação conhecida e
 * aceita para o Marco 1 — a operação acontece uma vez por preparação, o arquivo
 * já está guardado, e a tela oferece reenviar. Uma fila de verdade (Inngest,
 * QStash) é o próximo passo se a taxa de falha justificar.
 */
export async function uploadEditalAction(
  _prev: EditalUploadState,
  formData: FormData,
): Promise<EditalUploadState> {
  const session = await requireApiUser();

  const preparationId = String(formData.get("preparacaoId") ?? "");
  const file = formData.get("arquivo");

  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Escolha o arquivo PDF do edital." };
  }

  // Barreira antes de materializar o arquivo em memória: um upload de 200 MB
  // não deve virar um Buffer de 200 MB só para ser rejeitado em seguida.
  if (file.size > MAX_EDITAL_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      status: "error",
      message: `O arquivo tem ${mb} MB e o limite é 25 MB. Envie apenas as páginas do conteúdo programático.`,
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  const result = await receiveEdital({
    preparationId,
    userId: session.user.id,
    fileName: file.name,
    bytes,
  });

  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  after(async () => {
    await runExtraction(result.extractionId);
  });

  revalidatePath(`/preparacoes/${preparationId}/edital`);
  return { status: "idle" };
}
