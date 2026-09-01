import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  canonicalSubjects,
  canonicalTopics,
  contentItems,
  contentProgress,
  flashcards,
  studyPlanSubjects,
  studyPlanTopics,
} from "@/server/db/schema";
import { getContentAccess } from "@/server/billing/content-access";

/**
 * A BIBLIOTECA DE MATERIAIS (README 2.2 e 2.3).
 * ============================================================================
 *
 * Mapas mentais, flashcards, textos de estudo e videoaulas — o que o aluno
 * consome fora da prática de questões.
 *
 * ⚠️ A ORDEM É A DO EDITAL DELE, não a do catálogo.
 *
 * A biblioteca inteira tem 66 itens hoje e vai ter milhares. Listada por ordem
 * alfabética de disciplina, ela é um depósito: o aluno abre, não reconhece
 * nada como "meu", e fecha. Listada pelos assuntos que estão no plano dele,
 * com os do plano primeiro, ela responde "o que eu estudo hoje" — que é a
 * pergunta que o produto inteiro existe para responder.
 *
 * O resto do acervo continua acessível, marcado como fora do plano. Esconder
 * seria pior: o aluno que quer revisar algo do edital passado não conseguiria.
 */

export type MaterialCard = {
  id: string;
  type: "flashcard_deck" | "mind_map" | "video" | "study_text" | "pdf" | "audio";
  title: string;
  description: string | null;
  subjectName: string | null;
  topicName: string | null;
  durationSeconds: number | null;
  /** Quantos cartões o baralho tem. Nulo para os outros tipos. */
  cardCount: number | null;
  /** Está no edital do aluno? Governa a ordem, não o acesso. */
  inPlan: boolean;
  /** Bloqueado pelo plano de assinatura. */
  locked: boolean;
  progressPercent: number;
  completed: boolean;
};

export type LibraryFilters = {
  type?: MaterialCard["type"] | null;
  canonicalSubjectId?: string | null;
  /** Só o que está no edital do aluno. */
  onlyMyPlan?: boolean;
};

export type Library = {
  items: MaterialCard[];
  subjects: Array<{ id: string; name: string; count: number }>;
  /** Quantos itens o plano do aluno esconde — a régua honesta do gate. */
  lockedCount: number;
};

export async function getLibrary(input: {
  userId: string;
  preparationId: string | null;
  filters?: LibraryFilters;
}): Promise<Library> {
  const filtros = input.filters ?? {};

  /*
    Os assuntos do plano do aluno, em UMA consulta. Vira um conjunto em memória
    porque a lista tem dezenas de itens, não milhares — e porque a alternativa
    seria um `exists` correlacionado por linha na consulta principal, que o
    Postgres resolveria bem mas que espalharia a regra "está no meu edital" por
    dois lugares.
  */
  const assuntosDoPlano = input.preparationId
    ? new Set(
        (
          await db
            .select({ id: studyPlanTopics.canonicalTopicId })
            .from(studyPlanTopics)
            .innerJoin(
              studyPlanSubjects,
              eq(studyPlanSubjects.id, studyPlanTopics.planSubjectId),
            )
            .where(
              and(
                eq(studyPlanSubjects.preparationId, input.preparationId),
                eq(studyPlanTopics.isActive, true),
              ),
            )
        )
          .map((linha) => linha.id)
          .filter((id): id is string => id !== null),
      )
    : new Set<string>();

  const condicoes = [eq(contentItems.status, "published"), isNull(contentItems.deletedAt)];

  if (filtros.type) condicoes.push(eq(contentItems.type, filtros.type));
  if (filtros.canonicalSubjectId) {
    condicoes.push(eq(contentItems.canonicalSubjectId, filtros.canonicalSubjectId));
  }

  const [linhas, acesso, contagemPorDisciplina] = await Promise.all([
    db
      .select({
        id: contentItems.id,
        type: contentItems.type,
        title: contentItems.title,
        description: contentItems.description,
        durationSeconds: contentItems.durationSeconds,
        requiredAccessLevel: contentItems.requiredAccessLevel,
        canonicalTopicId: contentItems.canonicalTopicId,
        subjectName: canonicalSubjects.name,
        topicName: canonicalTopics.name,
        progressPercent: contentProgress.progressPercent,
        progressStatus: contentProgress.status,
      })
      .from(contentItems)
      .leftJoin(canonicalSubjects, eq(canonicalSubjects.id, contentItems.canonicalSubjectId))
      .leftJoin(canonicalTopics, eq(canonicalTopics.id, contentItems.canonicalTopicId))
      .leftJoin(
        contentProgress,
        and(
          eq(contentProgress.contentItemId, contentItems.id),
          eq(contentProgress.userId, input.userId),
        ),
      )
      .where(and(...condicoes))
      .orderBy(asc(canonicalSubjects.name), asc(contentItems.sortOrder), asc(contentItems.title)),

    getContentAccess(input.userId),

    db
      .select({
        id: canonicalSubjects.id,
        name: canonicalSubjects.name,
        count: sql<number>`count(*)::int`,
      })
      .from(contentItems)
      .innerJoin(canonicalSubjects, eq(canonicalSubjects.id, contentItems.canonicalSubjectId))
      .where(and(eq(contentItems.status, "published"), isNull(contentItems.deletedAt)))
      .groupBy(canonicalSubjects.id, canonicalSubjects.name)
      .orderBy(asc(canonicalSubjects.name)),
  ]);

  /*
    A contagem de cartões só para os baralhos que apareceram — uma consulta,
    não uma por baralho. Sem isto, um acervo com 200 baralhos faria 200 idas ao
    banco só para escrever "12 cartões" em cada cartão da lista.
  */
  const baralhos = linhas.filter((l) => l.type === "flashcard_deck").map((l) => l.id);

  const cartoesPorBaralho = new Map<string, number>();
  if (baralhos.length > 0) {
    const contagens = await db
      .select({
        deckId: flashcards.contentItemId,
        total: sql<number>`count(*)::int`,
      })
      .from(flashcards)
      .where(inArray(flashcards.contentItemId, baralhos))
      .groupBy(flashcards.contentItemId);

    for (const linha of contagens) cartoesPorBaralho.set(linha.deckId, linha.total);
  }

  let bloqueados = 0;

  const itens: MaterialCard[] = linhas.map((linha) => {
    const noPlano =
      linha.canonicalTopicId !== null && assuntosDoPlano.has(linha.canonicalTopicId);

    const bloqueado = !acesso.canOpen(linha.requiredAccessLevel, linha.type);
    if (bloqueado) bloqueados += 1;

    return {
      id: linha.id,
      type: linha.type,
      title: linha.title,
      description: linha.description,
      subjectName: linha.subjectName,
      topicName: linha.topicName,
      durationSeconds: linha.durationSeconds,
      cardCount: linha.type === "flashcard_deck" ? (cartoesPorBaralho.get(linha.id) ?? 0) : null,
      inPlan: noPlano,
      locked: bloqueado,
      progressPercent: linha.progressPercent ?? 0,
      completed: linha.progressStatus === "completed",
    };
  });

  const filtrados = filtros.onlyMyPlan ? itens.filter((item) => item.inPlan) : itens;

  /*
    O que está no edital vem primeiro. Dentro de cada grupo a ordem do banco é
    preservada — `sort` em JavaScript é estável desde o ES2019, então disciplina
    e título continuam valendo como critério secundário sem precisar repeti-los.
  */
  filtrados.sort((a, b) => Number(b.inPlan) - Number(a.inPlan));

  return {
    items: filtrados,
    subjects: contagemPorDisciplina,
    lockedCount: bloqueados,
  };
}

/* ========================================================================== *
 * UM ITEM
 * ========================================================================== */

export type MaterialDetail = {
  id: string;
  type: MaterialCard["type"];
  title: string;
  description: string | null;
  subjectName: string | null;
  topicName: string | null;
  topicSlug: string | null;
  storagePath: string | null;
  externalUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  durationSeconds: number | null;
  locked: boolean;
  cards: Array<{ id: string; front: string; back: string; hint: string | null }>;
};

export async function getMaterial(input: {
  userId: string;
  contentItemId: string;
}): Promise<MaterialDetail | null> {
  const [linha] = await db
    .select({
      id: contentItems.id,
      type: contentItems.type,
      title: contentItems.title,
      description: contentItems.description,
      requiredAccessLevel: contentItems.requiredAccessLevel,
      storagePath: contentItems.storagePath,
      externalUrl: contentItems.externalUrl,
      imageWidth: contentItems.imageWidth,
      imageHeight: contentItems.imageHeight,
      durationSeconds: contentItems.durationSeconds,
      subjectName: canonicalSubjects.name,
      topicName: canonicalTopics.name,
      topicSlug: canonicalTopics.slug,
    })
    .from(contentItems)
    .leftJoin(canonicalSubjects, eq(canonicalSubjects.id, contentItems.canonicalSubjectId))
    .leftJoin(canonicalTopics, eq(canonicalTopics.id, contentItems.canonicalTopicId))
    .where(
      and(
        eq(contentItems.id, input.contentItemId),
        eq(contentItems.status, "published"),
        isNull(contentItems.deletedAt),
      ),
    )
    .limit(1);

  if (!linha) return null;

  const acesso = await getContentAccess(input.userId);
  const bloqueado = !acesso.canOpen(linha.requiredAccessLevel, linha.type);

  /*
    ⚠️ OS CARTÕES SÓ SÃO BUSCADOS SE O ITEM ESTIVER LIBERADO.
    Trazer o conteúdo e esconder na tela deixaria o material pago no HTML de
    quem não pagou — é o mesmo erro do gabarito no payload da questão.
  */
  const cartoes =
    linha.type === "flashcard_deck" && !bloqueado
      ? await db
          .select({
            id: flashcards.id,
            front: flashcards.front,
            back: flashcards.back,
            hint: flashcards.hint,
          })
          .from(flashcards)
          .where(eq(flashcards.contentItemId, linha.id))
          .orderBy(asc(flashcards.sortOrder))
      : [];

  return {
    id: linha.id,
    type: linha.type,
    title: linha.title,
    description: linha.description,
    subjectName: linha.subjectName,
    topicName: linha.topicName,
    topicSlug: linha.topicSlug,
    storagePath: bloqueado ? null : linha.storagePath,
    externalUrl: bloqueado ? null : linha.externalUrl,
    imageWidth: linha.imageWidth,
    imageHeight: linha.imageHeight,
    durationSeconds: linha.durationSeconds,
    locked: bloqueado,
    cards: cartoes,
  };
}

/**
 * Marca o item como aberto e, opcionalmente, concluído.
 *
 * `onConflictDoUpdate` porque a primeira abertura e a centésima passam pelo
 * mesmo caminho — e porque o índice único (usuário, item) é o que garante uma
 * linha de progresso por par, mesmo com duas abas abertas.
 */
export async function touchContentProgress(input: {
  userId: string;
  contentItemId: string;
  progressPercent?: number;
  completed?: boolean;
  now?: Date;
}): Promise<void> {
  const agora = input.now ?? new Date();
  const percentual = Math.max(0, Math.min(100, input.progressPercent ?? 0));

  await db
    .insert(contentProgress)
    .values({
      userId: input.userId,
      contentItemId: input.contentItemId,
      status: input.completed ? "completed" : "in_progress",
      progressPercent: input.completed ? 100 : percentual,
      lastAccessedAt: agora,
      completedAt: input.completed ? agora : null,
    })
    .onConflictDoUpdate({
      target: [contentProgress.userId, contentProgress.contentItemId],
      set: {
        // O progresso nunca ANDA PARA TRÁS. Reabrir um mapa mental já lido não
        // pode zerar a marca de concluído.
        progressPercent: input.completed
          ? sql`100`
          : sql`greatest(${contentProgress.progressPercent}, ${percentual})`,
        status: input.completed
          ? "completed"
          : sql`case when ${contentProgress.status} = 'completed' then 'completed'::content_progress_status
                 else 'in_progress'::content_progress_status end`,
        lastAccessedAt: agora,
        completedAt: input.completed
          ? sql`coalesce(${contentProgress.completedAt}, ${agora.toISOString()}::timestamptz)`
          : contentProgress.completedAt,
        updatedAt: agora,
      },
    });
}

/** Os materiais de um assunto — usado pelo bloco "Estude" da Tarefa do Dia. */
export async function findMaterialsForTopic(
  canonicalTopicId: string,
  limit = 6,
): Promise<Array<Pick<MaterialCard, "id" | "type" | "title">>> {
  return db
    .select({
      id: contentItems.id,
      type: contentItems.type,
      title: contentItems.title,
    })
    .from(contentItems)
    .where(
      and(
        eq(contentItems.canonicalTopicId, canonicalTopicId),
        eq(contentItems.status, "published"),
        isNull(contentItems.deletedAt),
      ),
    )
    .orderBy(asc(contentItems.sortOrder), desc(contentItems.createdAt))
    .limit(limit);
}
