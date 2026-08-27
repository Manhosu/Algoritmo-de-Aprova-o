import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Cadastra assuntos no catálogo canônico.
 *
 *   npx tsx --conditions=react-server scripts/add-catalog-topics.ts \
 *     "Língua Portuguesa" "Coesão e coerência" "Sinônimos e antônimos"
 *   ... --confirmar
 *
 * POR QUE ESTE SCRIPT EXISTE
 * ----------------------------------------------------------------------------
 * O catálogo é o GARGALO do produto. A leitura do edital funciona: ela extraiu
 * 80 assuntos do edital da cliente sem erro. Mas só 21% encontraram
 * correspondência, porque o catálogo tem 57 assuntos e o resto do Brasil
 * escreve o edital dele de outro jeito.
 *
 * Cada assunto cadastrado aqui faz três coisas de uma vez: liga o material que
 * já existe, permite que questões sejam produzidas para ele, e melhora o
 * casamento de TODOS os editais seguintes que citarem o mesmo tema.
 *
 * ⚠️ Idempotente pelo slug: rodar duas vezes atualiza em vez de duplicar.
 */

const [, , subjectName, ...rest] = process.argv;
const CONFIRMAR = rest.includes("--confirmar");
const topicNames = rest.filter((arg) => !arg.startsWith("--"));

if (!subjectName || topicNames.length === 0) {
  throw new Error(
    'Uso: npx tsx --conditions=react-server scripts/add-catalog-topics.ts "<Disciplina>" "<Assunto>" ["<Assunto>"…]',
  );
}

const { db } = await import("../src/server/db");
const { canonicalSubjects, canonicalTopics } = await import("../src/server/db/schema");
const { loadCatalog, matchSubject, matchTopic } = await import(
  "../src/server/taxonomy/mapping"
);
const { slugify, taxonomyKey } = await import("../src/modules/taxonomy/normalize");

/*
 * ⚠️ `taxonomyKey`, NUNCA `normalizeText`, para a coluna `normalized_name`.
 *
 * As duas parecem intercambiáveis e não são: `taxonomyKey` remove conectivos
 * ("de", "em", "e") e é ela que o casador usa dos DOIS lados. Cadastrar com
 * `normalizeText` grava "gestao de pessoas" enquanto o casador procura por
 * "gestao pessoas" — e o assunto recém-criado nunca casa com nada.
 *
 * Foi exatamente o que aconteceu na primeira tentativa: 25 assuntos entraram
 * no catálogo e 17 mapas mentais continuaram órfãos, como se o cadastro não
 * tivesse surtido efeito nenhum.
 */

let catalog = await loadCatalog();
let subject = matchSubject(subjectName, catalog);

/*
 * `--nova-disciplina` cria a disciplina quando ela não existe.
 *
 * ⚠️ EXIGE A FLAG, de propósito. Criar disciplina por engano — porque alguém
 * digitou "Portugues" e não casou — partiria o catálogo em dois troncos com o
 * mesmo conteúdo, e o casamento de editais passaria a depender de qual dos
 * dois a IA escreveu primeiro. Assunto novo é barato; disciplina nova é
 * estrutural.
 */
if (!subject.canonicalId) {
  if (!rest.includes("--nova-disciplina")) {
    throw new Error(
      `Disciplina fora do catálogo: ${subjectName}\n` +
        "Se ela realmente não existe, repita com --nova-disciplina.",
    );
  }

  if (!CONFIRMAR) {
    console.log(`\n+ disciplina NOVA: ${subjectName}  [${slugify(subjectName)}]`);
    console.log(`  (os assuntos abaixo entram nela)\n`);
  } else {
    await db
      .insert(canonicalSubjects)
      .values({
        name: subjectName,
        slug: slugify(subjectName),
        normalizedName: taxonomyKey(subjectName),
      })
      .onConflictDoNothing();

    console.log(`\n  ✓ disciplina criada: ${subjectName}`);
    catalog = await loadCatalog();
    subject = matchSubject(subjectName, catalog);
  }
}

if (!subject.canonicalId && CONFIRMAR) {
  throw new Error(`Não foi possível criar ou encontrar a disciplina: ${subjectName}`);
}

console.log(`\nDisciplina: ${subjectName}\n`);

const novos: Array<{ name: string; slug: string }> = [];

for (const name of topicNames) {
  if (!subject.canonicalId) {
    // Disciplina ainda não existe (ensaio de --nova-disciplina): tudo é novo.
    novos.push({ name, slug: slugify(name) });
    console.log(`  + novo: ${name}  [${slugify(name)}]`);
    continue;
  }

  /*
   * ⚠️ Passa pelo CASADOR antes de cadastrar.
   *
   * Sem isso, "Coesão e coerência textual" entraria como assunto novo mesmo
   * existindo "Coesão e coerência" — e o catálogo, que existe para unificar
   * como cada banca escreve, ganharia duas entradas para a mesma coisa. O
   * remédio viraria a doença.
   */
  const existing = matchTopic(name, subject.canonicalId, catalog);

  if (existing.canonicalId) {
    console.log(`  = já existe (${existing.matchedBy}): ${name}`);
    continue;
  }

  novos.push({ name, slug: slugify(name) });
  console.log(`  + novo: ${name}  [${slugify(name)}]`);
}

if (novos.length === 0) {
  console.log("\nNada a cadastrar.\n");
  process.exit(0);
}

if (!CONFIRMAR) {
  console.log(`\n${novos.length} a cadastrar. Rode de novo com --confirmar.\n`);
  process.exit(0);
}

const subjectId = subject.canonicalId;
if (!subjectId) throw new Error("Disciplina não resolvida.");

for (const topic of novos) {
  await db
    .insert(canonicalTopics)
    .values({
      subjectId,
      name: topic.name,
      slug: topic.slug,
      normalizedName: taxonomyKey(topic.name),
      // Assunto de primeiro nível: o caminho é o próprio slug e a profundidade
      // é zero. Subtemas (como os de Crase) são criados pelo seed, com pai.
      path: topic.slug,
      depth: 0,
    })
    .onConflictDoUpdate({
      target: canonicalTopics.slug,
      set: { name: topic.name, normalizedName: taxonomyKey(topic.name) },
    });

  console.log(`  ✓ ${topic.name}`);
}

console.log(`\nCadastrados: ${novos.length}\n`);
