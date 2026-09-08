import "server-only";

import { randomUUID } from "node:crypto";

import { identifyMedia } from "@/server/import/media";
import {
  createContentUploadUrl,
  deleteContentFile,
  probeContentFile,
  type ContentMimeType,
} from "@/server/storage";
import { ehTipoAceito, motivoDaRecusa, tipoDeclarado } from "@/modules/uploads/rules";

/**
 * UPLOAD DE ARQUIVO PELO PAINEL (pedido da cliente em 08/09/2026).
 * ============================================================================
 *
 * Palavras dela: "Ao invés de endereço do material poderia ser um botão para
 * fazer upload? Facilitaria bastante". E, no mesmo recado: "Tentei cadastrar um
 * vídeo do Mind X, mas não deu certo".
 *
 * ⚠️ O ENDEREÇO NÃO ERA UMA ALTERNATIVA PIOR: PARA VÍDEO, ELE NÃO FUNCIONA.
 *
 * Um link de compartilhamento do Google Drive devolve uma PÁGINA HTML com o
 * visualizador do Drive dentro, não o arquivo. A tag `<video>` do navegador
 * recebe HTML onde esperava MP4 e não toca nada — sem erro visível, o vídeo
 * simplesmente não começa. Não havia como acertar esse cadastro pelo campo de
 * endereço, e é por isso que o upload virou requisito e não conforto.
 *
 * O FLUXO TEM DUAS ETAPAS, e a segunda é a que garante a segurança
 * ----------------------------------------------------------------------------
 *   1. `prepareContentUpload` confere o que foi declarado e devolve uma URL
 *      assinada para UM caminho.
 *   2. O navegador grava direto no bucket.
 *   3. `confirmContentUpload` baixa os primeiros bytes e pergunta o que aquilo
 *      é DE VERDADE. Se não bater, apaga.
 *
 * A etapa 3 existe porque, no upload direto, o servidor nunca vê os bytes
 * passando. Sem ela, o `Content-Type` declarado pelo navegador seria a única
 * palavra sobre o conteúdo — e ele é um campo de texto que qualquer cliente
 * escolhe. Alguém poderia guardar um HTML no bucket com nome de vídeo.
 */

export type PrepareUploadInput = {
  fileName: string;
  /** O que o navegador declarou. Não é prova de nada; é ponto de partida. */
  mimeType: string | null;
  sizeBytes: number;
  /** `loja` separa a imagem do item da loja do material de estudo. */
  folder?: "acervo" | "loja";
};

export type PrepareUploadResult =
  | { ok: true; uploadUrl: string; storagePath: string; mimeType: ContentMimeType }
  | { ok: false; message: string };

export async function prepareContentUpload(
  input: PrepareUploadInput,
): Promise<PrepareUploadResult> {
  const tipo = tipoDeclarado({ mimeType: input.mimeType, fileName: input.fileName });
  const recusa = motivoDaRecusa({ tipo, sizeBytes: input.sizeBytes });

  if (recusa || !tipo) return { ok: false, message: recusa ?? "Arquivo inválido." };

  if (input.folder === "loja" && !tipo.startsWith("image/")) {
    return { ok: false, message: "A imagem do item precisa ser PNG ou JPG." };
  }

  /*
    ⚠️ O NOME NO BUCKET É SORTEADO, e não o nome do arquivo dela.

    "Português - Crase.mp4" tem espaço, acento e traço; e o nome de arquivo é
    entrada de usuário, onde `../../.env` é um valor válido. Um identificador
    aleatório encerra as duas conversas de uma vez, e o nome original continua
    visível no título do material, que é onde ele serve para alguma coisa.
  */
  const id = input.folder === "loja" ? `loja/${randomUUID()}` : randomUUID();

  const { uploadUrl, storagePath } = await createContentUploadUrl({
    contentItemId: id,
    mimeType: tipo,
  });

  return { ok: true, uploadUrl, storagePath, mimeType: tipo };
}

export type ConfirmUploadResult =
  | { ok: true; mimeType: ContentMimeType; sizeBytes: number | null }
  | { ok: false; message: string };

/**
 * Confere pelos BYTES o que acabou de ser gravado.
 *
 * Recusar apaga o arquivo. Deixá-lo no bucket sem nenhuma linha do banco
 * apontando para ele criaria lixo que ninguém encontraria depois — e ele
 * contaria no espaço que a cliente paga.
 */
export async function confirmContentUpload(input: {
  storagePath: string;
  /** O que `prepareContentUpload` decidiu. A família dele precisa se confirmar. */
  expected: ContentMimeType;
}): Promise<ConfirmUploadResult> {
  let sonda: Awaited<ReturnType<typeof probeContentFile>>;

  try {
    sonda = await probeContentFile(input.storagePath);
  } catch (erro) {
    console.error("[uploads] falha ao conferir o arquivo", input.storagePath, erro);
    return {
      ok: false,
      message: "O arquivo subiu, mas não consegui conferir. Tente enviar de novo.",
    };
  }

  const media = identifyMedia(sonda.header);

  if (!media || !ehTipoAceito(media.mimeType)) {
    await deleteContentFile(input.storagePath).catch(() => {});
    return {
      ok: false,
      message:
        "O conteúdo do arquivo não é um dos formatos aceitos. Envie o arquivo original, " +
        "não um atalho nem um link salvo.",
    };
  }

  /*
    ⚠️ A COMPARAÇÃO É POR FAMÍLIA, e não pelo tipo exato.

    Um JPG salvo com nome `.png` acontece o tempo todo e é inofensivo: o
    caminho no bucket fica com a extensão errada, o arquivo abre igual. Já um
    "vídeo" cujos bytes são HTML é o caso que este bloco existe para pegar — é
    exatamente o que o navegador baixa quando alguém salva um link do Drive.
  */
  const familia = (tipo: string) => tipo.split("/")[0];

  if (familia(media.mimeType) !== familia(input.expected)) {
    await deleteContentFile(input.storagePath).catch(() => {});
    return {
      ok: false,
      message: `Este arquivo não é ${rotulo(input.expected)}. Ele parece ser ${rotulo(media.mimeType)}. Envie o arquivo original.`,
    };
  }

  return { ok: true, mimeType: media.mimeType, sizeBytes: sonda.sizeBytes };
}

function rotulo(mime: string): string {
  const familia = mime.split("/")[0];
  if (familia === "video") return "um vídeo";
  if (familia === "audio") return "um áudio";
  if (familia === "image") return "uma imagem";
  return "um PDF";
}
