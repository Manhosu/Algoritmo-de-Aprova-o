import { readFileSync } from "node:fs";

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * QUANTO CUSTA LER ESTE EDITAL, EM CADA CONFIGURAÇÃO.
 * ============================================================================
 *
 * Não gasta nada: mede o texto localmente e aplica a tabela de preços. O número
 * de tokens do PDF-como-documento é a única parte estimada, e usa a razão
 * medida no edital do TJ-RJ (262.214 tokens para 83 páginas ≈ 3.160 por
 * página, entre a imagem e o texto de cada uma).
 *
 * Serve para responder à pergunta que a cliente vai fazer: "quanto isso me
 * custa por aluno?".
 *
 * Uso: npm run cost -- edital.pdf
 */

/** Preços por milhão de tokens, agosto/2026. */
const PRICES = {
  "Opus 5": { input: 5, output: 25 },
  "Sonnet 5": { input: 2, output: 10 },
  "Haiku 4.5": { input: 1, output: 5 },
} as const;

/**
 * Tokens por página do PDF enviado como documento.
 *
 * Medido: 262.214 tokens para 83 páginas. A maior parte é a IMAGEM da página,
 * que a API processa além do texto — é exatamente isso que a extração local
 * elimina.
 */
const TOKENS_PER_PDF_PAGE = 3_160;

/** Caracteres por token em português. Medido nas extrações reais. */
const CHARS_PER_TOKEN = 3.6;

/** Saída típica de uma extração completa. Medido: 9.311–15.000 tokens. */
const OUTPUT_TOKENS = 12_000;

function brl(dollars: number): string {
  return `US$ ${dollars.toFixed(3)}`;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Informe o PDF:\n  npm run cost -- caminho/do/edital.pdf");
    process.exit(1);
  }

  const { extractEditalText } = await import("../src/server/ai/pdf-text");

  const bytes = new Uint8Array(readFileSync(file));
  const extracted = await extractEditalText(bytes);

  const pdfTokens = extracted.totalPages * TOKENS_PER_PDF_PAGE;
  const textTokens = Math.round(extracted.charCount / CHARS_PER_TOKEN);

  console.log(`Arquivo: ${file}`);
  console.log(`Páginas: ${extracted.totalPages}\n`);

  if (!extracted.hasUsableText) {
    console.log("⚠️  Sem camada de texto — é um PDF escaneado.");
    console.log("    O PDF inteiro tem que ir para a IA. É o caso mais caro,");
    console.log("    e não há como evitar: leitura de imagem é a única chance.\n");
  } else if (extracted.slicedToContent && extracted.pageRange) {
    console.log(
      `Conteúdo programático localizado: páginas ${extracted.pageRange.from} a ${extracted.pageRange.to}`,
    );
    console.log(
      `Só essa parte vai para a IA — ${extracted.charCount.toLocaleString("pt-BR")} caracteres.\n`,
    );
  } else {
    console.log("Marcador de conteúdo programático não encontrado.");
    console.log("O texto do edital inteiro vai para a IA (ainda muito melhor que o PDF).\n");
  }

  const rows: Array<[string, number, number]> = [
    ["PDF inteiro (como era antes)", pdfTokens, OUTPUT_TOKENS],
  ];
  if (extracted.hasUsableText) {
    rows.push(["texto extraído localmente", textTokens, OUTPUT_TOKENS]);
  }

  console.log("CUSTO POR LEITURA\n");
  console.log(
    "  " +
      "envio".padEnd(30) +
      "entrada".padStart(10) +
      Object.keys(PRICES)
        .map((m) => m.padStart(12))
        .join(""),
  );

  for (const [label, input, output] of rows) {
    const costs = Object.values(PRICES).map(
      (p) => (input / 1_000_000) * p.input + (output / 1_000_000) * p.output,
    );
    console.log(
      "  " +
        label.padEnd(30) +
        `${(input / 1000).toFixed(0)}k`.padStart(10) +
        costs.map((c) => brl(c).padStart(12)).join(""),
    );
  }

  if (extracted.hasUsableText) {
    const before = (pdfTokens / 1_000_000) * 5 + (OUTPUT_TOKENS / 1_000_000) * 25;
    const after = (textTokens / 1_000_000) * 1 + (OUTPUT_TOKENS / 1_000_000) * 5;
    console.log(
      `\n  Do pior caso (PDF + Opus) ao melhor (texto + Haiku): ` +
        `${brl(before)} → ${brl(after)}  (${(before / after).toFixed(0)}x)`,
    );
  }

  /**
   * O número que decide o custo em escala.
   *
   * Concurso popular tem milhares de candidatos subindo O MESMO arquivo. O
   * cache por (checksum + cargo) faz mil alunos custarem uma leitura.
   */
  console.log("\nE EM ESCALA\n");
  const perRead = (textTokens / 1_000_000) * 5 + (OUTPUT_TOKENS / 1_000_000) * 25;
  for (const students of [100, 1_000, 10_000]) {
    const semCache = perRead * students;
    console.log(
      `  ${students.toLocaleString("pt-BR").padStart(6)} alunos no mesmo concurso: ` +
        `${brl(semCache).padStart(10)} sem cache  →  ${brl(perRead)} com cache`,
    );
  }

  console.log(
    "\n  (o cache é por arquivo + cargo: alunos de concursos diferentes não compartilham)",
  );

  process.exit(0);
}

main().catch((error) => {
  console.error("\n", error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
