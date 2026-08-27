import { readFile } from "node:fs/promises";

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Importa uma planilha de flashcards da cliente para o acervo.
 *
 *   npx tsx --conditions=react-server scripts/import-flashcards.ts CraseFlashcards.xlsx
 *   npx tsx --conditions=react-server scripts/import-flashcards.ts arquivo.xlsx --confirmar
 *
 * Sem `--confirmar` ele só MOSTRA o que faria. É a diferença entre conferir e
 * escrever no banco de produção — e o banco aqui é o da cliente.
 *
 * ⚠️ IDEMPOTENTE POR BARALHO. Rodar duas vezes com a mesma planilha não
 * duplica: o baralho é encontrado por (tipo, título, assunto canônico) e seus
 * cartões são substituídos. Sem isso, a segunda execução criaria um acervo
 * fantasma de cartões repetidos que ninguém consegue distinguir.
 */

const [, , filePath, ...flags] = process.argv;
const CONFIRMAR = flags.includes("--confirmar");

if (!filePath) {
  throw new Error(
    "Informe a planilha: npx tsx --conditions=react-server scripts/import-flashcards.ts <arquivo.xlsx>",
  );
}

const { parseFlashcards } = await import("../src/server/import/flashcards");
const { db } = await import("../src/server/db");
const { contentItems, flashcards } = await import("../src/server/db/schema");
const { loadCatalog, matchSubject, matchTopic } = await import(
  "../src/server/taxonomy/mapping"
);
const { eq } = await import("drizzle-orm");

const bytes = new Uint8Array(await readFile(filePath));
const result = parseFlashcards(bytes);

console.log(`\nPlanilha: ${filePath}`);
console.log(`Cartões lidos: ${result.cards.length}`);
console.log(`Problemas: ${result.issues.length}`);

for (const issue of result.issues.slice(0, 10)) {
  console.log(`  linha ${issue.row}: ${issue.message}`);
}
if (result.issues.length > 10) {
  console.log(`  ... e mais ${result.issues.length - 10}`);
}

console.log("\nBaralhos:");
for (const deck of result.decks) {
  console.log(`  ${deck.count.toString().padStart(4)} cartões · ${deck.subject} › ${deck.topic} › ${deck.deck}`);
}

if (!CONFIRMAR) {
  console.log("\nNada foi gravado. Rode de novo com --confirmar para importar.\n");
  process.exit(0);
}

console.log("\nImportando...\n");

const catalog = await loadCatalog();

let criados = 0;
let substituidos = 0;

for (const deck of result.decks) {
  /*
   * O baralho é ligado ao CATÁLOGO CANÔNICO, não ao texto da planilha. É o que
   * faz o cartão aparecer para o aluno cujo edital diz "Crase" tanto quanto
   * para o que diz "Uso do acento grave": os dois casam com o mesmo assunto
   * canônico. Amarrar ao texto literal deixaria o acervo invisível para boa
   * parte dos editais.
   *
   * ⚠️ E o casamento usa O MESMO CASADOR DO EDITAL, não comparação literal.
   * A planilha da cliente diz "Português"; o catálogo diz "Língua Portuguesa".
   * Comparar `normalized_name` direto reprovava a planilha inteira — e é
   * exatamente o problema que `matchSubject` já resolve, com apelidos e
   * similaridade. Duas formas de casar disciplina no mesmo sistema dariam dois
   * resultados diferentes para o mesmo nome.
   */
  const subjectMatch = matchSubject(deck.subject, catalog);

  if (!subjectMatch.canonicalId) {
    console.log(`  ⚠️  disciplina fora do catálogo, pulando: ${deck.subject}`);
    continue;
  }

  const topicMatch = matchTopic(deck.topic, subjectMatch.canonicalId, catalog);

  if (!topicMatch.canonicalId) {
    console.log(`  ⚠️  assunto fora do catálogo, pulando: ${deck.subject} › ${deck.topic}`);
    continue;
  }

  const subjectRow = { id: subjectMatch.canonicalId, name: deck.subject };
  const topicRow = { id: topicMatch.canonicalId, name: deck.topic };

  const cards = result.cards.filter(
    (c) => c.subject === deck.subject && c.topic === deck.topic && c.deck === deck.deck,
  );

  const existing = await db.query.contentItems.findFirst({
    where: (t, { and: e, eq: is, isNull: n }) =>
      e(is(t.type, "flashcard_deck"), is(t.title, deck.deck), is(t.canonicalTopicId, topicRow.id), n(t.deletedAt)),
    columns: { id: true },
  });

  const itemId =
    existing?.id ??
    (
      await db
        .insert(contentItems)
        .values({
          type: "flashcard_deck",
          title: deck.deck.slice(0, 240),
          canonicalSubjectId: subjectRow.id,
          canonicalTopicId: topicRow.id,
          requiredAccessLevel: cards[0]?.accessLevel ?? "limited",
          status: "published",
          publishedAt: new Date(),
        })
        .returning({ id: contentItems.id })
    )[0].id;

  if (existing) {
    await db.delete(flashcards).where(eq(flashcards.contentItemId, itemId));
    substituidos += 1;
  } else {
    criados += 1;
  }

  await db.insert(flashcards).values(
    cards.map((card) => ({
      contentItemId: itemId,
      front: card.front,
      back: card.back,
      hint: card.hint,
      sortOrder: card.sortOrder,
    })),
  );

  console.log(
    `  ✓ ${cards.length} cartões · ${deck.deck} (${existing ? "substituído" : "novo"}) ` +
      `→ ${subjectRow.name} › ${topicRow.name}`,
  );
}

console.log(`\nBaralhos novos: ${criados} · substituídos: ${substituidos}\n`);
