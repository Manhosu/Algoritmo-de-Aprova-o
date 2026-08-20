import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  ENGINE_CONFIG_DEFAULTS,
  parseEngineConfig,
  type EngineConfigKind,
} from "@/modules/engine-config/schemas";

import * as schema from "../src/server/db/schema";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Publica uma nova versão de uma configuração de motor.
 *
 * NUNCA edita a versão vigente: cria a seguinte e ativa. É a regra registrada
 * na decisão 14 e garantida por gatilho no banco — uma configuração já usada é
 * imutável, para a Tarefa do Dia de ontem continuar explicável hoje.
 *
 * Uso:
 *   npx tsx scripts/activate-engine-config.ts study_techniques "motivo da mudança"
 *
 * O payload publicado é o padrão atual do código
 * (`ENGINE_CONFIG_DEFAULTS`), então o fluxo é: alterar o default em
 * `src/modules/engine-config/schemas.ts`, rodar este script, conferir.
 *
 * Quando o painel administrativo existir (Marco 2), ele fará exatamente isto —
 * com a diferença de receber o payload do formulário em vez do código.
 */

async function main() {
  const kind = process.argv[2] as EngineConfigKind | undefined;
  const note = process.argv[3] ?? "Alteração publicada pelo script de manutenção.";

  const validKinds = Object.keys(ENGINE_CONFIG_DEFAULTS) as EngineConfigKind[];
  if (!kind || !validKinds.includes(kind)) {
    console.error(`Tipo inválido. Use um destes:\n  ${validKinds.join("\n  ")}`);
    process.exit(1);
  }

  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");

  const connection = postgres(url, { max: 1, prepare: false });
  const db = drizzle(connection, { schema, casing: "snake_case" });

  try {
    // Valida ANTES de tocar no banco: configuração inválida geraria tarefas
    // erradas em silêncio.
    const payload = parseEngineConfig(kind, ENGINE_CONFIG_DEFAULTS[kind]);

    const current = await db.query.engineConfigs.findFirst({
      where: (t, { and: a, eq: e }) => a(e(t.kind, kind), e(t.isActive, true)),
    });

    if (!current) {
      console.error(`Não há versão ativa de "${kind}". Rode o seed primeiro.`);
      process.exit(1);
    }

    if (JSON.stringify(current.payload) === JSON.stringify(payload)) {
      console.log(`Nada a fazer: a v${current.version} já tem exatamente este conteúdo.`);
      return;
    }

    console.log(`Publicando ${kind}: v${current.version} → v${current.version + 1}\n`);
    console.log("  atual: ", JSON.stringify(current.payload));
    console.log("  nova:  ", JSON.stringify(payload));

    await db.transaction(async (tx) => {
      // Aposenta a vigente. `is_active` e `retired_at` continuam editáveis
      // mesmo numa versão travada — o gatilho protege o conteúdo, não o ciclo
      // de vida.
      await tx
        .update(schema.engineConfigs)
        .set({ isActive: false, retiredAt: new Date() })
        .where(and(eq(schema.engineConfigs.kind, kind), eq(schema.engineConfigs.isActive, true)));

      await tx.insert(schema.engineConfigs).values({
        kind,
        version: current.version + 1,
        payload,
        isActive: true,
        activatedAt: new Date(),
        changeNote: note,
      });
    });

    console.log(`\nPublicada. A v${current.version} fica no histórico, intacta.`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
