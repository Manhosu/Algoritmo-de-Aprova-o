import { writeFileSync } from "node:fs";

/**
 * Gera um PDF de edital para testar a leitura pela IA.
 *
 * POR QUE ESCREVER O PDF NA MÃO
 * ============================================================================
 * O item 3 do checklist de aceite exige que o aluno "suba um PDF de edital real
 * e a IA extraia disciplinas e assuntos". Verificar isso precisa de um PDF de
 * verdade — com camada de texto, fontes e operadores — e não de um `.txt`
 * renomeado, que o detector local recusaria antes de chegar na API.
 *
 * Uma biblioteca de geração de PDF entraria como dependência de produção para
 * servir a um script de teste. PDF simples é formato de texto: objetos
 * numerados, um `xref` com os deslocamentos e um `trailer`. São 80 linhas.
 *
 * O DOCUMENTO IMITA OS DEFEITOS DOS EDITAIS REAIS
 * ----------------------------------------------------------------------------
 * Não adianta testar com um documento limpo — o que quebra extração é a
 * bagunça. Este traz, de propósito:
 *
 *   • um preâmbulo administrativo longo antes do conteúdo programático, que a
 *     IA precisa ignorar;
 *   • redações que NÃO batem com o catálogo ("Emprego do sinal indicativo de
 *     crase" em vez de "Crase");
 *   • quantidade de questões informada em UMA disciplina e omitida nas outras;
 *   • numeração hierárquica (1, 1.1, 1.2);
 *   • uma seção "Bibliografia" logo depois do programa, que é a armadilha mais
 *     comum: parece conteúdo e não é.
 *
 * Uso: npx tsx scripts/make-sample-edital.ts [saida.pdf]
 */

const PAGES: string[][] = [
  [
    "TRIBUNAL DE JUSTICA DO ESTADO DE TESTE",
    "EDITAL No 01/2026 - CONCURSO PUBLICO",
    "",
    "O Presidente do Tribunal de Justica do Estado de Teste, no uso de suas",
    "atribuicoes legais, torna publica a abertura das inscricoes para o concurso",
    "publico destinado ao provimento de cargos de Analista Judiciario.",
    "",
    "1. DAS DISPOSICOES PRELIMINARES",
    "1.1 O concurso sera regido por este edital e executado pela banca",
    "organizadora contratada.",
    "1.2 A prova objetiva sera aplicada na data provavel de 15 de novembro de 2026.",
    "1.3 O prazo de validade do concurso sera de 2 (dois) anos.",
    "",
    "2. DAS INSCRICOES",
    "2.1 As inscricoes serao realizadas exclusivamente pela internet.",
    "2.2 O valor da taxa de inscricao sera de R$ 90,00 (noventa reais).",
    "2.3 Nao havera devolucao da taxa de inscricao em nenhuma hipotese.",
    "",
    "3. DOS CARGOS",
    "3.1 Analista Judiciario - Area Administrativa",
    "3.2 Analista Judiciario - Area Judiciaria",
  ],
  [
    "ANEXO II - CONTEUDO PROGRAMATICO",
    "",
    "CONHECIMENTOS BASICOS (para todos os cargos)",
    "",
    "LINGUA PORTUGUESA - 20 questoes",
    "1 Compreensao e interpretacao de textos.",
    "2 Ortografia oficial.",
    "3 Emprego do sinal indicativo de crase.",
    "4 Concordancia verbal e nominal.",
    "5 Regencia verbal e nominal.",
    "6 Pontuacao.",
    "7 Colocacao pronominal.",
    "8 Emprego das classes de palavras.",
    "  8.1 Substantivo e adjetivo.",
    "  8.2 Verbo: flexao e emprego dos tempos e modos.",
    "",
    "RACIOCINIO LOGICO E MATEMATICO - 10 questoes",
    "1 Estruturas logicas: proposicoes e conectivos.",
    "2 Logica de argumentacao: analogias, inferencias e deducoes.",
    "3 Analise combinatoria e probabilidade.",
    "4 Regra de tres simples e composta.",
  ],
  [
    "CONHECIMENTOS ESPECIFICOS",
    "Cargo: Analista Judiciario - Area Administrativa",
    "",
    "NOCOES DE DIREITO ADMINISTRATIVO",
    "1 Atos administrativos: conceito, requisitos, atributos.",
    "  1.1 Classificacao e especies.",
    "  1.2 Anulacao e revogacao.",
    "2 Licitacoes e contratos administrativos.",
    "3 Improbidade administrativa.",
    "4 Poderes da administracao publica.",
    "5 Servidores publicos: regime juridico.",
    "",
    "NOCOES DE DIREITO CONSTITUCIONAL",
    "1 Direitos e garantias fundamentais.",
    "2 Organizacao do Estado brasileiro.",
    "3 Poder Judiciario: organizacao e competencias.",
    "",
    "BIBLIOGRAFIA SUGERIDA",
    "MEIRELLES, Hely Lopes. Direito Administrativo Brasileiro.",
    "CUNHA JUNIOR, Dirley da. Curso de Direito Constitucional.",
    "BECHARA, Evanildo. Moderna Gramatica Portuguesa.",
  ],
];

/** Escapa o que o PDF trata como delimitador dentro de uma string literal. */
function escape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function contentStream(lines: string[]): string {
  const body = lines
    .map((line) => `(${escape(line)}) Tj 0 -16 Td`)
    .join("\n");

  // BT/ET delimitam o bloco de texto; Tf escolhe a fonte; Td posiciona.
  return `BT\n/F1 11 Tf\n56 780 Td\n${body}\nET`;
}

function buildPdf(pages: string[][]): Buffer {
  const objects: string[] = [];
  const pageCount = pages.length;

  // 1 = catálogo, 2 = árvore de páginas, 3 = fonte.
  const firstPageObject = 4;
  const kids = pages
    .map((_, index) => `${firstPageObject + index * 2} 0 R`)
    .join(" ");

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  for (const lines of pages) {
    const stream = contentStream(lines);
    const streamIndex = objects.length + 2;

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents ${streamIndex} 0 R >>`,
    );
    objects.push(
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    );
  }

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];

  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

const output = process.argv[2] ?? "edital-exemplo.pdf";
const pdf = buildPdf(PAGES);
writeFileSync(output, pdf);

console.log(
  `${output} — ${PAGES.length} páginas, ${(pdf.byteLength / 1024).toFixed(1)} KB`,
);
