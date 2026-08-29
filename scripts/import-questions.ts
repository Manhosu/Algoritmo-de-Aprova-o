import { createHash } from "node:crypto";
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
 * POR QUE ESTE SCRIPT EXISTE
 * ----------------------------------------------------------------------------
 * A leitura e a validação já existiam em `server/import/questions.ts`, e a
 * GRAVAÇÃO existia só dentro do seed — com o nome do arquivo fixo no código
 * (`AUTORAISCRASE.xlsx`). Cada remessa nova da cliente exigia editar o seed e
 * rodá-lo inteiro, o que também mexe em tudo o mais que ele semeia.
 *
 * ⚠️ CASA PELO MESMO CASADOR DO EDITAL, não por chave exata.
 *
 * O seed usa `subjectsByKey.get(taxonomyKey(nome))`, comparação literal. A
 * planilha diz "Administração" e o catálogo pode dizer "Administração Geral";
 * literal, a remessa inteira é descartada em silêncio. `matchSubject` e
 * `matchTopic` são os mesmos que leem o edital do aluno, com apelidos e
 * similaridade — duas formas de casar disciplina no mesmo sistema dariam dois
 * resultados diferentes para o mesmo nome.
 *
 * IDEMPOTÊNCIA EM DOIS NÍVEIS
 * ----------------------------------------------------------------------------
 *   • o lote, pelo nome do arquivo: reimportar a mesma planilha não repete;
 *   • a questão, pelo `content_hash` do enunciado: a mesma questão vinda em
 *     duas planilhas entra uma vez só.
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

const { parseQuestionSheet } = await import("../src/server/import/questions");
const { loadCatalog, matchSubject, matchTopic } = await import(
  "../src/server/taxonomy/mapping"
);
const { taxonomyKey } = await import("../src/modules/taxonomy/normalize");
const { db } = await import("../src/server/db");
const schema = await import("../src/server/db/schema");
const { eq } = await import("drizzle-orm");

const bytes = new Uint8Array(await readFile(filePath));
const result = parseQuestionSheet(bytes);
const fileName = basename(filePath);

console.log(`\nPlanilha: ${fileName}`);
console.log(`Questões válidas: ${result.questions.length}`);
console.log(`Linhas com problema: ${result.issues.length}`);

for (const issue of result.issues.slice(0, 10)) {
  console.log(`  linha ${issue.row}: ${issue.message}`);
}
if (result.issues.length > 10) {
  console.log(`  … e mais ${result.issues.length - 10}`);
}

/**
 * O aviso de gabarito desequilibrado NÃO bloqueia.
 *
 * É a §8 do padrão editorial da própria cliente, e quem decide se uma remessa
 * com 33% de "A" vai ao ar é ela, não o script. Bloquear aqui seria transformar
 * uma recomendação editorial em regra técnica.
 */
if (result.answerBalanceWarning) {
  console.log(`\n⚠️  ${result.answerBalanceWarning}`);
}

const catalog = await loadCatalog();

/* --- o que casa com o catálogo, antes de gravar qualquer coisa ------------- */

type Preparada = {
  questao: (typeof result.questions)[number];
  subjectId: string;
  topicId: string | null;
};

const prontas: Preparada[] = [];
const foraDoCatalogo = new Map<string, number>();
/** Questão cujo assunto pertence a outra disciplina que não a da planilha. */
const remapeadas = new Map<string, number>();

for (const questao of result.questions) {
  const subject = matchSubject(questao.subjectName, catalog);

  if (!subject.canonicalId) {
    const chave = `(disciplina) ${questao.subjectName}`;
    foraDoCatalogo.set(chave, (foraDoCatalogo.get(chave) ?? 0) + 1);
    continue;
  }

  const topic = matchTopic(questao.topicName, subject.canonicalId, catalog);

  if (topic.canonicalId) {
    prontas.push({ questao, subjectId: subject.canonicalId, topicId: topic.canonicalId });
    continue;
  }

  /*
    ⚠️ QUEDA: o assunto existe, mas mora em OUTRA disciplina.

    O nome do assunto é o sinal mais específico, e o do catálogo é único no
    sistema inteiro. "Licitações e contratos" está sob Direito Administrativo;
    a planilha da cliente rotulou a disciplina como Administração Pública. São
    80 questões de conteúdo real que seriam descartadas por causa do rótulo de
    cima, não do de baixo.

    Aqui a questão entra pela disciplina DONA do assunto. E o remapeamento é
    relatado: mover conteúdo de disciplina em silêncio é o tipo de coisa que a
    cliente precisa ver para corrigir a planilha, se discordar.
  */
  const global = catalog.topics.find(
    (candidato) => candidato.normalizedName === taxonomyKey(questao.topicName),
  );

  if (global?.subjectId) {
    const donaDoAssunto =
      catalog.subjects.find((d) => d.id === global.subjectId)?.name ?? "outra disciplina";

    const chave = `${questao.subjectName} › ${questao.topicName}  →  ${donaDoAssunto}`;
    remapeadas.set(chave, (remapeadas.get(chave) ?? 0) + 1);

    prontas.push({ questao, subjectId: global.subjectId, topicId: global.id });
    continue;
  }

  const chave = `${questao.subjectName} › ${questao.topicName}`;
  foraDoCatalogo.set(chave, (foraDoCatalogo.get(chave) ?? 0) + 1);
}

const pct = Math.round((prontas.length / Math.max(1, result.questions.length)) * 100);
console.log(`\nCasam com o catálogo: ${prontas.length} de ${result.questions.length} (${pct}%)`);

if (remapeadas.size > 0) {
  console.log("\nAssunto cadastrado em outra disciplina — a questão entrou por ela:");
  for (const [nome, n] of [...remapeadas].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}x ${nome}`);
  }
}

if (foraDoCatalogo.size > 0) {
  console.log("\nFora do catálogo — cadastre e reimporte para aproveitar:");
  for (const [nome, n] of [...foraDoCatalogo].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${String(n).padStart(4)}x ${nome}`);
  }
}

if (!CONFIRMAR) {
  console.log("\nNada foi gravado. Rode de novo com --confirmar para importar.\n");
  process.exit(0);
}

/* --- gravação -------------------------------------------------------------- */

const jaImportado = await db.query.questionImportBatches.findFirst({
  where: (t, { eq: e }) => e(t.fileName, fileName),
  columns: { id: true },
});

if (jaImportado) {
  console.log(`\nO lote "${fileName}" já foi importado. Nada a fazer.\n`);
  process.exit(0);
}

const [batch] = await db
  .insert(schema.questionImportBatches)
  .values({
    fileName,
    status: result.issues.length > 0 ? "completed_with_errors" : "completed",
    totalRows: result.questions.length + result.issues.length,
    importedRows: prontas.length,
    failedRows: result.issues.length,
    errors: result.issues.map((i) => ({ row: i.row, message: i.message })),
    finishedAt: new Date(),
  })
  .returning({ id: schema.questionImportBatches.id });

/** A banca autoral: toda questão precisa de uma, e as nossas não vêm de banca. */
const [autoral] = await db
  .select({ id: schema.examBoards.id })
  .from(schema.examBoards)
  .where(eq(schema.examBoards.slug, "autoral"))
  .limit(1);

let gravadas = 0;
let repetidas = 0;

for (const { questao, subjectId, topicId } of prontas) {
  const contentHash = createHash("sha256")
    .update(questao.statement.trim().toLowerCase().replace(/\s+/g, " "))
    .digest("hex");

  const [row] = await db
    .insert(schema.questions)
    .values({
      examBoardId: autoral?.id ?? null,
      canonicalSubjectId: subjectId,
      canonicalTopicId: topicId,
      difficulty: questao.difficulty,
      type: "multiple_choice",
      statement: questao.statement,
      explanation: questao.explanation,
      status: "published",
      importBatchId: batch.id,
      contentHash,
    })
    .onConflictDoNothing({ target: schema.questions.contentHash })
    .returning({ id: schema.questions.id });

  if (!row) {
    repetidas++;
    continue;
  }

  await db.insert(schema.questionOptions).values(
    questao.options.map((opcao, index) => ({
      questionId: row.id,
      label: opcao.label,
      content: opcao.content,
      isCorrect: opcao.isCorrect,
      sortOrder: index,
    })),
  );

  gravadas++;
}

console.log(`\n✓ ${gravadas} questão(ões) gravada(s) no lote "${fileName}".`);
if (repetidas > 0) {
  console.log(`  ${repetidas} já existia(m) no acervo (mesmo enunciado).`);
}
console.log("");
