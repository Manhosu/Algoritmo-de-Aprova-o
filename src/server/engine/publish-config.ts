import "server-only";

import { and, desc, eq } from "drizzle-orm";

import {
  ENGINE_CONFIG_SCHEMAS,
  type EngineConfigKind,
} from "@/modules/engine-config/schemas";
import { db } from "@/server/db";
import { engineConfigs } from "@/server/db/schema";

/**
 * PUBLICAR UMA CONFIGURAÇÃO DE MOTOR PELO PAINEL.
 * ============================================================================
 *
 * README 2.6: "pesos do Motor da Tarefa do Dia editáveis" e "valores de XP por
 * atividade editáveis", sem alterar código.
 *
 * ⚠️ VERSÃO NOVA, NUNCA EDIÇÃO NO LUGAR — e isso não é preciosismo.
 *
 * Cada lançamento de XP grava o `engine_config_id` que o produziu, e cada
 * Tarefa do Dia guarda os pesos com que foi montada. Editar a linha ativa
 * reescreveria o passado: o XP creditado ontem passaria a apontar para valores
 * que não existiam ontem, e "por que este assunto veio primeiro na terça?"
 * viraria pergunta sem resposta.
 *
 * Publicar cria uma versão e aposenta a anterior na MESMA transação. O
 * histórico continua apontando para a versão com que cada coisa foi feita.
 */

export type PublishResult =
  | { ok: true; version: number }
  | { ok: false; problems: string[] };

export async function publishEngineConfig<K extends EngineConfigKind>(input: {
  kind: K;
  payload: unknown;
  userId: string;
  note?: string | null;
}): Promise<PublishResult> {
  const schema = ENGINE_CONFIG_SCHEMAS[input.kind];
  const conferido = schema.safeParse(input.payload);

  if (!conferido.success) {
    return {
      ok: false,
      problems: conferido.error.issues.map(
        (problema) =>
          `${problema.path.join(" › ") || "configuração"}: ${problema.message}`,
      ),
    };
  }

  const version = await db.transaction(async (tx) => {
    const [ultima] = await tx
      .select({ version: engineConfigs.version })
      .from(engineConfigs)
      .where(eq(engineConfigs.kind, input.kind))
      .orderBy(desc(engineConfigs.version))
      .limit(1);

    const proxima = (ultima?.version ?? 0) + 1;
    const agora = new Date();

    await tx
      .update(engineConfigs)
      .set({ isActive: false, retiredAt: agora })
      .where(and(eq(engineConfigs.kind, input.kind), eq(engineConfigs.isActive, true)));

    await tx.insert(engineConfigs).values({
      kind: input.kind,
      version: proxima,
      payload: conferido.data,
      isActive: true,
      activatedAt: agora,
      createdByUserId: input.userId,
      changeNote: input.note?.trim() || null,
    });

    return proxima;
  });

  return { ok: true, version };
}

export type ConfigVersion = {
  version: number;
  isActive: boolean;
  note: string | null;
  activatedAt: Date | null;
  createdAt: Date;
};

/** O histórico de uma configuração, da mais recente para a mais antiga. */
export async function listConfigVersions(kind: EngineConfigKind): Promise<ConfigVersion[]> {
  return db
    .select({
      version: engineConfigs.version,
      isActive: engineConfigs.isActive,
      note: engineConfigs.changeNote,
      activatedAt: engineConfigs.activatedAt,
      createdAt: engineConfigs.createdAt,
    })
    .from(engineConfigs)
    .where(eq(engineConfigs.kind, kind))
    .orderBy(desc(engineConfigs.version))
    .limit(20);
}
