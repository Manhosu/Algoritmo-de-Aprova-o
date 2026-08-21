import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../src/server/db/schema";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Publica uma versão de documento legal — marca `is_current`.
 *
 * ⚠️ Publicar significa colocar NO AR, na página pública. O seed insere a
 * Política de Privacidade como rascunho (`is_current = false`) justamente para
 * que ninguém a publique sem querer.
 *
 * Uso:
 *   npx tsx scripts/publish-legal.ts privacy 0.1-rascunho
 *
 * Só uma versão fica corrente por tipo: publicar despublica a anterior, na
 * mesma transação.
 */

async function main() {
  const type = process.argv[2] as "privacy" | "terms" | undefined;
  const version = process.argv[3];

  if (!type || !["privacy", "terms"].includes(type) || !version) {
    console.error('Uso: npx tsx scripts/publish-legal.ts <privacy|terms> <versão>');
    process.exit(1);
  }

  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");

  const connection = postgres(url, { max: 1, prepare: false });
  const db = drizzle(connection, { schema, casing: "snake_case" });

  try {
    const target = await db.query.legalDocuments.findFirst({
      where: (t, { and: a, eq: e }) => a(e(t.type, type), e(t.version, version)),
      columns: { id: true, title: true, isCurrent: true },
    });

    if (!target) {
      console.error(`Não existe ${type} versão "${version}".`);
      process.exit(1);
    }

    if (target.isCurrent) {
      console.log(`A versão ${version} já está publicada.`);
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(schema.legalDocuments)
        .set({ isCurrent: false })
        .where(
          and(
            eq(schema.legalDocuments.type, type),
            eq(schema.legalDocuments.isCurrent, true),
          ),
        );

      await tx
        .update(schema.legalDocuments)
        .set({ isCurrent: true })
        .where(eq(schema.legalDocuments.id, target.id));
    });

    console.log(`Publicado: ${target.title} ${version}`);
    if (version.includes("rascunho")) {
      console.log("");
      console.log("⚠️  Esta versão está marcada como RASCUNHO e agora está NO AR.");
      console.log("    Ela descreve corretamente o que o sistema faz, mas não foi");
      console.log("    revisada por advogado. Substitua antes do lançamento.");
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
