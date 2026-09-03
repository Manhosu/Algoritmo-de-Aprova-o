import "server-only";

import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";

import { questionContentHash } from "@/modules/questions/content-hash";
import { db } from "@/server/db";
import {
  canonicalSubjects,
  canonicalTopics,
  examBoards,
  questionAttempts,
  questionOptions,
  questions,
} from "@/server/db/schema";

/**
 * GESTÃO DE QUESTÕES PELO PAINEL (pedido de 02/09/2026).
 * ============================================================================
 *
 * Palavras da cliente: "as questões precisarão passar por revisão e
 * eventualmente poderão apresentar erro de conteúdo, de digitação, na resposta,
 * na explicação, problemas de classificação". Sem editar e excluir pelo painel,
 * cada correção de vírgula virava pedido para mim.
 */

export type AdminQuestionFilters = {
  examBoardId?: string | null;
  canonicalSubjectId?: string | null;
  canonicalTopicId?: string | null;
  difficulty?: "easy" | "medium" | "hard" | null;
  status?: "draft" | "published" | "archived" | null;
  /** Busca no enunciado. */
  search?: string | null;
  /**
   * Só as que estão sem comentário.
   *
   * É o atalho do aviso da aba Questões: ele conta o problema, este filtro leva
   * exatamente às questões que o causam. Sem ele, "23 questões publicadas sem
   * comentário" é um número que não diz por onde começar.
   */
  missingExplanation?: boolean;
};

export type AdminQuestionRow = {
  id: string;
  statement: string;
  difficulty: string;
  status: string;
  subjectName: string;
  topicName: string | null;
  boardName: string | null;
  attemptCount: number;
  hasExplanation: boolean;
};

const PAGE_SIZE = 20;

export async function listQuestionsForAdmin(input: {
  filters?: AdminQuestionFilters;
  page?: number;
}): Promise<{ rows: AdminQuestionRow[]; total: number; page: number; pages: number }> {
  const filtros = input.filters ?? {};
  const pagina = Math.max(0, input.page ?? 0);

  const condicoes = [isNull(questions.deletedAt)];

  if (filtros.examBoardId) condicoes.push(eq(questions.examBoardId, filtros.examBoardId));
  if (filtros.canonicalSubjectId) {
    condicoes.push(eq(questions.canonicalSubjectId, filtros.canonicalSubjectId));
  }
  if (filtros.canonicalTopicId) {
    condicoes.push(eq(questions.canonicalTopicId, filtros.canonicalTopicId));
  }
  if (filtros.difficulty) condicoes.push(eq(questions.difficulty, filtros.difficulty));
  if (filtros.status) condicoes.push(eq(questions.status, filtros.status));

  if (filtros.missingExplanation) {
    /*
      Vazio e nulo contam como "sem comentário". A importação grava null quando
      a coluna falta, e string vazia quando a célula existe e está em branco —
      para a cliente as duas são o mesmo problema.
    */
    condicoes.push(sql`coalesce(trim(${questions.explanation}), '') = ''`);
  }

  if (filtros.search) {
    /*
      `ilike` com curinga dos dois lados não usa índice, e é o certo aqui: são
      1.046 questões e quem busca está procurando um enunciado específico para
      corrigir. Uma busca em texto completo custaria uma coluna nova e um
      gatilho para um caso que roda algumas vezes por dia.
    */
    condicoes.push(sql`${questions.statement} ilike ${`%${filtros.search}%`}`);
  }

  const where = and(...condicoes);

  const [linhas, totalRow] = await Promise.all([
    db
      .select({
        id: questions.id,
        statement: questions.statement,
        difficulty: questions.difficulty,
        status: questions.status,
        subjectName: canonicalSubjects.name,
        topicName: canonicalTopics.name,
        boardName: examBoards.shortName,
        attemptCount: questions.attemptCount,
        explanation: questions.explanation,
      })
      .from(questions)
      .innerJoin(canonicalSubjects, eq(canonicalSubjects.id, questions.canonicalSubjectId))
      .leftJoin(canonicalTopics, eq(canonicalTopics.id, questions.canonicalTopicId))
      .leftJoin(examBoards, eq(examBoards.id, questions.examBoardId))
      .where(where)
      .orderBy(desc(questions.createdAt))
      .limit(PAGE_SIZE)
      .offset(pagina * PAGE_SIZE),

    db.select({ total: count() }).from(questions).where(where),
  ]);

  const total = totalRow[0]?.total ?? 0;

  return {
    rows: linhas.map((linha) => ({
      ...linha,
      hasExplanation: Boolean(linha.explanation?.trim()),
    })),
    total,
    page: pagina,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export type AdminQuestionDetail = {
  id: string;
  statement: string;
  explanation: string | null;
  difficulty: string;
  status: string;
  canonicalSubjectId: string;
  canonicalTopicId: string | null;
  attemptCount: number;
  correctCount: number;
  options: Array<{ id: string; label: string; content: string; isCorrect: boolean }>;
};

export async function getQuestionForAdmin(id: string): Promise<AdminQuestionDetail | null> {
  const [questao] = await db
    .select({
      id: questions.id,
      statement: questions.statement,
      explanation: questions.explanation,
      difficulty: questions.difficulty,
      status: questions.status,
      canonicalSubjectId: questions.canonicalSubjectId,
      canonicalTopicId: questions.canonicalTopicId,
      attemptCount: questions.attemptCount,
      correctCount: questions.correctCount,
    })
    .from(questions)
    .where(and(eq(questions.id, id), isNull(questions.deletedAt)))
    .limit(1);

  if (!questao) return null;

  const alternativas = await db
    .select({
      id: questionOptions.id,
      label: questionOptions.label,
      content: questionOptions.content,
      isCorrect: questionOptions.isCorrect,
    })
    .from(questionOptions)
    .where(eq(questionOptions.questionId, id))
    .orderBy(asc(questionOptions.sortOrder), asc(questionOptions.label));

  return { ...questao, options: alternativas };
}

export type SaveQuestionResult = { ok: true } | { ok: false; message: string };

/**
 * Grava a edição de uma questão.
 *
 * ⚠️ O `content_hash` É RECALCULADO junto com o enunciado.
 *
 * Ele é a chave que impede a mesma questão de entrar duas vezes por
 * importação. Editar o enunciado sem recalcular deixaria a chave apontando para
 * o texto antigo: a versão corrigida passaria a ser importável de novo como se
 * fosse inédita, e o acervo ganharia a duplicata que o índice existe para
 * impedir.
 */
export async function saveQuestion(input: {
  id: string;
  statement: string;
  explanation: string | null;
  difficulty: "easy" | "medium" | "hard";
  status: "draft" | "published" | "archived";
  options: Array<{ id: string; content: string; isCorrect: boolean }>;
}): Promise<SaveQuestionResult> {
  const enunciado = input.statement.trim();
  if (enunciado.length < 10) {
    return { ok: false, message: "O enunciado está curto demais." };
  }

  const corretas = input.options.filter((o) => o.isCorrect);
  if (corretas.length !== 1) {
    /*
      Uma e só uma. Zero corretas trava o aluno num loop de erro; duas fazem o
      gabarito discordar de si mesmo e a métrica de acerto perder o sentido.
    */
    return {
      ok: false,
      message: `Marque exatamente uma alternativa correta (há ${corretas.length}).`,
    };
  }

  if (input.options.some((o) => !o.content.trim())) {
    return { ok: false, message: "Nenhuma alternativa pode ficar vazia." };
  }

  if (input.status === "published" && !input.explanation?.trim()) {
    /*
      Requisito de aceite do Marco 1: toda questão publicada tem comentário. Uma
      questão publicada sem explicação passa pelo aluno como um erro sem lição,
      que é o oposto do que a plataforma promete.
    */
    return {
      ok: false,
      message: "Questão publicada precisa de comentário. Salve como rascunho ou escreva a explicação.",
    };
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(questions)
        .set({
          statement: enunciado,
          explanation: input.explanation?.trim() || null,
          difficulty: input.difficulty,
          status: input.status,
          contentHash: questionContentHash(enunciado),
          updatedAt: new Date(),
        })
        .where(eq(questions.id, input.id));

      for (const alternativa of input.options) {
        await tx
          .update(questionOptions)
          .set({ content: alternativa.content.trim(), isCorrect: alternativa.isCorrect })
          .where(eq(questionOptions.id, alternativa.id));
      }
    });
  } catch (erro) {
    /*
      O índice único de `content_hash` recusa um enunciado que já existe em
      outra questão. É informação útil — quase sempre significa que a pessoa
      está editando a duplicata em vez da original.
    */
    if (erro instanceof Error && erro.message.includes("content_hash")) {
      return {
        ok: false,
        message: "Já existe outra questão com este enunciado no acervo.",
      };
    }
    throw erro;
  }

  return { ok: true };
}

export type DeleteQuestionResult =
  | { ok: true; softDeleted: boolean }
  | { ok: false; message: string };

/**
 * Exclui uma questão.
 *
 * ⚠️ QUESTÃO JÁ RESPONDIDA É ARQUIVADA, NÃO APAGADA.
 *
 * `question_attempts` guarda o histórico do aluno, o desempenho por assunto e o
 * Índice de Preparação. Apagar a questão levaria as respostas junto (a chave é
 * `cascade`), e o aluno veria o próprio percentual de acerto mudar sozinho
 * porque alguém corrigiu o acervo. O `deleted_at` tira a questão de circulação
 * e preserva o que já aconteceu.
 *
 * Questão nunca respondida some de verdade: não há histórico a proteger, e uma
 * lista cheia de lixo arquivado atrapalha quem revisa.
 */
export async function deleteQuestion(id: string): Promise<DeleteQuestionResult> {
  const [respostas] = await db
    .select({ total: count() })
    .from(questionAttempts)
    .where(eq(questionAttempts.questionId, id));

  const jaRespondida = (respostas?.total ?? 0) > 0;

  if (jaRespondida) {
    await db
      .update(questions)
      .set({ status: "archived", deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(questions.id, id));

    return { ok: true, softDeleted: true };
  }

  await db.transaction(async (tx) => {
    await tx.delete(questionOptions).where(eq(questionOptions.questionId, id));
    await tx.delete(questions).where(eq(questions.id, id));
  });

  return { ok: true, softDeleted: false };
}
