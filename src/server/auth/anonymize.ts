import "server-only";

import { and, eq, lte, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  authSessions,
  dataDeletionRequests,
  userIdentities,
  users,
  verificationTokens,
} from "@/server/db/schema";

/**
 * EXECUÇÃO DA EXCLUSÃO DE CONTA (LGPD art. 18).
 * ============================================================================
 *
 * PSEUDONIMIZAÇÃO, NÃO `DELETE`.
 * ----------------------------------------------------------------------------
 * Apagar a linha de `users` levaria junto muito mais do que os dados da pessoa:
 *
 *   • o histórico do funil, que é contado por coorte e não se refaz;
 *   • as estatísticas de turma ("onde a turma mais erra"), que são o insumo do
 *     painel administrativo;
 *   • o registro financeiro, que tem prazo de guarda legal e por isso está
 *     protegido por `ON DELETE RESTRICT` em `subscriptions` — um `DELETE`
 *     simplesmente falharia.
 *
 * O que a lei exige é que o dado deixe de ser atribuível a uma pessoa
 * identificável. É exatamente o que acontece aqui: nome, e-mail, WhatsApp,
 * senha e avatar são apagados, e a `pseudonym_key` — o HMAC irreversível que
 * liga as métricas — é DESTRUÍDA junto.
 *
 * ⚠️ Destruir a `pseudonym_key` é o que torna a anonimização irreversível de
 * verdade. Sem ela, o pepper mais o id original permitiriam reconstruir a chave
 * e voltar a costurar o histórico àquela pessoa. Com ela apagada, as linhas de
 * métrica que já a referenciam continuam somando como um número anônimo, e
 * nenhum caminho leva de volta ao indivíduo.
 *
 * As duas CHECKs em `users` transformam isso em invariante de BANCO: uma conta
 * `anonymized` com qualquer campo de identificação preenchido é REJEITADA pelo
 * Postgres. Não é uma promessa desta função — é uma regra que ela não consegue
 * violar nem por engano.
 */

export type AnonymizationReport = {
  userId: string;
  sessionsRevoked: number;
  tokensRemoved: number;
  identitiesRemoved: number;
};

/**
 * Anonimiza uma conta. Idempotente: rodar duas vezes não muda nada na segunda.
 */
export async function anonymizeUser(
  userId: string,
  now = new Date(),
): Promise<AnonymizationReport | null> {
  const user = await db.query.users.findFirst({
    where: (t, { eq: e }) => e(t.id, userId),
    columns: { id: true, status: true },
  });

  if (!user || user.status === "anonymized") return null;

  const report: AnonymizationReport = {
    userId,
    sessionsRevoked: 0,
    tokensRemoved: 0,
    identitiesRemoved: 0,
  };

  await db.transaction(async (tx) => {
    const revoked = await tx
      .update(authSessions)
      .set({ revokedAt: now, revokedReason: "account_anonymized" })
      .where(and(eq(authSessions.userId, userId), sql`${authSessions.revokedAt} is null`))
      .returning({ id: authSessions.id });
    report.sessionsRevoked = revoked.length;

    const tokens = await tx
      .delete(verificationTokens)
      .where(eq(verificationTokens.userId, userId))
      .returning({ id: verificationTokens.id });
    report.tokensRemoved = tokens.length;

    // Identidade externa (Google) é dado de terceiro ligado à pessoa: sai.
    const identities = await tx
      .delete(userIdentities)
      .where(eq(userIdentities.userId, userId))
      .returning({ id: userIdentities.id });
    report.identitiesRemoved = identities.length;

    /**
     * A ordem dos campos aqui não é estética: a CHECK
     * `users_anonymized_scrubbed_check` exige que TODOS estejam nulos quando o
     * status é `anonymized`. Esquecer um faz o Postgres recusar o UPDATE
     * inteiro — que é precisamente a proteção que se quer.
     */
    await tx
      .update(users)
      .set({
        name: null,
        email: null,
        whatsapp: null,
        passwordHash: null,
        avatarUrl: null,
        pseudonymKey: null,
        status: "anonymized",
        anonymizedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, userId));
  });

  return report;
}

/**
 * Executa os pedidos de exclusão cujo prazo venceu.
 *
 * Rodada por tarefa agendada. Devolve o relatório de cada conta processada.
 */
export async function runDueDeletions(now = new Date()): Promise<AnonymizationReport[]> {
  const due = await db
    .select({ id: dataDeletionRequests.id, userId: dataDeletionRequests.userId })
    .from(dataDeletionRequests)
    .where(
      and(
        eq(dataDeletionRequests.status, "pending"),
        lte(dataDeletionRequests.scheduledFor, now),
      ),
    );

  const reports: AnonymizationReport[] = [];

  for (const request of due) {
    // Marca como em processamento ANTES de agir: se o processo morrer no meio,
    // a linha não fica presa em "pending" para ser reprocessada eternamente, e
    // fica visível para quem for investigar.
    await db
      .update(dataDeletionRequests)
      .set({ status: "processing", updatedAt: now })
      .where(eq(dataDeletionRequests.id, request.id));

    const report = await anonymizeUser(request.userId, now);
    if (report) reports.push(report);

    await db
      .update(dataDeletionRequests)
      .set({
        status: "completed",
        executedAt: now,
        executionReport: {
          deletedTables: {
            verification_tokens: report?.tokensRemoved ?? 0,
            user_identities: report?.identitiesRemoved ?? 0,
          },
          anonymizedTables: { users: report ? 1 : 0 },
        },
        updatedAt: now,
      })
      .where(eq(dataDeletionRequests.id, request.id));
  }

  return reports;
}
