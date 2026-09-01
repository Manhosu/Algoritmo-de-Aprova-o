import "server-only";

import { desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  editalExtractions,
  preparationDocuments,
  preparations,
  users,
} from "@/server/db/schema";

/**
 * TODOS OS EDITAIS ENVIADOS PELOS ALUNOS (README 2.6).
 * ============================================================================
 *
 * A cliente pediu isto em negrito, e a razão é operacional: quando a leitura de
 * um edital sai ruim, ela precisa ver QUAL arquivo era, o que a IA extraiu dele
 * e quanto aquilo custou. Sem esta tela, a única forma de investigar seria pedir
 * o PDF de volta ao aluno.
 *
 * ⚠️ O ARQUIVO NÃO É SERVIDO AQUI, e isso é deliberado.
 *
 * O que aparece é o nome, o tamanho, o resultado da leitura e o custo. Baixar o
 * PDF de um aluno é outra coisa: é acesso a um documento que ele enviou para uma
 * finalidade específica, e a Política de Privacidade não prevê a equipe abrindo
 * arquivos de alunos por curiosidade. Se a operação precisar disso, vira um
 * botão com registro de quem baixou e quando, e uma linha na política.
 */

export type EditalRow = {
  documentId: string;
  fileName: string;
  sizeBytes: number;
  pageCount: number | null;
  uploadedAt: Date;

  studentName: string | null;
  studentEmail: string | null;

  preparationTitle: string | null;
  targetPosition: string;
  institution: string | null;

  /** Resultado da última leitura deste documento. */
  status: string | null;
  model: string | null;
  durationMs: number | null;
  costCents: number | null;
  subjectCount: number | null;
  topicCount: number | null;
  errorMessage: string | null;
  attempts: number;
};

export async function listEditais(limit = 60): Promise<EditalRow[]> {
  /*
    Um documento pode ter várias tentativas de leitura — a primeira falha, a
    segunda funciona. `distinct on` traz a MAIS RECENTE de cada, que é a que
    conta: uma tela que mostrasse a primeira diria "falhou" sobre um edital que
    o aluno está usando sem problema.
  */
  const ultimaLeitura = db
    .selectDistinctOn([editalExtractions.documentId], {
      documentId: editalExtractions.documentId,
      status: editalExtractions.status,
      model: editalExtractions.model,
      durationMs: editalExtractions.durationMs,
      costCents: editalExtractions.estimatedCostCents,
      subjectCount: editalExtractions.extractedSubjectCount,
      topicCount: editalExtractions.extractedTopicCount,
      errorMessage: editalExtractions.errorMessage,
      attemptNumber: editalExtractions.attemptNumber,
    })
    .from(editalExtractions)
    .orderBy(editalExtractions.documentId, desc(editalExtractions.createdAt))
    .as("ultima");

  return db
    .select({
      documentId: preparationDocuments.id,
      fileName: preparationDocuments.fileName,
      sizeBytes: preparationDocuments.sizeBytes,
      pageCount: preparationDocuments.pageCount,
      uploadedAt: preparationDocuments.uploadedAt,

      studentName: users.name,
      studentEmail: users.email,

      preparationTitle: preparations.title,
      targetPosition: preparations.targetPosition,
      institution: preparations.institution,

      status: ultimaLeitura.status,
      model: ultimaLeitura.model,
      durationMs: ultimaLeitura.durationMs,
      costCents: ultimaLeitura.costCents,
      subjectCount: ultimaLeitura.subjectCount,
      topicCount: ultimaLeitura.topicCount,
      errorMessage: ultimaLeitura.errorMessage,
      attempts: sql<number>`coalesce(${ultimaLeitura.attemptNumber}, 0)::int`,
    })
    .from(preparationDocuments)
    .innerJoin(preparations, eq(preparations.id, preparationDocuments.preparationId))
    .leftJoin(users, eq(users.id, preparations.userId))
    .leftJoin(ultimaLeitura, eq(ultimaLeitura.documentId, preparationDocuments.id))
    .where(isNull(preparationDocuments.deletedAt))
    .orderBy(desc(preparationDocuments.uploadedAt))
    .limit(limit);
}

export type EditalSummary = {
  total: number;
  succeeded: number;
  failed: number;
  /** Custo acumulado da leitura, em centavos. */
  totalCostCents: number;
  /** Documentos distintos, para medir o reaproveitamento entre alunos. */
  distinctFiles: number;
};

/**
 * O resumo do topo.
 *
 * ⚠️ `distinctFiles` compara com `total` para mostrar o REAPROVEITAMENTO: dois
 * alunos do mesmo concurso enviam o mesmo PDF, e o segundo não paga leitura
 * nenhuma. É a economia mais direta do produto, e sem este número ela fica
 * invisível.
 */
export async function editaisSummary(): Promise<EditalSummary> {
  const [linha] = await db
    .select({
      total: sql<number>`count(*)::int`,
      distinctFiles: sql<number>`count(distinct ${preparationDocuments.checksum})::int`,
    })
    .from(preparationDocuments)
    .where(isNull(preparationDocuments.deletedAt));

  const [leituras] = await db
    .select({
      succeeded: sql<number>`count(*) filter (where ${editalExtractions.status} = 'succeeded')::int`,
      failed: sql<number>`count(*) filter (where ${editalExtractions.status} = 'failed')::int`,
      totalCostCents: sql<number>`coalesce(sum(${editalExtractions.estimatedCostCents}), 0)::int`,
    })
    .from(editalExtractions);

  return {
    total: linha?.total ?? 0,
    distinctFiles: linha?.distinctFiles ?? 0,
    succeeded: leituras?.succeeded ?? 0,
    failed: leituras?.failed ?? 0,
    totalCostCents: leituras?.totalCostCents ?? 0,
  };
}
