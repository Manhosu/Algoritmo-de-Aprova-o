import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Importa uma PASTA de material da cliente para o acervo.
 *
 *   npx tsx --conditions=react-server scripts/import-content.ts <pasta> <tipo> "<Disciplina>"
 *   ... --confirmar          para gravar de verdade
 *   ... --assunto "Crase"    para forçar o assunto de todos os arquivos
 *
 * Tipos: mind_map | study_text
 *
 * Sem `--confirmar` ele só mostra o que faria, incluindo o assunto que casou
 * para cada arquivo. É a última chance de ver que "Regência Nominal 4" foi
 * cair no assunto errado antes de 30 arquivos entrarem no banco.
 *
 * ⚠️ IDEMPOTENTE POR TÍTULO + ASSUNTO. Rodar duas vezes na mesma pasta
 * substitui em vez de duplicar.
 */

const [, , folder, rawType, rawSubject, ...flags] = process.argv;
const CONFIRMAR = flags.includes("--confirmar");
const assuntoForcado = flags.includes("--assunto")
  ? flags[flags.indexOf("--assunto") + 1]
  : null;

if (!folder || !rawType || !rawSubject) {
  throw new Error(
    'Uso: npx tsx --conditions=react-server scripts/import-content.ts <pasta> <mind_map|study_text> "<Disciplina>"',
  );
}

if (rawType !== "mind_map" && rawType !== "study_text") {
  throw new Error(`Tipo inválido: ${rawType}. Use mind_map ou study_text.`);
}

const { identifyMedia, parseMediaTitle } = await import("../src/server/import/media");
const { db } = await import("../src/server/db");
const { contentItems } = await import("../src/server/db/schema");
const { putContentFile } = await import("../src/server/storage");
const { loadCatalog, matchSubject, matchTopic } = await import(
  "../src/server/taxonomy/mapping"
);
const { eq } = await import("drizzle-orm");

/** Percorre a pasta inteira, inclusive subpastas. */
async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(full)));
    else files.push(full);
  }

  return files.sort();
}

const catalog = await loadCatalog();
const subjectMatch = matchSubject(rawSubject, catalog);

if (!subjectMatch.canonicalId) {
  throw new Error(`Disciplina fora do catálogo: ${rawSubject}`);
}

const files = await listFiles(folder);
console.log(`\nPasta: ${folder}`);
console.log(`Tipo: ${rawType} · Disciplina: ${rawSubject}`);
console.log(`Arquivos encontrados: ${files.length}\n`);

type Planned = {
  path: string;
  title: string;
  sortOrder: number;
  mimeType: "image/png" | "image/jpeg" | "application/pdf";
  width: number | null;
  height: number | null;
  bytes: Uint8Array;
  topicId: string | null;
  subjectId: string | null;
  topicLabel: string;
};

const planned: Planned[] = [];
const skipped: string[] = [];

for (const path of files) {
  const info = await stat(path);
  if (info.size === 0) {
    skipped.push(`${basename(path)} — arquivo vazio`);
    continue;
  }

  const bytes = new Uint8Array(await readFile(path));
  const media = identifyMedia(bytes);

  if (!media) {
    skipped.push(`${basename(path)} — não é PNG, JPEG nem PDF`);
    continue;
  }

  const { title, sortOrder, matchKey } = parseMediaTitle(basename(path));

  /*
   * O assunto vem do TÍTULO do arquivo, casado contra o catálogo.
   *
   * "Concordância Nominal e Verbal - 1" casa com o assunto "Concordância
   * nominal e verbal"; o "- 1" do fim é a ordem dentro da série e não
   * atrapalha o casamento por similaridade.
   *
   * Quando não casa, o item entra SEM assunto em vez de ser descartado: um
   * material sem etiqueta ainda aparece no acervo e pode ser corrigido no
   * painel; um material não importado precisa ser lembrado.
   */
  const alvo = assuntoForcado ?? matchKey;

  /*
   * ⚠️ O ASSUNTO É PROCURADO EM TODO O CATÁLOGO, não só na disciplina do
   * argumento — e é ELE quem decide a disciplina do item.
   *
   * A pasta "Mapas Mentais" da cliente mistura Administração Pública e
   * Previdência no mesmo diretório, que é como o material dela é organizado de
   * verdade. Prendendo a busca à disciplina informada, metade dos arquivos
   * ficava órfã e a única saída seria separar as pastas na mão antes de cada
   * importação.
   *
   * A disciplina do argumento continua valendo como PADRÃO, para os arquivos
   * que não casarem com assunto nenhum.
   */
  const topicMatch = matchTopic(alvo, null, catalog);
  const topicSubjectId = topicMatch.canonicalId
    ? (catalog.topics.find((t) => t.id === topicMatch.canonicalId)?.subjectId ?? null)
    : null;

  planned.push({
    path,
    title,
    sortOrder,
    mimeType: media.mimeType,
    width: media.width,
    height: media.height,
    bytes,
    topicId: topicMatch.canonicalId,
    subjectId: topicSubjectId ?? subjectMatch.canonicalId,
    topicLabel: topicMatch.canonicalId
      ? `casou (${topicMatch.matchedBy})${topicSubjectId !== subjectMatch.canonicalId ? " · outra disciplina" : ""}`
      : "SEM ASSUNTO",
  });
}

for (const item of planned) {
  const dim = item.width ? `${item.width}×${item.height}` : "—";
  console.log(
    `  ${String(item.sortOrder).padStart(2)} · ${item.title.slice(0, 58).padEnd(58)} ` +
      `${dim.padStart(11)}  ${item.topicLabel}`,
  );
}

if (skipped.length > 0) {
  console.log(`\nIgnorados (${skipped.length}):`);
  for (const s of skipped) console.log(`  ${s}`);
}

const semAssunto = planned.filter((p) => !p.topicId).length;
console.log(
  `\nTotal a importar: ${planned.length}` +
    (semAssunto > 0 ? ` · ${semAssunto} sem assunto casado` : ""),
);

if (!CONFIRMAR) {
  console.log("\nNada foi gravado. Rode de novo com --confirmar.\n");
  process.exit(0);
}

console.log("\nImportando...\n");

let criados = 0;
let substituidos = 0;

for (const item of planned) {
  /*
   * ⚠️ O `sortOrder` ENTRA NA CHAVE, não só o título.
   *
   * A pasta de RPPS tem CINCO arquivos chamados "LEI 9717 - RPPS", numerados
   * de 1 a 5 — são as cinco páginas do mesmo mapa. Procurando só pelo título,
   * o segundo arquivo era tratado como reenvio do primeiro: sobrava um item
   * com cinco uploads por cima, e quatro páginas do material sumiam sem erro
   * nenhum aparecer.
   */
  const existing = await db.query.contentItems.findFirst({
    where: (t, { and: e, eq: is, isNull: n }) =>
      e(
        is(t.type, rawType),
        is(t.title, item.title.slice(0, 240)),
        is(t.sortOrder, item.sortOrder),
        n(t.deletedAt),
      ),
    columns: { id: true },
  });

  const itemId =
    existing?.id ??
    (
      await db
        .insert(contentItems)
        .values({
          type: rawType,
          title: item.title.slice(0, 240),
          canonicalSubjectId: item.subjectId,
          canonicalTopicId: item.topicId,
          requiredAccessLevel: "limited",
          status: "published",
          sortOrder: item.sortOrder,
          publishedAt: new Date(),
        })
        .returning({ id: contentItems.id })
    )[0].id;

  const stored = await putContentFile({
    contentItemId: itemId,
    mimeType: item.mimeType,
    bytes: item.bytes,
  });

  await db
    .update(contentItems)
    .set({
      storagePath: stored.storagePath,
      fileSizeBytes: stored.sizeBytes,
      imageWidth: item.width,
      imageHeight: item.height,
      canonicalSubjectId: item.subjectId,
      canonicalTopicId: item.topicId,
      sortOrder: item.sortOrder,
      status: "published",
    })
    .where(eq(contentItems.id, itemId));

  if (existing) substituidos += 1;
  else criados += 1;

  console.log(`  ✓ ${item.title.slice(0, 60)}`);
}

console.log(`\nNovos: ${criados} · substituídos: ${substituidos}\n`);
