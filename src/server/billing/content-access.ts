import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { planContentAccess, subscriptions } from "@/server/db/schema";

/**
 * O QUE O PLANO DO ALUNO LIBERA, POR TIPO DE MATERIAL (README 2.5).
 * ============================================================================
 *
 * `plan_content_access` tem uma linha por (plano, tipo de conteúdo) com o nível
 * — `limited`, `extended` ou `full` — e um teto opcional de itens quando o
 * nível é limitado.
 *
 * ⚠️ A REGRA É POR TIPO, NÃO POR PLANO INTEIRO.
 *
 * Hoje os quatro tipos andam juntos dentro de cada plano, e seria tentador
 * resumir tudo a "este aluno é premium". No dia em que a cliente quiser liberar
 * videoaula no Intermediário e manter mapa mental no Premium — que é
 * exatamente o tipo de ajuste que ela vai querer fazer — o resumo teria que ser
 * desfeito em todos os lugares que o usam. Lendo por tipo desde o começo, essa
 * mudança vira uma linha no banco.
 *
 * SEM LINHA CADASTRADA, O MATERIAL É LIBERADO. A falta de uma regra não pode
 * virar bloqueio: um tipo novo de conteúdo apareceria trancado para todo mundo,
 * sem erro em lugar nenhum, e a descoberta viria por reclamação de aluno.
 */

export type ContentType =
  | "flashcard_deck"
  | "mind_map"
  | "video"
  | "study_text"
  | "pdf"
  | "audio"
  | "mindx";

export type AccessLevel = "limited" | "extended" | "full";

export type ContentAccess = {
  /** Nível por tipo. Ausente = liberado. */
  byType: Map<ContentType, { level: AccessLevel; maxItems: number | null }>;
  /** O aluno pode abrir um item que exige acesso completo? */
  canOpen(requiredLevel: AccessLevel, type: ContentType): boolean;
  /** Quantos itens deste tipo o plano deixa ver. `null` = sem teto. */
  maxItems(type: ContentType): number | null;
};

const ORDEM: Record<AccessLevel, number> = { limited: 0, extended: 1, full: 2 };

export async function getContentAccess(userId: string): Promise<ContentAccess> {
  const linhas = await db
    .select({
      contentType: planContentAccess.contentType,
      accessLevel: planContentAccess.accessLevel,
      maxItems: planContentAccess.maxItems,
    })
    .from(subscriptions)
    .innerJoin(planContentAccess, eq(planContentAccess.planId, subscriptions.planId))
    // A assinatura ATIVA. Todo aluno tem exatamente uma, inclusive no Free —
    // ver a nota em `schema/billing.ts`. Sem o filtro, uma assinatura cancelada
    // que ficou na tabela continuaria liberando material pago.
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")));

  const porTipo = new Map<ContentType, { level: AccessLevel; maxItems: number | null }>();
  for (const linha of linhas) {
    porTipo.set(linha.contentType, {
      level: linha.accessLevel,
      maxItems: linha.maxItems,
    });
  }

  return {
    byType: porTipo,

    canOpen(requiredLevel, type) {
      const regra = porTipo.get(type);
      if (!regra) return true;
      return ORDEM[regra.level] >= ORDEM[requiredLevel];
    },

    maxItems(type) {
      const regra = porTipo.get(type);
      // Teto só existe no nível limitado; nos outros ver tudo é o combinado.
      if (!regra || regra.level !== "limited") return null;
      return regra.maxItems;
    },
  };
}
