import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Destrava leituras de edital que ficaram presas em "em andamento".
 *
 *   npx tsx --conditions=react-server scripts/expire-stuck-extractions.ts [--aplicar]
 *
 * A leitura roda dentro da requisição. Se o processo morre no meio — função
 * derrubada, memória estourada, timeout da plataforma — ninguém executa o
 * `catch` que marcaria a falha: a linha fica `running` para sempre, a
 * preparação fica `extracting`, e o aluno olha "Estamos lendo seu edital"
 * indefinidamente. Sem erro, sem botão, sem saída.
 *
 * A Home já cura sozinha desde 28/08/2026, na leitura do estado. Este script
 * existe para varrer o que ficou preso ANTES disso, e para quando alguém
 * quiser conferir a situação sem esperar o aluno abrir a tela.
 *
 * Roda em conferência por padrão. Só grava com `--aplicar`.
 */

const APLICAR = process.argv.includes("--aplicar");

const { db } = await import("../src/server/db");
const { editalExtractions, preparations, users } = await import("../src/server/db/schema");
const { expireStuckExtraction } = await import("../src/server/preparations/edital");
const { and, eq } = await import("drizzle-orm");

const presas = await db
  .select({
    extractionId: editalExtractions.id,
    preparationId: editalExtractions.preparationId,
    startedAt: editalExtractions.startedAt,
    title: preparations.title,
    email: users.email,
  })
  .from(editalExtractions)
  .innerJoin(preparations, eq(preparations.id, editalExtractions.preparationId))
  .innerJoin(users, eq(users.id, preparations.userId))
  .where(and(eq(editalExtractions.status, "running")));

console.log(`\nLeituras em andamento: ${presas.length}\n`);

for (const p of presas) {
  const minutos = p.startedAt
    ? Math.round((Date.now() - p.startedAt.getTime()) / 60_000)
    : null;
  console.log(
    `  ${p.email} · ${p.title} · começou há ${minutos ?? "?"} min` +
      (minutos !== null && minutos > 6 ? "  ⚠️ presa" : ""),
  );
}

if (!APLICAR) {
  console.log("\n(conferência — rode com --aplicar para destravar)\n");
  process.exit(0);
}

let destravadas = 0;
for (const p of presas) {
  if (await expireStuckExtraction(p.preparationId)) destravadas++;
}

console.log(`\n✓ ${destravadas} leitura(s) destravada(s). O aluno já vê o botão de reenviar.\n`);
