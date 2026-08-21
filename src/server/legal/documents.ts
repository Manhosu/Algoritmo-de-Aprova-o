import "server-only";

import { db } from "@/server/db";

/**
 * Leitura dos documentos legais publicados.
 *
 * Só devolve o que está marcado como `is_current`. O seed insere a Política de
 * Privacidade com `is_current = false` de propósito — é rascunho técnico,
 * pendente de revisão jurídica, e não pode ir ao ar por acidente.
 */

export type LegalDocumentView = {
  type: "privacy" | "terms";
  version: string;
  title: string;
  content: string;
  effectiveFrom: Date;
};

export async function getCurrentLegalDocument(
  type: "privacy" | "terms",
): Promise<LegalDocumentView | null> {
  const row = await db.query.legalDocuments.findFirst({
    where: (t, { and, eq }) => and(eq(t.type, type), eq(t.isCurrent, true)),
    columns: {
      type: true,
      version: true,
      title: true,
      content: true,
      effectiveFrom: true,
    },
  });

  return row ?? null;
}

/**
 * A versão vigente, só com os metadados.
 *
 * Usada no cadastro para amarrar o consentimento à versão aceita, sem carregar
 * o texto inteiro do documento numa transação.
 */
export async function getCurrentLegalDocumentId(
  type: "privacy" | "terms",
): Promise<{ id: string; version: string } | null> {
  const row = await db.query.legalDocuments.findFirst({
    where: (t, { and, eq }) => and(eq(t.type, type), eq(t.isCurrent, true)),
    columns: { id: true, version: true },
  });

  return row ?? null;
}
