import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Reescreve `normalized_name` do catálogo com a chave certa.
 *
 *   npx tsx --conditions=react-server scripts/fix-catalog-keys.ts
 *   ... --confirmar
 *
 * POR QUE FOI PRECISO
 * ----------------------------------------------------------------------------
 * Assuntos cadastrados fora do seed entraram com `normalizeText` em vez de
 * `taxonomyKey`. As duas funções parecem a mesma coisa; `taxonomyKey` remove os
 * conectivos e é a que o casador usa dos dois lados. O resultado é um assunto
 * que existe no catálogo, aparece nas listagens e NUNCA casa com nada — falha
 * silenciosa, porque o cadastro em si funcionou.
 *
 * Este script alinha todo o catálogo à chave correta. É seguro rodar de novo:
 * quem já está certo não é tocado.
 */

const CONFIRMAR = process.argv.includes("--confirmar");

const { db } = await import("../src/server/db");
const { canonicalSubjects, canonicalTopics } = await import("../src/server/db/schema");
const { taxonomyKey } = await import("../src/modules/taxonomy/normalize");
const { eq } = await import("drizzle-orm");

const subjects = await db
  .select({ id: canonicalSubjects.id, name: canonicalSubjects.name, key: canonicalSubjects.normalizedName })
  .from(canonicalSubjects);

const topics = await db
  .select({ id: canonicalTopics.id, name: canonicalTopics.name, key: canonicalTopics.normalizedName })
  .from(canonicalTopics);

const subjectsFix = subjects.filter((r) => r.key !== taxonomyKey(r.name));
const topicsFix = topics.filter((r) => r.key !== taxonomyKey(r.name));

console.log(`\nDisciplinas com chave errada: ${subjectsFix.length} de ${subjects.length}`);
for (const r of subjectsFix) {
  console.log(`  ${r.name}\n     "${r.key}"  →  "${taxonomyKey(r.name)}"`);
}

console.log(`\nAssuntos com chave errada: ${topicsFix.length} de ${topics.length}`);
for (const r of topicsFix.slice(0, 30)) {
  console.log(`  ${r.name}\n     "${r.key}"  →  "${taxonomyKey(r.name)}"`);
}
if (topicsFix.length > 30) console.log(`  … e mais ${topicsFix.length - 30}`);

if (subjectsFix.length === 0 && topicsFix.length === 0) {
  console.log("\nCatálogo já está consistente.\n");
  process.exit(0);
}

if (!CONFIRMAR) {
  console.log("\nNada foi gravado. Rode de novo com --confirmar.\n");
  process.exit(0);
}

for (const row of subjectsFix) {
  await db
    .update(canonicalSubjects)
    .set({ normalizedName: taxonomyKey(row.name) })
    .where(eq(canonicalSubjects.id, row.id));
}

for (const row of topicsFix) {
  await db
    .update(canonicalTopics)
    .set({ normalizedName: taxonomyKey(row.name) })
    .where(eq(canonicalTopics.id, row.id));
}

console.log(
  `\nCorrigidos: ${subjectsFix.length} disciplina(s) e ${topicsFix.length} assunto(s).\n`,
);
