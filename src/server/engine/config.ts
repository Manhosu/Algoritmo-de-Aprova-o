import "server-only";

import { and, eq } from "drizzle-orm";
import { cache } from "react";

import {
  ENGINE_CONFIG_DEFAULTS,
  parseEngineConfig,
  type EngineConfigKind,
} from "@/modules/engine-config/schemas";
import { db } from "@/server/db";
import { engineConfigs } from "@/server/db/schema";

/**
 * A CONFIGURAÇÃO ATIVA DOS MOTORES.
 * ============================================================================
 *
 * Decisão 14, fechada com o Eduardo: a configuração é VERSIONADA e IMUTÁVEL
 * depois do primeiro uso. Toda saída dos motores carrega o `engine_config_id`
 * que a produziu.
 *
 * A razão é auditoria: sem isso, calibrar os pesos amanhã tornaria toda a
 * história de ontem inexplicável — "por que este assunto caiu naquele dia?"
 * passaria a ser respondido com os pesos de hoje, que não são os que decidiram.
 *
 * O `lockedAt` é carimbado no primeiro uso por um gatilho no banco, e um
 * segundo gatilho recusa alteração em linha travada. Ou seja: a imutabilidade é
 * do banco, não desta camada — a aplicação não tem como violá-la nem por
 * engano.
 */

export type ActiveConfig<K extends EngineConfigKind> = {
  id: string | null;
  version: number;
  value: ReturnType<typeof parseEngineConfig<K>>;
};

/**
 * Lê a configuração ativa de um tipo.
 *
 * `cache()` memoiza por requisição: uma tela que gera a Tarefa do Dia lê pesos,
 * parâmetros de cronograma e técnicas — três leituras da mesma tabela que
 * viram uma.
 *
 * QUANDO NÃO HÁ CONFIGURAÇÃO ATIVA
 * ----------------------------------------------------------------------------
 * Cai nos padrões do README, com `id: null`. É degradação deliberada: um banco
 * recém-criado, ou uma migração que ainda não semeou, não pode derrubar a
 * geração da tarefa. Mas `id: null` NÃO pode ser gravado — `daily_tasks`
 * exige `engine_config_id` não-nulo, e é isso que impede uma tarefa órfã de
 * configuração chegar ao histórico.
 */
export const getActiveConfig = cache(
  async <K extends EngineConfigKind>(kind: K): Promise<ActiveConfig<K>> => {
    const [row] = await db
      .select({
        id: engineConfigs.id,
        version: engineConfigs.version,
        payload: engineConfigs.payload,
      })
      .from(engineConfigs)
      .where(and(eq(engineConfigs.kind, kind), eq(engineConfigs.isActive, true)))
      .limit(1);

    if (!row) {
      return {
        id: null,
        version: 0,
        value: ENGINE_CONFIG_DEFAULTS[kind] as ReturnType<typeof parseEngineConfig<K>>,
      };
    }

    /**
     * O payload é validado a cada leitura, não só na gravação.
     *
     * A tabela é editável pelo painel administrativo, e uma configuração
     * malformada gravada por ali derrubaria a geração da tarefa de todo mundo.
     * `parseEngineConfig` recusa e devolve o padrão — o produto continua de pé,
     * com pesos conhecidos, em vez de quebrar em silêncio.
     */
    return {
      id: row.id,
      version: row.version,
      value: parseEngineConfig(kind, row.payload),
    };
  },
);

/**
 * Devolve o id da configuração que precisa ser gravada junto com a saída.
 *
 * Lança quando não há configuração ativa: gravar uma Tarefa do Dia sem saber
 * com quais pesos ela foi produzida é exatamente o que a decisão 14 existe para
 * impedir. Melhor falhar na geração — e aparecer no log — do que produzir
 * histórico inexplicável em silêncio.
 */
export function requireConfigId(config: { id: string | null }, kind: string): string {
  if (!config.id) {
    throw new Error(
      `Nenhuma configuração ativa do tipo "${kind}". Rode "npm run db:config" antes de gerar tarefas.`,
    );
  }
  return config.id;
}
