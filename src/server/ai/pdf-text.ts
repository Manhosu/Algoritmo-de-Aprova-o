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
 * Cabeçalho de anexo DE VERDADE: "ANEXO" em caixa alta, no início da linha.
 *
 * ⚠️ A CAIXA ALTA É O QUE SEPARA CABEÇALHO DE CITAÇÃO, e não é preciosismo.
 *
 * O extrator de PDF quebra linha onde o layout mandar, então "…divulgada
 * conforme o\nAnexo II. A relação será…" vira uma linha que COMEÇA com
 * "Anexo II" e passa por cabeçalho. Os editais da VUNESP estão cheios disso:
 * no de Guararema havia um falso na página 11, no da Câmara de Assis havia
 * três, nas páginas 8, 17 e 27.
 *
 * Em todo edital que vimos o cabeçalho real vem em caixa alta ("ANEXO I –
 * CONTEÚDO PROGRAMÁTICO") e a citação vem capitalizada ("Anexo II."). Por isso
 * existem duas expressões: a forte manda, e a fraca só entra como queda para
 * não regredir uma banca que escreva o cabeçalho de outro jeito.
 */
const STRONG_ANNEX_HEADING = /^\s*ANEXO\s+([IVXLCDM]+|\d+)\b/m;

/** Qualquer citação de anexo, cabeçalho ou não. Só usada como queda. */
const ANY_ANNEX_HEADING = /^\s*ANEXO\s+([IVXLCDM]+|\d+)\b/im;

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

/** A linha de cabeçalho de anexo da página, se houver. */
function annexHeadingLine(page: string): string | null {
  for (const linha of page.split(/\r?\n/)) {
    if (STRONG_ANNEX_HEADING.test(linha)) return linha;
  }
  return null;
}

/**
 * Acha o intervalo de páginas do conteúdo programático.
 *
 * ONDE COMEÇA — E POR QUE NÃO É A PRIMEIRA MENÇÃO
 * ----------------------------------------------------------------------------
 * ⚠️ COMEÇAR NA PRIMEIRA PÁGINA QUE *MENCIONA* O CONTEÚDO PROGRAMÁTICO ESTÁ
 * ERRADO, e do pior jeito: o corpo do edital cita o anexo muito antes de ele
 * existir ("a prova será elaborada de acordo com o conteúdo programático
 * constante do Anexo II"). O corte então começava na citação e terminava no
 * cabeçalho do anexo verdadeiro — mandando à IA as páginas ERRADAS e parando
 * uma página antes do conteúdo real.
 *
 * Foi o que derrubou os dois editais da VUNESP que a cliente testou:
 *
 *   Guararema        citação na pág. 13, anexo na pág. 29 → mandava 13–28
 *   Câmara de Assis  citação na pág. 17, anexo na pág. 41 → mandava 17–26
 *
 * Nos dois casos a IA recebeu texto administrativo e nenhuma disciplina. Para
 * ela o edital simplesmente não tinha conteúdo programático.
 *
 * A âncora certa é o CABEÇALHO do anexo que fala de conteúdo programático —
 * "ANEXO I – CONTEÚDO PROGRAMÁTICO". Só quando não existe cabeçalho assim é
 * que voltamos à primeira menção, que é o comportamento antigo.
 *
 * ONDE TERMINA
 * ----------------------------------------------------------------------------
 * No próximo cabeçalho de anexo com numeral diferente. No edital do TJ-RJ isso
 * deu páginas 34 a 72, parando exatamente antes do "ANEXO II – REQUISITOS E
 * ATRIBUIÇÕES DOS CARGOS".
 *
 * Devolve `null` quando não encontra — e aí manda-se o edital inteiro, que é o
 * comportamento seguro: cortar errado perde conteúdo do aluno em silêncio.
 */
export function findContentRange(pages: string[]): { from: number; to: number } | null {
  // 1ª escolha: o cabeçalho de anexo que fala de conteúdo programático.
  let from = pages.findIndex((page) => {
    const heading = annexHeadingLine(page);
    return heading !== null && CONTENT_MARKER.test(heading);
  });

  // Queda: a primeira menção, como antes. Vale para edital sem anexo nomeado,
  // em que o programa vem no corpo do texto.
  if (from === -1) from = pages.findIndex((page) => CONTENT_MARKER.test(page));
  if (from === -1) return null;

  const startingAnnex =
    pages[from].match(STRONG_ANNEX_HEADING)?.[1] ??
    pages[from].match(ANY_ANNEX_HEADING)?.[1];

  for (let index = from + 1; index < pages.length; index += 1) {
    const heading = pages[index].match(STRONG_ANNEX_HEADING);
    if (heading && heading[1] !== startingAnnex) {
      return { from, to: index };
    }
  }

  return { from, to: pages.length };
}
