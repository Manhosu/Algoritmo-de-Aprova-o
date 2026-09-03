import "server-only";

import { eq } from "drizzle-orm";

import { questionContentHash } from "@/modules/questions/content-hash";
import { taxonomyKey } from "@/modules/taxonomy/normalize";
import { db } from "@/server/db";
import { examBoards, questionImportBatches, questionOptions, questions } from "@/server/db/schema";
import { loadCatalog, matchSubject, matchTopic } from "@/server/taxonomy/mapping";

import { parseQuestionSheet, type ParsedQuestion } from "./questions";

/**
 * IMPORTAÇÃO DE QUESTÕES POR PLANILHA — o miolo compartilhado.
 * ============================================================================
 *
 * README 2.6 e item 13 do aceite: "importação de questões em lote via planilha
 * Excel", pelo painel.
 *
 * ⚠️ ESTE ARQUIVO EXISTE PARA QUE A TELA E O COMANDO SEJAM A MESMA COISA.
 *
 * A regra de casamento com o catálogo tem uma decisão sutil dentro (a queda para
 * a disciplina dona do assunto, explicada abaixo). Duplicá-la entre o script e o
 * painel significaria que uma planilha importada por mim e a mesma planilha
 * importada pela cliente poderiam produzir acervos diferentes — e ninguém
 * descobriria isso olhando as duas telas.
 */

export type ImportReport = {
  fileName: string;
  /** Linhas que o parser aceitou. */
  parsed: number;
  /** Linhas que o parser recusou, com o motivo. */
  issues: Array<{ row: number; message: string }>;
  /** Questões que casaram com o catálogo e podiam ser gravadas. */
  matched: number;
  /** Gravadas de fato. */
  written: number;
  /** Recusadas por já existirem com o mesmo enunciado. */
  duplicates: number;
  /** Assunto cadastrado em outra disciplina — a questão entrou por ela. */
  remapped: Array<{ label: string; count: number }>;
  /** Nada no catálogo casou. A cliente precisa cadastrar e reimportar. */
  unmatched: Array<{ label: string; count: number }>;
  /** §8 do padrão editorial: gabarito concentrado numa alternativa. */
  answerBalanceWarning: string | null;
  /** Preenchido quando a planilha já tinha sido importada antes. */
  alreadyImported: boolean;
};

type Preparada = {
  questao: ParsedQuestion;
  subjectId: string;
  topicId: string | null;
};

export async function runQuestionImport(input: {
  bytes: Uint8Array;
  fileName: string;
  uploadedByUserId?: string | null;
  /** Confere e relata sem gravar nada. */
  dryRun?: boolean;
}): Promise<ImportReport> {
  const resultado = parseQuestionSheet(input.bytes);
  const catalogo = await loadCatalog();

  const prontas: Preparada[] = [];
  const foraDoCatalogo = new Map<string, number>();
  const remapeadas = new Map<string, number>();

  for (const questao of resultado.questions) {
    const disciplina = matchSubject(questao.subjectName, catalogo);

    if (!disciplina.canonicalId) {
      conta(foraDoCatalogo, `(disciplina) ${questao.subjectName}`);
      continue;
    }

    const assunto = matchTopic(questao.topicName, disciplina.canonicalId, catalogo);

    if (assunto.canonicalId) {
      /**
       * ⚠️ A DISCIPLINA VEM DA DONA DO ASSUNTO, NÃO DA PLANILHA.
       *
       * `matchTopic` pode devolver um assunto de OUTRA disciplina por dois
       * caminhos legítimos: um sinônimo casa antes do escopo ser aplicado, e
       * quando a disciplina da planilha não tem assunto nenhum o matcher busca
       * no catálogo inteiro em vez de descartar a questão.
       *
       * Guardar a disciplina da planilha junto com um assunto de outra faz as
       * duas colunas discordarem. O efeito apareceu na tela: 560 questões
       * ficaram sob "Administração" com assuntos de "Administração Pública", e
       * o filtro do Banco — que lista assuntos pela dona real — mostrava
       * "Administração" sem assunto nenhum. A cliente reportou exatamente isso.
       *
       * O assunto é o sinal mais específico e é único no sistema inteiro. Ele
       * manda.
       */
      const dona = catalogo.topics.find((t) => t.id === assunto.canonicalId)?.subjectId;

      prontas.push({
        questao,
        subjectId: dona ?? disciplina.canonicalId,
        topicId: assunto.canonicalId,
      });
      continue;
    }

    /*
      ⚠️ QUEDA: o assunto existe, mas mora em OUTRA disciplina.

      O nome do assunto é o sinal mais específico, e o do catálogo é único no
      sistema inteiro. "Licitações e contratos" está sob Direito Administrativo;
      a planilha da cliente rotulou a disciplina como Administração Pública. São
      80 questões de conteúdo real que seriam descartadas por causa do rótulo de
      cima, não do de baixo.

      A questão entra pela disciplina DONA do assunto, e o remapeamento é
      RELATADO: mover conteúdo de disciplina em silêncio é o tipo de coisa que a
      cliente precisa ver para corrigir a planilha, se discordar.
    */
    const global = catalogo.topics.find(
      (candidato) => candidato.normalizedName === taxonomyKey(questao.topicName),
    );

    if (global?.subjectId) {
      const dona =
        catalogo.subjects.find((d) => d.id === global.subjectId)?.name ??
        "outra disciplina";

      conta(remapeadas, `${questao.subjectName} › ${questao.topicName} → ${dona}`);
      prontas.push({ questao, subjectId: global.subjectId, topicId: global.id });
      continue;
    }

    conta(foraDoCatalogo, `${questao.subjectName} › ${questao.topicName}`);
  }

  const base: ImportReport = {
    fileName: input.fileName,
    parsed: resultado.questions.length,
    issues: resultado.issues.map((i) => ({ row: i.row, message: i.message })),
    matched: prontas.length,
    written: 0,
    duplicates: 0,
    remapped: ordenar(remapeadas),
    unmatched: ordenar(foraDoCatalogo),
    answerBalanceWarning: resultado.answerBalanceWarning ?? null,
    alreadyImported: false,
  };

  if (input.dryRun) return base;

  /*
    O mesmo nome de arquivo não é importado duas vezes.

    ⚠️ É proteção contra o clique duplo, não contra conteúdo repetido — desse
    lado quem protege é o `content_hash` do enunciado. Sem a checagem por nome,
    reenviar a mesma planilha criaria um segundo lote e a tela de Questões
    passaria a mostrar dois lotes idênticos, com zero questões gravadas no
    segundo, sem nada explicando o porquê.
  */
  const jaImportado = await db.query.questionImportBatches.findFirst({
    where: (t, { eq: e }) => e(t.fileName, input.fileName),
    columns: { id: true },
  });

  if (jaImportado) return { ...base, alreadyImported: true };

  const [lote] = await db
    .insert(questionImportBatches)
    .values({
      fileName: input.fileName,
      uploadedByUserId: input.uploadedByUserId ?? null,
      status: base.issues.length > 0 ? "completed_with_errors" : "completed",
      totalRows: base.parsed + base.issues.length,
      importedRows: 0,
      failedRows: base.issues.length,
      errors: base.issues,
      finishedAt: new Date(),
    })
    .returning({ id: questionImportBatches.id });

  /** Toda questão precisa de uma banca, e as nossas não vêm de banca. */
  const [autoral] = await db
    .select({ id: examBoards.id })
    .from(examBoards)
    .where(eq(examBoards.slug, "autoral"))
    .limit(1);

  let gravadas = 0;
  let repetidas = 0;

  for (const { questao, subjectId, topicId } of prontas) {
    const contentHash = questionContentHash(questao.statement);

    const [linha] = await db
      .insert(questions)
      .values({
        examBoardId: autoral?.id ?? null,
        canonicalSubjectId: subjectId,
        canonicalTopicId: topicId,
        difficulty: questao.difficulty,
        type: "multiple_choice",
        statement: questao.statement,
        explanation: questao.explanation,
        status: "published",
        importBatchId: lote.id,
        contentHash,
      })
      .onConflictDoNothing({ target: questions.contentHash })
      .returning({ id: questions.id });

    if (!linha) {
      repetidas++;
      continue;
    }

    await db.insert(questionOptions).values(
      questao.options.map((opcao, index) => ({
        questionId: linha.id,
        label: opcao.label,
        content: opcao.content,
        isCorrect: opcao.isCorrect,
        sortOrder: index,
      })),
    );

    gravadas++;
  }

  /*
    O lote guarda o que REALMENTE entrou. Gravar o número antes de saber quantas
    duplicatas apareceriam faria a tela de Questões relatar uma importação de
    940 linhas que na verdade acrescentou 12.
  */
  await db
    .update(questionImportBatches)
    .set({ importedRows: gravadas, skippedRows: repetidas })
    .where(eq(questionImportBatches.id, lote.id));

  return { ...base, written: gravadas, duplicates: repetidas };
}

function conta(mapa: Map<string, number>, chave: string): void {
  mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
}

function ordenar(mapa: Map<string, number>): Array<{ label: string; count: number }> {
  return [...mapa]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }));
}
