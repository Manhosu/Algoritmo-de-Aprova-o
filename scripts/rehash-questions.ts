import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * RECALCULA `questions.content_hash` COM A FÓRMULA ATUAL.
 * ============================================================================
 *
 * ⚠️ SEM ISTO, A PROTEÇÃO CONTRA DUPLICATA NÃO VALE PARA O QUE JÁ EXISTE.
 *
 * Os hashes das questões no acervo foram gerados por uma versão anterior da
 * fórmula. O índice único continua lá, mas nunca casa: reimportar uma planilha
 * grava tudo de novo, sem erro e sem aviso, e o acervo dobra em silêncio.
 * Descobri isso importando uma planilha já importada e vendo 94 questões
 * entrarem pela segunda vez.
 *
 * A fórmula agora mora em `modules/questions/content-hash.ts`, com teste que
 * fixa o valor. Este script alinha o passado a ela.
 *
 * ⚠️ CONFERE COLISÃO ANTES DE ESCREVER. Se duas questões do acervo tiverem o
 * mesmo enunciado normalizado, o índice único recusa o UPDATE no meio do
 * caminho e o acervo fica com metade dos hashes velhos e metade novos — pior
 * que não ter rodado. Nesse caso o script para e lista os duplicados, para
 * alguém decidir qual fica.
 *
 *   npx tsx scripts/rehash-questions.ts           # confere
 *   npx tsx scripts/rehash-questions.ts --apply
 */

const APLICAR = process.argv.includes("--apply");

const [{ default: postgres }, { questionContentHash }] = await Promise.all([
  import("postgres"),
  import("../src/modules/questions/content-hash"),
]);

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 2 });

const questoes = await sql<Array<{ id: string; statement: string; content_hash: string | null }>>`
  select id, statement, content_hash from questions where deleted_at is null
`;

console.log(`Questões no acervo: ${questoes.length}`);

const novoHash = new Map<string, string>();
const porHash = new Map<string, string[]>();

for (const questao of questoes) {
  const hash = questionContentHash(questao.statement);
  novoHash.set(questao.id, hash);
  porHash.set(hash, [...(porHash.get(hash) ?? []), questao.id]);
}

const colisoes = [...porHash].filter(([, ids]) => ids.length > 1);
const desatualizados = questoes.filter((q) => novoHash.get(q.id) !== q.content_hash);

console.log(`Hashes desatualizados: ${desatualizados.length}`);
console.log(`Enunciados repetidos no acervo: ${colisoes.length}`);

if (colisoes.length > 0) {
  console.log("\nEstes enunciados aparecem mais de uma vez e impedem o recálculo:");

  for (const [, ids] of colisoes.slice(0, 10)) {
    const exemplo = questoes.find((q) => q.id === ids[0]);
    console.log(`  ${ids.length}x  ${exemplo?.statement.slice(0, 90)}…`);
    console.log(`       ids: ${ids.join(", ")}`);
  }

  console.log(
    "\nABORTADO. Remova as repetidas antes de recalcular — decidir qual fica é " +
      "escolha de conteúdo, não do script.\n",
  );
  await sql.end({ timeout: 5 });
  process.exit(1);
}

if (!APLICAR) {
  console.log("\nNada foi alterado. Rode com --apply para recalcular.\n");
  await sql.end({ timeout: 5 });
  process.exit(0);
}

let atualizadas = 0;

for (const questao of desatualizados) {
  await sql`
    update questions set content_hash = ${novoHash.get(questao.id)!} where id = ${questao.id}
  `;
  atualizadas += 1;
}

console.log(`\n${atualizadas} hashes recalculados.`);
console.log("A partir de agora, reimportar uma planilha não duplica o acervo.\n");

await sql.end({ timeout: 5 });
process.exit(0);
