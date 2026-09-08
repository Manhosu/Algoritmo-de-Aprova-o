import "server-only";

/**
 * O QUE ESTE ARQUIVO É
 * ============================================================================
 *
 * Identificação de imagem e PDF a partir dos BYTES, não da extensão.
 *
 * ⚠️ EXTENSÃO NÃO É TIPO. Os mapas mentais que a cliente baixou do Drive vieram
 * com nomes como "10 - Regime Próprio de Previdência Social — RPPS._" — sem
 * extensão nenhuma, porque o Drive engoliu o sufixo. São PNGs perfeitos.
 * Confiar na extensão descartaria seis arquivos bons em silêncio.
 *
 * A dimensão importa porque `content_items` guarda largura e altura para o
 * visualizador com zoom: sem elas o mapa mental abre e "pula" quando a imagem
 * carrega, e num mapa de 3 MB isso é meio segundo de tela dançando.
 */

export type MediaInfo = {
  mimeType:
    | "image/png"
    | "image/jpeg"
    | "application/pdf"
    | "video/mp4"
    | "video/webm"
    | "audio/mpeg"
    | "audio/mp4";
  width: number | null;
  height: number | null;
};

/** Lê os primeiros bytes e diz o que o arquivo é de verdade. */
export function identifyMedia(bytes: Uint8Array): MediaInfo | null {
  if (isPng(bytes)) {
    return { mimeType: "image/png", ...pngSize(bytes) };
  }

  if (isJpeg(bytes)) {
    return { mimeType: "image/jpeg", ...jpegSize(bytes) };
  }

  if (isPdf(bytes)) {
    return { mimeType: "application/pdf", width: null, height: null };
  }

  /*
    ⚠️ VÍDEO E ÁUDIO TAMBÉM SÃO IDENTIFICADOS PELOS BYTES.

    Os vídeos do Mind-X chegaram do Drive com nomes como "CF - Habeas
    Corpus.mp4", e o nome pode vir sem extensão ou com a errada — foi o que
    aconteceu com os mapas mentais. A dimensão fica nula: descobri-la exigiria
    ler a caixa `moov`, e o player de vídeo não precisa dela como o visualizador
    de imagem precisa.
  */
  if (isMp4(bytes)) {
    /*
      ⚠️ M4A É O MESMO CONTÊINER DO MP4, e a marca é o único jeito de separar.

      Áudio do iPhone e do WhatsApp chega como `.m4a` com o mesmo `ftyp` de um
      vídeo. Sem olhar a marca, todo áudio desses entraria no acervo como
      videoaula e abriria num player de vídeo com a tela preta.
    */
    return {
      mimeType: temMarcaDeAudio(bytes) ? "audio/mp4" : "video/mp4",
      width: null,
      height: null,
    };
  }

  if (isWebm(bytes)) {
    return { mimeType: "video/webm", width: null, height: null };
  }

  if (isMp3(bytes)) {
    return { mimeType: "audio/mpeg", width: null, height: null };
  }

  return null;
}

/**
 * MP4 e derivados (MOV, M4A) trazem "ftyp" nos bytes 4 a 8.
 *
 * O tamanho da primeira caixa vem antes, então a assinatura não está no começo
 * do arquivo — testar os primeiros bytes como se faz com PNG não funciona aqui.
 */
function isMp4(b: Uint8Array): boolean {
  return (
    b.length > 12 &&
    b[4] === 0x66 && // f
    b[5] === 0x74 && // t
    b[6] === 0x79 && // y
    b[7] === 0x70 //   p
  );
}

/**
 * A marca do contêiner, nos bytes 8 a 12, logo depois de "ftyp".
 *
 * "M4A ", "M4B " e "mp42" com faixa só de áudio são os que a Apple e o
 * WhatsApp produzem. Vídeo traz "isom", "mp42", "avc1" ou "qt  ".
 */
function temMarcaDeAudio(b: Uint8Array): boolean {
  if (b.length < 12) return false;

  const marca = String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase();
  return marca === "m4a " || marca === "m4b " || marca === "m4p ";
}

/** WebM e Matroska começam com o cabeçalho EBML. */
function isWebm(b: Uint8Array): boolean {
  return (
    b.length > 4 &&
    b[0] === 0x1a &&
    b[1] === 0x45 &&
    b[2] === 0xdf &&
    b[3] === 0xa3
  );
}

/**
 * MP3 com tag ID3 no começo, ou o quadro cru.
 *
 * `0xff` seguido de um byte com os três bits altos ligados é o sincronismo de
 * quadro. Sem a tag ID3, é a única assinatura que o formato tem.
 */
function isMp3(b: Uint8Array): boolean {
  if (b.length < 3) return false;

  const temId3 = b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33; // I D 3
  const temSync = b[0] === 0xff && (b[1] & 0xe0) === 0xe0;

  return temId3 || temSync;
}

function isPng(b: Uint8Array): boolean {
  // \x89 P N G \r \n \x1a \n
  return (
    b.length > 24 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  );
}

/** No PNG a dimensão está no IHDR, sempre nos bytes 16–24. */
function pngSize(b: Uint8Array): { width: number; height: number } {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function isJpeg(b: Uint8Array): boolean {
  return b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

/**
 * No JPEG a dimensão está num marcador SOF, e é preciso andar pelos segmentos.
 *
 * Não dá para ler de um deslocamento fixo: o arquivo começa com metadados de
 * tamanho variável (EXIF, perfil de cor, miniatura), e a foto de celular da
 * cliente traz todos eles.
 */
function jpegSize(b: Uint8Array): { width: number | null; height: number | null } {
  let offset = 2;

  while (offset + 9 < b.length) {
    if (b[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = b[offset + 1];
    const length = (b[offset + 2] << 8) | b[offset + 3];

    // SOF0…SOF15, pulando os que não carregam dimensão (DHT, DAC, RSTn).
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isSof) {
      return {
        height: (b[offset + 5] << 8) | b[offset + 6],
        width: (b[offset + 7] << 8) | b[offset + 8],
      };
    }

    if (length <= 0) break;
    offset += 2 + length;
  }

  // Arquivo legível mas sem SOF encontrado: melhor importar sem dimensão do
  // que descartar o material da cliente.
  return { width: null, height: null };
}

function isPdf(b: Uint8Array): boolean {
  return b.length > 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
}

/* ========================================================================== *
 * TÍTULO
 * ========================================================================== */

/**
 * Transforma o nome do arquivo no título que o aluno vê.
 *
 * "01 - Planejamento estratégico, tático e operacional._" vira
 * "Planejamento estratégico, tático e operacional".
 *
 * O número da frente vira `sortOrder` e sai do título: ele ordena a lista, não
 * informa o aluno. "01 - " no começo de todo card é ruído repetido catorze
 * vezes na mesma tela.
 */
export function parseMediaTitle(fileName: string): {
  title: string;
  sortOrder: number;
  /**
   * O título SEM o número da série, para casar com o catálogo.
   *
   * ⚠️ É POR ISSO QUE ELE EXISTE. "Crase 1", "Crase 2" e "Crase 3" são três
   * imagens da mesma série; casando o título literal, nenhuma das três encontra
   * o assunto "Crase" — a similaridade compara a string inteira e o número no
   * fim afasta o suficiente. Na primeira tentativa isso deixou 24 dos 30
   * arquivos de Português sem assunto nenhum.
   *
   * O número continua no `title`, porque na tela ele é o que distingue um card
   * do outro.
   */
  matchKey: string;
} {
  let name = fileName
    // Extensão real ou o sufixo truncado que o Drive deixou.
    .replace(/\.(png|jpe?g|pdf)$/i, "")
    .replace(/[._\s]+$/, "")
    // "Regencia_verbal 4" — underscore no lugar do espaço.
    .replace(/_/g, " ")
    .trim();

  let sortOrder = 0;

  // "01 - Planejamento estratégico…"
  const numbered = name.match(/^(\d{1,3})\s*[-–—.)]\s*(.+)$/);
  if (numbered) {
    sortOrder = Number.parseInt(numbered[1], 10);
    name = numbered[2].trim();
  }

  // "Resumo 7 -Planejamento e Orçamento Público" — o número também aparece
  // depois da palavra, e sem espaço antes do traço em alguns arquivos.
  const prefixed = name.match(/^(?:Resumo|Mapa)\s+(\d{1,3})\s*[-–—]?\s*(.+)$/i);
  if (prefixed) {
    sortOrder = Number.parseInt(prefixed[1], 10);
    name = prefixed[2].trim();
  }

  const title = name.replace(/[\s]+$/, "").trim() || fileName;

  // "Crase 1", "Regência Nominal 4", "Concordância Nominal e Verbal - 2"
  const suffixed = title.match(/^(.+?)\s*[-–—]?\s*(\d{1,3})$/);
  if (suffixed && sortOrder === 0) {
    sortOrder = Number.parseInt(suffixed[2], 10);
  }

  return {
    title,
    sortOrder,
    matchKey: (suffixed ? suffixed[1] : title).trim(),
  };
}
