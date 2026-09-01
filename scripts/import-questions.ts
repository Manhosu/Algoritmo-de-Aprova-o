import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Importa um lote de questões de uma planilha da cliente.
 *
 *   npx tsx --conditions=react-server scripts/import-questions.ts QuestesAdministrao.xlsx
 *   npx tsx --conditions=react-server scripts/import-questions.ts arquivo.xlsx --confirmar
 *
 * ⚠️ TODA A LÓGICA MORA EM `server/import/run-question-import.ts`, e este script
 * só imprime o relatório.
 *
 * Antes ela estava aqui dentro, e quando a tela de importação nasceu a mesma
 * regra passou a existir em dois lugares. A cópia divergiu no primeiro detalhe
 * que importava — a fórmula do `content_hash` — e o resultado foi um acervo em
 * que nenhuma reimportação conflitava com nada: a mesma planilha entrava de
 * novo, inteira, sem erro e sem aviso.
 *
 * Com um módulo só, a planilha importada por mim aqui e a mesma planilha
 * importada pela cliente no painel produzem exatamente o mesmo acervo.
 *
 * Roda em conferência por padrão. Só grava com `--confirmar`.
 */

const [, , filePath, ...rest] = process.argv;
const CONFIRMAR = rest.includes("--confirmar");

if (!filePath) {
  throw new Error(
    "Informe a planilha: npx tsx --conditions=react-server scripts/import-questions.ts <arquivo.xlsx>",
  );
}

const { runQuestionImport } = await import("../src/server/import/run-question-import");

const bytes = new Uint8Array(await readFile(filePath));
const fileName = basename(filePath);

const relatorio = await runQuestionImport({ bytes, fileName, dryRun: !CONFIRMAR });

console.log(`\nPlanilha: ${relatorio.fileName}`);
console.log(`Questões válidas: ${relatorio.parsed}`);
console.log(`Linhas com problema: ${relatorio.issues.length}`);

for (const problema of relatorio.issues.slice(0, 10)) {
  console.log(`  linha ${problema.row}: ${problema.message}`);
}
if (relatorio.issues.length > 10) {
  console.log(`  … e mais ${relatorio.issues.length - 10}`);
}

/**
 * O aviso de gabarito desequilibrado NÃO bloqueia.
 *
 * É a §8 do padrão editorial da própria cliente, e quem decide se uma remessa
 * com 33% de "A" vai ao ar é ela, não o script.
 */
if (relatorio.answerBalanceWarning) {
  console.log(`\n⚠️  ${relatorio.answerBalanceWarning}`);
}

const pct = Math.round((relatorio.matched / Math.max(1, relatorio.parsed)) * 100);
console.log(`\nCasam com o catálogo: ${relatorio.matched} de ${relatorio.parsed} (${pct}%)`);

if (relatorio.remapped.length > 0) {
  console.log("\nAssunto cadastrado em outra disciplina — a questão entrou por ela:");
  for (const item of relatorio.remapped) {
    console.log(`  ${String(item.count).padStart(4)}x ${item.label}`);
  }
}

if (relatorio.unmatched.length > 0) {
  console.log("\nFora do catálogo — cadastre e reimporte para aproveitar:");
  for (const item of relatorio.unmatched.slice(0, 20)) {
    console.log(`  ${String(item.count).padStart(4)}x ${item.label}`);
  }
}

if (!CONFIRMAR) {
  console.log("\nNada foi gravado. Rode de novo com --confirmar para importar.\n");
  process.exit(0);
}

if (relatorio.alreadyImported) {
  console.log(`\nO lote "${fileName}" já foi importado. Nada a fazer.\n`);
  process.exit(0);
}

console.log(`\n✓ ${relatorio.written} questão(ões) gravada(s) no lote "${fileName}".`);
if (relatorio.duplicates > 0) {
  console.log(`  ${relatorio.duplicates} já existia(m) no acervo (mesmo enunciado).`);
}
console.log("");

process.exit(0);
