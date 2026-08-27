import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Ensina o catálogo a reconhecer como as bancas escrevem cada assunto.
 *
 *   npx tsx --conditions=react-server scripts/add-catalog-aliases.ts \
 *     "Lei 9.717/1998=LEI 9717 - RPPS" \
 *     "Gestão de pessoas no serviço público=Gestão de Pessoas"
 *   ... --confirmar
 *
 * Formato: "<Assunto do catálogo>=<Como a banca escreveu>"
 *
 * POR QUE APELIDO E NÃO ASSUNTO NOVO
 * ----------------------------------------------------------------------------
 * "Gestão de Pessoas" e "Gestão de pessoas no serviço público" são o mesmo
 * tema. Cadastrar os dois como assuntos separados divide o material e as
 * questões em duas pilhas que nunca se encontram — o aluno de um edital vê
 * metade do acervo.
 *
 * O apelido resolve na entrada: o casador passa a reconhecer as duas escritas
 * e ambas apontam para o MESMO assunto. Vale para todos os editais seguintes.
 */

const CONFIRMAR = process.argv.includes("--confirmar");
const pares = process.argv.slice(2).filter((arg) => !arg.startsWith("--") && arg.includes("="));

if (pares.length === 0) {
  throw new Error(
    'Uso: npx tsx --conditions=react-server scripts/add-catalog-aliases.ts "<Assunto>=<Apelido>" […]',
  );
}

const { db } = await import("../src/server/db");
const { canonicalTopicAliases } = await import("../src/server/db/schema");
const { loadCatalog, matchTopic } = await import("../src/server/taxonomy/mapping");
const { taxonomyKey } = await import("../src/modules/taxonomy/normalize");

const catalog = await loadCatalog();

type Planned = { topicId: string; topicName: string; alias: string };
const planned: Planned[] = [];

for (const par of pares) {
  const [canonical, alias] = par.split("=").map((s) => s.trim());

  const match = matchTopic(canonical, null, catalog);
  if (!match.canonicalId) {
    console.log(`  ✗ assunto não encontrado no catálogo: "${canonical}"`);
    continue;
  }

  const topicName = catalog.topics.find((t) => t.id === match.canonicalId)?.name ?? canonical;

  /*
   * Se o apelido JÁ casa com algum assunto, não cadastra.
   *
   * Um apelido que aponta para o assunto B enquanto o texto já casava com o
   * assunto A cria ambiguidade permanente no catálogo — e ela só aparece meses
   * depois, num edital em que o material vai parar na disciplina errada.
   */
  const jaCasa = matchTopic(alias, null, catalog);
  if (jaCasa.canonicalId && jaCasa.canonicalId !== match.canonicalId) {
    const outro = catalog.topics.find((t) => t.id === jaCasa.canonicalId)?.name;
    console.log(`  ✗ "${alias}" já casa com "${outro}" — cadastrar geraria ambiguidade`);
    continue;
  }

  if (jaCasa.canonicalId === match.canonicalId) {
    console.log(`  = "${alias}" já casa com "${topicName}"`);
    continue;
  }

  planned.push({ topicId: match.canonicalId, topicName, alias });
  console.log(`  + "${alias}"  →  ${topicName}`);
}

if (planned.length === 0) {
  console.log("\nNada a cadastrar.\n");
  process.exit(0);
}

if (!CONFIRMAR) {
  console.log(`\n${planned.length} apelido(s). Rode de novo com --confirmar.\n`);
  process.exit(0);
}

for (const item of planned) {
  await db
    .insert(canonicalTopicAliases)
    .values({
      topicId: item.topicId,
      alias: item.alias.slice(0, 300),
      normalizedAlias: taxonomyKey(item.alias).slice(0, 300),
      origin: "admin",
    })
    .onConflictDoNothing();

  console.log(`  ✓ ${item.alias}`);
}

console.log(`\nApelidos cadastrados: ${planned.length}\n`);
