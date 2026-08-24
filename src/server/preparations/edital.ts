import "server-only";

import { createHash } from "node:crypto";

import { and, desc, eq, isNull } from "drizzle-orm";

import { normalizeText } from "@/modules/taxonomy/normalize";
import type { QueueInput } from "@/modules/taxonomy/matcher";
import { extractEdital, countTopics, countTopicsWithWeight } from "@/server/ai/edital-extractor";
import {
  EDITAL_PROMPT_VERSION,
  clipExtraction,
  editalExtractionSchema,
  type EditalExtraction,
} from "@/server/ai/edital-schema";
import { db } from "@/server/db";
import {
  editalExtractions,
  preparationDocuments,
  preparations,
  studyPlanSubjects,
  studyPlanTopics,
} from "@/server/db/schema";
import { getEditalFile, putEditalFile } from "@/server/storage";
import {
  closeQueueKeys,
  enqueueUnmapped,
  loadCatalog,
  matchSubject,
  matchTopic,
  type Catalog,
} from "@/server/taxonomy/mapping";

import { markFunnelStage, recordEvent } from "./service";

/**
 * PASSO 2 DO FLUXO DO "+": O EDITAL VIRA PLANO DE ESTUDO.
 * ============================================================================
 *
 * É a operação mais cara e mais visível do produto. Roda uma vez por preparação
 * e é onde o aluno decide se a plataforma funciona: extração torta significa
 * corrigir trezentas linhas na mão, e ninguém faz isso duas vezes.
 *
 * O caminho tem quatro etapas, e cada uma pode falhar sozinha:
 *
 *   1. `receiveEdital`  — valida o arquivo e o guarda. RÁPIDO, síncrono.
 *   2. `runExtraction`  — chama a IA. LENTO, roda depois da resposta.
 *   3. casamento        — liga o texto do edital ao catálogo canônico.
 *   4. `review_pending` — devolve o controle ao aluno, que confere.
 *
 * POR QUE 1 E 2 SÃO SEPARADOS
 * ----------------------------------------------------------------------------
 * Ler um edital de duzentas páginas leva de trinta segundos a alguns minutos.
 * Segurar a requisição do upload por todo esse tempo entrega ao aluno uma tela
 * branca e um timeout do navegador. Separando, o upload responde na hora, a
 * preparação entra em `extracting`, e a Home mostra "Lendo seu edital" enquanto
 * o trabalho acontece.
 *
 * NENHUMA ETAPA PERDE O ARQUIVO
 * ----------------------------------------------------------------------------
 * O PDF é gravado antes de a IA ser chamada. Se a leitura falhar — cota, rede,
 * modelo fora do ar — o aluno reprocessa sem subir nada de novo, e o painel
 * administrativo continua tendo o edital, que é exigência do README 2.6.
 */

/** Tamanho máximo aceito. Casa com `serverActions.bodySizeLimit` do next.config. */
export const MAX_EDITAL_BYTES = 25 * 1024 * 1024;

export type ReceiveEditalResult =
  | { ok: true; documentId: string; extractionId: string; reused: boolean }
  | { ok: false; message: string };

/* ========================================================================== *
 * 1. RECEBER O ARQUIVO
 * ========================================================================== */

export async function receiveEdital(input: {
  preparationId: string;
  userId: string;
  fileName: string;
  bytes: Uint8Array;
}): Promise<ReceiveEditalResult> {
  const invalid = validatePdf(input.bytes, input.fileName);
  if (invalid) return { ok: false, message: invalid };

  const preparation = await db.query.preparations.findFirst({
    where: (t, { and: a, eq: e }) => a(e(t.id, input.preparationId), e(t.userId, input.userId)),
    columns: { id: true, status: true },
  });

  if (!preparation) return { ok: false, message: "Preparação não encontrada." };

  /**
   * Reprocessar o edital APAGA o conteúdo programático e tudo que pende dele —
   * estado por assunto, respostas de diagnóstico. Isso é aceitável enquanto o
   * aluno está montando a preparação, e é destruição de histórico depois que
   * ela está ativa.
   *
   * A tela nem oferece o upload nesse caso, mas a regra vale aqui, no servidor,
   * porque a tela é uma sugestão e o servidor é a garantia.
   */
  if (preparation.status === "active" || preparation.status === "archived") {
    return {
      ok: false,
      message:
        "Esta preparação já está ativa. Trocar o edital agora apagaria seu histórico de estudo. " +
        "Para estudar para outro concurso, crie uma nova preparação.",
    };
  }

  const checksum = createHash("sha256").update(input.bytes).digest("hex");

  /**
   * Mesmo arquivo, mesma preparação: reaproveita o documento em vez de guardar
   * uma cópia e cobrar outra leitura da API da Anthropic. A infraestrutura de
   * IA é paga pela cliente e proporcional ao uso — reprocessar o mesmo PDF
   * porque o aluno clicou duas vezes é dinheiro queimado sem contrapartida.
   */
  const existing = await db.query.preparationDocuments.findFirst({
    where: (t, { and: a, eq: e, isNull: n }) =>
      a(e(t.preparationId, input.preparationId), e(t.checksum, checksum), n(t.deletedAt)),
    columns: { id: true },
  });

  const now = new Date();

  const documentId =
    existing?.id ??
    (
      await db
        .insert(preparationDocuments)
        .values({
          preparationId: input.preparationId,
          uploadedByUserId: input.userId,
          fileName: input.fileName.slice(0, 260),
          // Preenchido logo abaixo: o caminho é derivado do id da linha, que só
          // existe depois do insert.
          storagePath: "",
          sizeBytes: input.bytes.byteLength,
          checksum,
          pageCount: countPdfPages(input.bytes),
          source: "student_upload",
          uploadedAt: now,
        })
        .returning({ id: preparationDocuments.id })
    )[0].id;

  if (!existing) {
    const stored = await putEditalFile({
      preparationId: input.preparationId,
      documentId,
      fileName: input.fileName,
      bytes: input.bytes,
    });

    await db
      .update(preparationDocuments)
      .set({ storagePath: stored.storagePath })
      .where(eq(preparationDocuments.id, documentId));
  }

  /** Quantas leituras este documento já teve — vira `attemptNumber`. */
  const previousAttempts = await db.$count(
    editalExtractions,
    eq(editalExtractions.documentId, documentId),
  );

  const [extraction] = await db
    .insert(editalExtractions)
    .values({
      preparationId: input.preparationId,
      documentId,
      status: "queued",
      attemptNumber: previousAttempts + 1,
    })
    .returning({ id: editalExtractions.id });

  await db
    .update(preparations)
    .set({ status: "extracting", editalUploadedAt: now, updatedAt: now })
    .where(eq(preparations.id, input.preparationId));

  await markFunnelStage(input.userId, "edital_uploaded", now);
  await recordEvent(input.userId, "edital_uploaded", {
    preparationId: input.preparationId,
    sizeBytes: input.bytes.byteLength,
    reused: Boolean(existing),
  });

  return { ok: true, documentId, extractionId: extraction.id, reused: Boolean(existing) };
}

/* ========================================================================== *
 * 2. LER COM A IA
 * ========================================================================== */

export type RunExtractionResult =
  | { status: "succeeded"; subjects: number; topics: number; mappedPercent: number }
  | { status: "failed"; message: string };

export async function runExtraction(extractionId: string): Promise<RunExtractionResult> {
  const extraction = await db.query.editalExtractions.findFirst({
    where: (t, { eq: e }) => e(t.id, extractionId),
    columns: { id: true, preparationId: true, documentId: true, status: true },
  });

  if (!extraction) return { status: "failed", message: "Leitura não encontrada." };

  // Já rodou. Reentrar duplicaria conteúdo e custo — o `after()` do Next pode
  // disparar duas vezes numa reimplantação.
  if (extraction.status !== "queued") {
    return { status: "failed", message: "Esta leitura já foi processada." };
  }

  const document = await db.query.preparationDocuments.findFirst({
    where: (t, { eq: e }) => e(t.id, extraction.documentId),
    columns: { storagePath: true, fileName: true, pageCount: true, checksum: true },
  });

  if (!document) return { status: "failed", message: "Arquivo do edital não encontrado." };

  /**
   * O cargo que o aluno informou no passo 1 vai junto para a leitura.
   *
   * Sem ele, a IA extrai o programa de TODOS os cargos do edital — e num
   * edital real com oito especialidades isso estoura o orçamento de saída e a
   * leitura falha inteira. Ver a nota em `buildUserPrompt`.
   */
  const forPosition = await db.query.preparations.findFirst({
    where: (t, { eq: e }) => e(t.id, extraction.preparationId),
    columns: { targetPosition: true },
  });

  /**
   * ⚠️ REAPROVEITAMENTO ENTRE ALUNOS — a economia que importa em escala.
   *
   * Concurso popular tem milhares de candidatos, e todos sobem O MESMO PDF do
   * MESMO site da banca. Sem isto, mil alunos do TJ-RJ seriam mil leituras
   * idênticas: mais de mil dólares para produzir mil vezes a mesma resposta.
   *
   * A chave é (checksum do arquivo + cargo pretendido). O cargo entra porque a
   * leitura passou a ser específica dele — dois alunos do mesmo edital e cargos
   * diferentes precisam de extrações diferentes.
   *
   * Não precisou de tabela nova: `edital_extractions.raw_response` já guardava
   * a resposta completa, para depuração. Ela vira o cache.
   */
  const cached = await findCachedExtraction(
    document.checksum,
    forPosition?.targetPosition ?? null,
  );

  if (cached) {
    const now = new Date();

    await db
      .update(editalExtractions)
      .set({
        status: "succeeded",
        startedAt: now,
        finishedAt: now,
        durationMs: 0,
        model: cached.model,
        promptVersion: cached.promptVersion,
        // Custo ZERO: nenhuma chamada foi feita. Gravar o custo original aqui
        // inflaria o relatório de gastos com dinheiro que não saiu.
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostCents: 0,
        rawResponse: cached.data,
        errorMessage: "reaproveitado de uma leitura anterior do mesmo edital",
        updatedAt: now,
      })
      .where(eq(editalExtractions.id, extractionId));

    const persisted = await applyExtractedContent({
      preparationId: extraction.preparationId,
      extraction: cached.data,
    });

    await finishSuccessfully(extraction.preparationId, cached.data, now);

    return { status: "succeeded", ...persisted };
  }

  const startedAt = new Date();
  await db
    .update(editalExtractions)
    .set({ status: "running", startedAt, updatedAt: startedAt })
    .where(eq(editalExtractions.id, extractionId));

  try {
    const bytes = await getEditalFile(document.storagePath);

    const outcome = await extractEdital({
      pdf: bytes,
      fileName: document.fileName,
      pageCount: document.pageCount ?? undefined,
      targetPosition: forPosition?.targetPosition ?? null,
    });

    if (outcome.status !== "succeeded") {
      await failExtraction(extraction.id, extraction.preparationId, outcome.message, {
        // "Ilegível" ainda consumiu tokens quando a resposta veio da API; as
        // barreiras locais devolvem uso zerado. Registrar os dois é o que
        // permite responder "quanto está custando" com honestidade.
        usage: outcome.status === "unreadable" ? outcome.usage : undefined,
      });

      return { status: "failed", message: outcome.message };
    }

    const persisted = await applyExtractedContent({
      preparationId: extraction.preparationId,
      extraction: outcome.data,
    });

    const finishedAt = new Date();

    await db
      .update(editalExtractions)
      .set({
        status: "succeeded",
        finishedAt,
        durationMs: outcome.usage.durationMs,
        model: outcome.usage.model,
        promptVersion: outcome.usage.promptVersion,
        inputTokens: outcome.usage.inputTokens,
        outputTokens: outcome.usage.outputTokens,
        estimatedCostCents: outcome.usage.estimatedCostCents,
        extractedSubjectCount: outcome.data.subjects.length,
        extractedTopicCount: countTopics(outcome.data),
        topicsWithWeightCount: countTopicsWithWeight(outcome.data),
        rawResponse: outcome.data,
        updatedAt: finishedAt,
      })
      .where(eq(editalExtractions.id, extractionId));

    await finishSuccessfully(extraction.preparationId, outcome.data, finishedAt, {
      ...persisted,
      costCents: outcome.usage.estimatedCostCents,
    });

    return { status: "succeeded", ...persisted };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha inesperada ao ler o edital.";
    await failExtraction(extraction.id, extraction.preparationId, message);
    return { status: "failed", message };
  }
}

/**
 * Encerra a preparação com sucesso. Usado pela leitura real E pelo cache.
 *
 * Estar num lugar só é o que garante que uma extração reaproveitada produza
 * exatamente o mesmo estado de uma recém-lida — inclusive os degraus do funil,
 * que se divergissem tornariam a métrica de ativação incomparável entre alunos.
 */
async function finishSuccessfully(
  preparationId: string,
  data: EditalExtraction,
  at: Date,
  stats?: { subjects: number; topics: number; mappedPercent: number; costCents: number },
): Promise<void> {
  /**
   * A data da prova do edital só é adotada quando o aluno NÃO informou uma.
   * Ele digitou aquela data olhando para o edital dele; sobrescrever com o
   * palpite da IA seria desfazer uma decisão consciente sem avisar.
   */
  const preparation = await db.query.preparations.findFirst({
    where: (t, { eq: e }) => e(t.id, preparationId),
    columns: { userId: true, examDate: true, institution: true },
  });

  await db
    .update(preparations)
    .set({
      status: "review_pending",
      extractionSucceededAt: at,
      examDate: preparation?.examDate ?? data.examDate,
      examDateIsEstimated:
        preparation?.examDate == null && data.examDate != null
          ? data.examDateIsEstimated
          : undefined,
      institution: preparation?.institution ?? data.institution,
      updatedAt: at,
    })
    .where(eq(preparations.id, preparationId));

  if (preparation?.userId) {
    await markFunnelStage(preparation.userId, "extraction_succeeded", at);
    await recordEvent(preparation.userId, "extraction_succeeded", {
      preparationId,
      ...stats,
    });
  }
}

/**
 * Procura uma leitura anterior do MESMO arquivo para o MESMO cargo.
 *
 * O cargo é comparado normalizado: "Analista Judiciário — Área Administrativa"
 * e "analista judiciario - area administrativa" são o mesmo cargo, e exigir
 * igualdade literal desperdiçaria o cache na maioria das vezes.
 *
 * Só aproveita leituras da versão ATUAL do prompt: uma extração produzida por
 * um prompt antigo pode ter outra forma, e servi-la a um aluno novo esconderia
 * a melhoria que a nova versão traz.
 */
async function findCachedExtraction(
  checksum: string,
  targetPosition: string | null,
): Promise<{ data: EditalExtraction; model: string; promptVersion: string } | null> {
  const wanted = normalizeText(targetPosition ?? "");

  const rows = await db
    .select({
      rawResponse: editalExtractions.rawResponse,
      model: editalExtractions.model,
      promptVersion: editalExtractions.promptVersion,
      targetPosition: preparations.targetPosition,
    })
    .from(editalExtractions)
    .innerJoin(
      preparationDocuments,
      eq(editalExtractions.documentId, preparationDocuments.id),
    )
    .innerJoin(preparations, eq(editalExtractions.preparationId, preparations.id))
    .where(
      and(
        eq(preparationDocuments.checksum, checksum),
        eq(editalExtractions.status, "succeeded"),
        eq(editalExtractions.promptVersion, EDITAL_PROMPT_VERSION),
      ),
    )
    .orderBy(desc(editalExtractions.finishedAt))
    .limit(20);

  for (const row of rows) {
    if (!row.rawResponse) continue;
    if (normalizeText(row.targetPosition) !== wanted) continue;

    const parsed = editalExtractionSchema.safeParse(row.rawResponse);
    if (!parsed.success) continue;

    return {
      data: clipExtraction(parsed.data),
      model: row.model ?? "cache",
      promptVersion: row.promptVersion ?? EDITAL_PROMPT_VERSION,
    };
  }

  return null;
}

async function failExtraction(
  extractionId: string,
  preparationId: string,
  message: string,
  options: { usage?: { inputTokens: number; outputTokens: number; estimatedCostCents: number } } = {},
): Promise<void> {
  const now = new Date();

  await db
    .update(editalExtractions)
    .set({
      status: "failed",
      finishedAt: now,
      errorMessage: message.slice(0, 2000),
      inputTokens: options.usage?.inputTokens,
      outputTokens: options.usage?.outputTokens,
      estimatedCostCents: options.usage?.estimatedCostCents,
      updatedAt: now,
    })
    .where(eq(editalExtractions.id, extractionId));

  // `failed` (e não voltar para `draft`) porque a Home precisa distinguir
  // "ainda não enviou" de "enviou e não deu certo" — as duas telas dizem
  // coisas diferentes ao aluno.
  await db
    .update(preparations)
    .set({ status: "failed", updatedAt: now })
    .where(eq(preparations.id, preparationId));
}

/* ========================================================================== *
 * 3. PERSISTIR O CONTEÚDO E CASAR COM O CATÁLOGO
 * ========================================================================== */

type PersistResult = { subjects: number; topics: number; mappedPercent: number };

/**
 * Grava o conteúdo programático e liga cada item ao catálogo canônico.
 *
 * SUBSTITUI, NÃO ACUMULA
 * ----------------------------------------------------------------------------
 * Reenviar o edital apaga o conteúdo anterior daquela preparação. Sem isso, a
 * segunda tentativa produziria um plano com tudo duplicado — e o aluno que
 * reprocessa é justamente o que já estava insatisfeito com o resultado.
 *
 * O apagamento leva junto `topic_states` e as respostas de diagnóstico por
 * cascade, e é por isso que ele só é aceitável ANTES de a preparação ficar
 * ativa — a guarda está em `receiveEdital`, que recusa o reenvio depois disso.
 *
 * Exportada por ser o ponto onde a extração vira plano de estudo: é por aqui
 * que `npm run verify:engine` alimenta um edital conhecido sem gastar uma
 * chamada de IA, e é o que um reprocessamento administrativo usaria.
 */
export async function applyExtractedContent(input: {
  preparationId: string;
  extraction: EditalExtraction;
}): Promise<PersistResult> {
  const catalog = await loadCatalog();

  const preparation = await db.query.preparations.findFirst({
    where: (t, { eq: e }) => e(t.id, input.preparationId),
    columns: { userId: true },
  });
  const userId = preparation?.userId ?? "";

  const queueEntries: QueueInput[] = [];
  const matchedKeys: string[] = [];
  let totalTopics = 0;
  let mappedTopics = 0;

  await db.transaction(async (tx) => {
    await tx
      .delete(studyPlanSubjects)
      .where(eq(studyPlanSubjects.preparationId, input.preparationId));

    let subjectOrder = 0;

    for (const subject of input.extraction.subjects) {
      const subjectMatch = matchSubject(subject.name, catalog);

      const [planSubject] = await tx
        .insert(studyPlanSubjects)
        .values({
          preparationId: input.preparationId,
          canonicalSubjectId: subjectMatch.canonicalId,
          rawName: subject.name,
          displayName: subject.name.slice(0, 200),
          normalizedName: normalizeText(subject.name).slice(0, 200),
          sortOrder: subjectOrder++,
          origin: "ai",
          mappingStatus: subjectMatch.status,
          mappingConfidence: subjectMatch.confidence,
        })
        .returning({ id: studyPlanSubjects.id });

      let topicOrder = 0;

      for (const topic of subject.topics) {
        const parent = await insertTopic(tx, catalog, {
          preparationId: input.preparationId,
          planSubjectId: planSubject.id,
          parentId: null,
          depth: 0,
          sortOrder: topicOrder++,
          name: topic.name,
          questionCount: topic.questionCount,
          scopeSubjectId: subjectMatch.canonicalId,
        });

        totalTopics += 1;
        if (parent.mapped) mappedTopics += 1;
        collect(parent, queueEntries, matchedKeys, userId, subject.name);

        for (const child of topic.children ?? []) {
          const childResult = await insertTopic(tx, catalog, {
            preparationId: input.preparationId,
            planSubjectId: planSubject.id,
            parentId: parent.id,
            depth: 1,
            sortOrder: topicOrder++,
            name: child.name,
            questionCount: child.questionCount,
            scopeSubjectId: subjectMatch.canonicalId,
          });

          totalTopics += 1;
          if (childResult.mapped) mappedTopics += 1;
          collect(childResult, queueEntries, matchedKeys, userId, subject.name);
        }
      }
    }
  });

  // Fora da transação: a fila é do painel, não do aluno. Um erro ao gravá-la
  // não pode desfazer o conteúdo programático que já está correto.
  await enqueueUnmapped(queueEntries);
  await closeQueueKeys(matchedKeys);

  return {
    subjects: input.extraction.subjects.length,
    topics: totalTopics,
    mappedPercent: totalTopics === 0 ? 0 : Math.round((mappedTopics / totalTopics) * 100),
  };
}

type InsertedTopic = {
  id: string;
  mapped: boolean;
  key: string;
  rawName: string;
  status: "mapped" | "manually_mapped" | "ambiguous" | "unmapped";
  confidence: number;
  alternatives: Array<{ topicId: string; name: string; confidence: number }>;
};

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertTopic(
  tx: Transaction,
  catalog: Catalog,
  input: {
    preparationId: string;
    planSubjectId: string;
    parentId: string | null;
    depth: number;
    sortOrder: number;
    name: string;
    questionCount: number | null;
    scopeSubjectId: string | null;
  },
): Promise<InsertedTopic> {
  const match = matchTopic(input.name, input.scopeSubjectId, catalog);
  const mapped = match.status === "mapped" || match.status === "manually_mapped";

  const [row] = await tx
    .insert(studyPlanTopics)
    .values({
      preparationId: input.preparationId,
      planSubjectId: input.planSubjectId,
      parentId: input.parentId,
      canonicalTopicId: match.canonicalId,
      rawName: input.name,
      displayName: input.name.slice(0, 300),
      normalizedName: normalizeText(input.name).slice(0, 300),
      depth: input.depth,
      sortOrder: input.sortOrder,
      /**
       * O peso só existe quando o EDITAL informou. Não estimamos, não dividimos
       * igualmente: um peso inventado faz o Motor 1 priorizar com convicção uma
       * ordem que ninguém escolheu. Sem peso, `weightSource = "default"` e o
       * motor usa valor neutro — e a tela de revisão destaca o campo vazio para
       * o aluno preencher, que é o passo 3b do README.
       */
      weight: input.questionCount ?? null,
      weightSource: input.questionCount == null ? "default" : "edital",
      questionCountInExam: input.questionCount,
      mappingStatus: match.status,
      mappingConfidence: match.confidence,
      mappedAt: mapped ? new Date() : null,
      origin: "ai",
    })
    .returning({ id: studyPlanTopics.id });

  return {
    id: row.id,
    mapped,
    key: match.key,
    rawName: input.name,
    status: match.status,
    confidence: match.confidence,
    alternatives: match.alternatives,
  };
}

function collect(
  topic: InsertedTopic,
  queue: QueueInput[],
  matchedKeys: string[],
  userId: string,
  subjectHint: string,
): void {
  if (topic.mapped) {
    matchedKeys.push(topic.key);
    return;
  }

  queue.push({
    rawName: topic.rawName,
    subjectHint,
    userId,
    result: {
      status: topic.status,
      canonicalId: null,
      confidence: topic.confidence,
      matchedBy: null,
      alternatives: topic.alternatives,
      key: topic.key,
    },
  });
}

/* ========================================================================== *
 * VALIDAÇÃO DO ARQUIVO
 * ========================================================================== */

/** Devolve a mensagem de erro, ou `null` quando o arquivo serve. */
export function validatePdf(bytes: Uint8Array, fileName: string): string | null {
  if (bytes.byteLength === 0) {
    return "O arquivo está vazio.";
  }

  if (bytes.byteLength > MAX_EDITAL_BYTES) {
    const mb = (bytes.byteLength / (1024 * 1024)).toFixed(1);
    return `O arquivo tem ${mb} MB e o limite é 25 MB. Envie apenas as páginas do conteúdo programático.`;
  }

  /**
   * Confere a ASSINATURA do arquivo, não a extensão.
   *
   * Extensão é texto escolhido por quem envia: `.pdf` não prova nada, e um
   * arquivo que não é PDF chegaria à API da Anthropic para ser recusado lá —
   * depois de ocupar armazenamento e tempo do aluno.
   */
  const signature = String.fromCharCode(...bytes.subarray(0, 5));
  if (signature !== "%PDF-") {
    return `"${fileName}" não é um PDF. Envie o arquivo do edital em PDF, como sai do site da banca.`;
  }

  return null;
}

/**
 * Conta as páginas do PDF por inspeção do texto bruto.
 *
 * É estimativa, e serve só para duas coisas: informar o painel administrativo e
 * evitar uma chamada cara à API quando o documento passa do limite de 600
 * páginas. Nenhuma decisão de produto depende do número exato, então uma
 * biblioteca de parsing de PDF inteira não se justifica aqui.
 */
export function countPdfPages(bytes: Uint8Array): number | null {
  const text = Buffer.from(bytes).toString("latin1");

  // `/Count N` no catálogo de páginas é o valor autoritativo quando aparece.
  const counts = [...text.matchAll(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/g)].map((m) =>
    Number(m[1]),
  );
  if (counts.length > 0) return Math.max(...counts);

  const objects = text.match(/\/Type\s*\/Page[^s]/g);
  return objects ? objects.length : null;
}

/* ========================================================================== *
 * ESTADO PARA A TELA
 * ========================================================================== */

export type EditalStatus = {
  preparationId: string;
  status: (typeof preparations.$inferSelect)["status"];
  lastDocument: { fileName: string; sizeBytes: number; uploadedAt: Date } | null;
  lastError: string | null;
  attempts: number;
};

export async function getEditalStatus(
  preparationId: string,
  userId: string,
): Promise<EditalStatus | null> {
  const preparation = await db.query.preparations.findFirst({
    where: (t, { and: a, eq: e }) => a(e(t.id, preparationId), e(t.userId, userId)),
    columns: { id: true, status: true },
  });

  if (!preparation) return null;

  const [document] = await db
    .select({
      fileName: preparationDocuments.fileName,
      sizeBytes: preparationDocuments.sizeBytes,
      uploadedAt: preparationDocuments.uploadedAt,
    })
    .from(preparationDocuments)
    .where(
      and(
        eq(preparationDocuments.preparationId, preparationId),
        isNull(preparationDocuments.deletedAt),
      ),
    )
    .orderBy(desc(preparationDocuments.uploadedAt))
    .limit(1);

  const [lastExtraction] = await db
    .select({
      errorMessage: editalExtractions.errorMessage,
      status: editalExtractions.status,
    })
    .from(editalExtractions)
    .where(eq(editalExtractions.preparationId, preparationId))
    .orderBy(desc(editalExtractions.createdAt))
    .limit(1);

  const attempts = await db.$count(
    editalExtractions,
    eq(editalExtractions.preparationId, preparationId),
  );

  return {
    preparationId,
    status: preparation.status,
    lastDocument: document ?? null,
    lastError: lastExtraction?.status === "failed" ? lastExtraction.errorMessage : null,
    attempts,
  };
}
