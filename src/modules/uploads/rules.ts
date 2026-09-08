/**
 * O QUE O ACERVO ACEITA RECEBER.
 * ============================================================================
 *
 * Regra pura, sem banco e sem rede, porque ela é usada em três lugares que não
 * podem discordar entre si:
 *
 *   • no navegador, para avisar antes de subir 200 MB e só então ouvir "não";
 *   • no servidor, antes de emitir a URL assinada;
 *   • no servidor de novo, depois do upload, conferindo os bytes que chegaram.
 *
 * Se cada um tivesse a sua lista, a divergência apareceria como um upload que
 * "funciona" e some — o pior formato de erro que existe.
 */

/** Os tipos que o bucket do acervo guarda. Espelha `ContentMimeType`. */
export const TIPOS_ACEITOS = [
  "image/png",
  "image/jpeg",
  "application/pdf",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
] as const;

export type TipoAceito = (typeof TIPOS_ACEITOS)[number];

/**
 * ⚠️ TETO POR FAMÍLIA, e não um número só.
 *
 * Um teto único ou apertaria o vídeo (os do Mind-X vão a 10,7 MB) ou deixaria
 * uma imagem de 100 MB entrar sem ninguém notar. A imagem grande não quebra
 * nada no servidor; ela quebra o celular do aluno, que baixa tudo antes de
 * mostrar qualquer coisa.
 */
const TETO: Record<string, number> = {
  image: 15 * 1024 * 1024,
  application: 40 * 1024 * 1024,
  audio: 60 * 1024 * 1024,
  video: 200 * 1024 * 1024,
};

export function limiteDeBytes(mimeType: string): number {
  return TETO[mimeType.split("/")[0]] ?? TETO.image;
}

export function ehTipoAceito(mimeType: string): mimeType is TipoAceito {
  return (TIPOS_ACEITOS as readonly string[]).includes(mimeType);
}

/**
 * O tipo que o NAVEGADOR declarou, normalizado — ou nulo quando não serve.
 *
 * ⚠️ O NOME DO ARQUIVO É A SEGUNDA CHANCE, não a primeira.
 *
 * O Windows manda `.mp4` como `video/mp4`, mas o Drive já devolveu arquivo com
 * tipo vazio e os mapas mentais da cliente vieram sem extensão nenhuma. Quando
 * um dos dois sabe responder, o upload segue; quem decide de verdade é a
 * conferência dos bytes, depois.
 */
export function tipoDeclarado(input: {
  mimeType: string | null | undefined;
  fileName: string;
}): TipoAceito | null {
  const declarado = (input.mimeType ?? "").split(";")[0].trim().toLowerCase();

  /* `.jpg` chega como `image/jpg` em alguns navegadores, e esse tipo não existe. */
  const corrigido = declarado === "image/jpg" ? "image/jpeg" : declarado;
  if (ehTipoAceito(corrigido)) return corrigido;

  const extensao = input.fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];

  switch (extensao) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "pdf":
      return "application/pdf";
    case "mp4":
    case "mov":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "mp3":
      return "audio/mpeg";
    case "m4a":
      return "audio/mp4";
    default:
      return null;
  }
}

/** A explicação que a cliente lê quando o arquivo é recusado. */
export function motivoDaRecusa(input: {
  tipo: TipoAceito | null;
  sizeBytes: number;
}): string | null {
  if (!input.tipo) {
    return "Formato não aceito. Envie imagem (PNG ou JPG), PDF, vídeo (MP4 ou WebM) ou áudio (MP3 ou M4A).";
  }

  if (input.sizeBytes <= 0) return "O arquivo está vazio.";

  const limite = limiteDeBytes(input.tipo);
  if (input.sizeBytes > limite) {
    return `O arquivo tem ${megabytes(input.sizeBytes)} MB e o limite para este formato é ${megabytes(limite)} MB.`;
  }

  return null;
}

export function megabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? String(Math.round(mb)) : mb.toFixed(1);
}

/**
 * O tipo de material que combina com o arquivo enviado.
 *
 * Serve para o formulário acertar o campo "Tipo" sozinho quando a cliente sobe
 * um vídeo e o seletor ainda está em "Resumo" — um material de vídeo cadastrado
 * como resumo abre como link em vez de tocar.
 */
export function tipoDeMaterialPara(mime: TipoAceito): string | null {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  return null;
}
