import "server-only";

import { extractText, getDocumentProxy } from "unpdf";

/**
 * EXTRAÇÃO LOCAL DO TEXTO DO EDITAL — A MAIOR ECONOMIA DE TODAS.
 * ============================================================================
 *
 * Medido no edital do TJ-RJ (83 páginas, 769 KB):
 *
 *   PDF inteiro, como documento .......... 262.214 tokens de entrada
 *   texto das 83 páginas .................. ~76.400 tokens
 *   texto SÓ do anexo de conteúdo ......... ~39.600 tokens   ← 7x menos
 *
 * A diferença é grande porque a API trata cada página do PDF como IMAGEM além
 * de texto, e imagem custa perto de 2.000 tokens por página. Mandar o texto que
 * a gente mesmo extraiu elimina isso.
 *
 * E o corte para o anexo elimina o resto do edital — inscrições, recursos,
 * formulários — que a IA teria que ler para depois ignorar.
 *
 * QUANDO NÃO USAR
 * ----------------------------------------------------------------------------
 * PDF escaneado não tem camada de texto: a extração devolve quase nada. Nesse
 * caso o PDF original é enviado, porque a leitura de imagem é a única chance —
 * e é melhor pagar caro do que não conseguir ler.
 *
 * Por isso `extractEditalText` devolve um DIAGNÓSTICO, não só o texto: quem
 * chama decide com base nele.
 */

/** Abaixo disto, o "texto" não é texto — é um PDF de imagem. */
const MIN_CHARS_PER_PAGE = 200;

/** Abaixo disto, não vale cortar: o edital todo já é pequeno. */
const MIN_CHARS_TO_SLICE = 20_000;

/**
 * Onde começa o conteúdo programático.
 *
 * As três redações cobrem o que as bancas brasileiras usam. "Objetos de
 * avaliação" é o Cebraspe; "programa das provas" aparece em bancas menores.
 */
const CONTENT_MARKER =
  /conte[úu]do\s+program[áa]tico|objetos?\s+de\s+avalia[çc][ãa]o|programa\s+das?\s+provas?/i;

/**
 * Cabeçalho de anexo, para saber onde o conteúdo programático TERMINA.
 *
 * O `^` com flag multilinha importa: "conforme o Anexo II" no meio de um
 * parágrafo não é um cabeçalho, e cortar ali perderia metade do programa.
 */
const ANNEX_HEADING = /^\s*ANEXO\s+([IVXLCDM]+|\d+)\b/im;

export type PdfTextResult = {
  /** Texto escolhido para mandar à IA. Vazio quando não há camada de texto. */
  text: string;
  totalPages: number;
  /** Verdadeiro quando o PDF tem texto de verdade (não é escaneado). */
  hasUsableText: boolean;
  /** Verdadeiro quando o corte para o anexo de conteúdo funcionou. */
  slicedToContent: boolean;
  /** Intervalo enviado, base 1, para o log e para a tela. */
  pageRange: { from: number; to: number } | null;
  charCount: number;
};

export async function extractEditalText(pdf: Uint8Array): Promise<PdfTextResult> {
  let pages: string[] = [];
  let totalPages = 0;

  try {
    const document = await getDocumentProxy(pdf);
    const result = await extractText(document, { mergePages: false });
    totalPages = result.totalPages;
    pages = (result.text as string[]).map((page) => page ?? "");
  } catch {
    // PDF corrompido ou com estrutura que a biblioteca não entende. Não é
    // motivo para falhar: o PDF original ainda pode ser lido pela IA.
    return {
      text: "",
      totalPages: 0,
      hasUsableText: false,
      slicedToContent: false,
      pageRange: null,
      charCount: 0,
    };
  }

  const fullText = pages.join("\n\n").trim();
  const hasUsableText =
    totalPages > 0 && fullText.length >= MIN_CHARS_PER_PAGE * Math.min(totalPages, 3);

  if (!hasUsableText) {
    return {
      text: "",
      totalPages,
      hasUsableText: false,
      slicedToContent: false,
      pageRange: null,
      charCount: fullText.length,
    };
  }

  const range = findContentRange(pages);

  if (range === null || fullText.length < MIN_CHARS_TO_SLICE) {
    return {
      text: fullText,
      totalPages,
      hasUsableText: true,
      slicedToContent: false,
      pageRange: { from: 1, to: totalPages },
      charCount: fullText.length,
    };
  }

  const sliced = pages.slice(range.from, range.to).join("\n\n").trim();

  return {
    text: sliced,
    totalPages,
    hasUsableText: true,
    slicedToContent: true,
    pageRange: { from: range.from + 1, to: range.to },
    charCount: sliced.length,
  };
}

/**
 * Acha o intervalo de páginas do conteúdo programático.
 *
 * Começa na primeira página que menciona o conteúdo programático e termina no
 * próximo cabeçalho de ANEXO diferente daquele em que começou. No edital do
 * TJ-RJ isso deu páginas 34 a 72, parando exatamente antes do "ANEXO II –
 * REQUISITOS E ATRIBUIÇÕES DOS CARGOS".
 *
 * Devolve `null` quando não encontra — e aí manda-se o edital inteiro, que é o
 * comportamento seguro: cortar errado perderia conteúdo do aluno em silêncio.
 */
function findContentRange(pages: string[]): { from: number; to: number } | null {
  const from = pages.findIndex((page) => CONTENT_MARKER.test(page));
  if (from === -1) return null;

  const startingAnnex = pages[from].match(ANNEX_HEADING)?.[1];

  for (let index = from + 1; index < pages.length; index += 1) {
    const heading = pages[index].match(ANNEX_HEADING);
    if (heading && heading[1] !== startingAnnex) {
      return { from, to: index };
    }
  }

  return { from, to: pages.length };
}
