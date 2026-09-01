import "server-only";

import { and, count, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  canonicalSubjects,
  contentItems,
  examBoards,
  questionImportBatches,
  questions,
} from "@/server/db/schema";

/**
 * O ACERVO VISTO DE CIMA.
 * ============================================================================
 *
 * README 2.6: o painel precisa mostrar o banco de questões e a biblioteca de
 * materiais por disciplina, com o que está publicado e o que está em rascunho.
 *
 * ⚠️ TUDO AGREGADO NO BANCO, nunca listando as linhas para contar em JavaScript.
 * São 1.046 questões hoje e a meta da cliente é dez mil; trazer todas para
 * somar no servidor Node funcionaria na demonstração e cairia na primeira
 * importação grande.
 */

export type SubjectQuestionRow = {
  subject: string;
  published: number;
  draft: number;
  withoutTopic: number;
};

/** Questões por disciplina, separando o que está no ar do que é rascunho. */
export async function questionsBySubject(): Promise<SubjectQuestionRow[]> {
  const linhas = await db
    .select({
      subject: canonicalSubjects.name,
      published: sql<number>`count(*) filter (where ${questions.status} = 'published')::int`,
      draft: sql<number>`count(*) filter (where ${questions.status} = 'draft')::int`,
      withoutTopic: sql<number>`count(*) filter (where ${questions.canonicalTopicId} is null)::int`,
    })
    .from(questions)
    .innerJoin(canonicalSubjects, eq(canonicalSubjects.id, questions.canonicalSubjectId))
    .where(isNull(questions.deletedAt))
    .groupBy(canonicalSubjects.id, canonicalSubjects.name)
    .orderBy(desc(count()));

  return linhas;
}

export type BoardRow = { board: string; total: number };

/** Distribuição por banca — o que a plataforma cobre e o que falta comprar. */
export async function questionsByBoard(): Promise<BoardRow[]> {
  return db
    .select({ board: examBoards.name, total: count() })
    .from(questions)
    .innerJoin(examBoards, eq(examBoards.id, questions.examBoardId))
    .where(isNull(questions.deletedAt))
    .groupBy(examBoards.id, examBoards.name)
    .orderBy(desc(count()))
    .limit(12);
}

export type ImportBatchRow = {
  id: string;
  fileName: string;
  status: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  failedRows: number;
  createdAt: Date;
};

/** As últimas importações de planilha, com o resultado de cada uma. */
export async function recentImportBatches(limit = 10): Promise<ImportBatchRow[]> {
  return db
    .select({
      id: questionImportBatches.id,
      fileName: questionImportBatches.fileName,
      status: questionImportBatches.status,
      totalRows: questionImportBatches.totalRows,
      importedRows: questionImportBatches.importedRows,
      skippedRows: questionImportBatches.skippedRows,
      failedRows: questionImportBatches.failedRows,
      createdAt: questionImportBatches.createdAt,
    })
    .from(questionImportBatches)
    .orderBy(desc(questionImportBatches.createdAt))
    .limit(limit);
}

export type MaterialRow = {
  subject: string;
  type: string;
  total: number;
  published: number;
};

/**
 * Materiais por disciplina e tipo (resumo, flashcard, mapa mental, videoaula).
 *
 * ⚠️ `left join`, não `inner`: `canonical_subject_id` é anulável em
 * `content_items`. Um `inner join` sumiria com exatamente os materiais que
 * precisam de atenção — os que chegaram sem disciplina e por isso não aparecem
 * para nenhum aluno.
 */
export async function materialsBySubject(): Promise<MaterialRow[]> {
  return db
    .select({
      subject: sql<string>`coalesce(${canonicalSubjects.name}, 'Sem disciplina')`,
      type: contentItems.type,
      total: count(),
      published: sql<number>`count(*) filter (where ${contentItems.status} = 'published')::int`,
    })
    .from(contentItems)
    .leftJoin(canonicalSubjects, eq(canonicalSubjects.id, contentItems.canonicalSubjectId))
    .where(isNull(contentItems.deletedAt))
    .groupBy(canonicalSubjects.name, contentItems.type)
    .orderBy(sql`coalesce(${canonicalSubjects.name}, 'Sem disciplina')`, contentItems.type);
}

/**
 * Questões sem comentário publicadas — a fila de correção mais urgente.
 *
 * ⚠️ O README trata o comentário como requisito de aceite: "toda questão tem
 * explicação da resposta". Uma questão publicada sem comentário passa pelo
 * aluno como um erro sem lição, que é o oposto do que a plataforma promete.
 */
export async function countPublishedWithoutExplanation(): Promise<number> {
  const [linha] = await db
    .select({ total: count() })
    .from(questions)
    .where(
      and(
        eq(questions.status, "published"),
        isNull(questions.deletedAt),
        sql`(${questions.explanation} is null or btrim(${questions.explanation}) = '')`,
      ),
    );

  return linha?.total ?? 0;
}
