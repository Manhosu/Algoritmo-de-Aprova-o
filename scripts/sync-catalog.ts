import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Leva as disciplinas, assuntos e SINÔNIMOS de `catalog-data.ts` até o banco.
 *
 *   npm run catalog:sync
 *
 * ⚠️ EXISTE PARA NÃO PRECISAR RODAR A CARGA INICIAL INTEIRA.
 *
 * Acrescentar um sinônimo é a manutenção mais comum do catálogo, e `db:seed`
 * arrastaria junto planos, níveis, missões, documentos legais e questões de
 * exemplo. Contra um banco de produção com alunos dentro, isso é muito mais
 * escrita do que a tarefa pede.
 *
 * Tudo é upsert: rodar duas vezes não duplica nada.
 */

const { db } = await import("../src/server/db");
const { seedCatalog } = await import("../src/server/db/seed/index");

await seedCatalog(db);

console.log("\nCatálogo sincronizado.\n");
process.exit(0);
