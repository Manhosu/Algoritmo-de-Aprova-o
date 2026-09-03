import "server-only";

import { and, count, desc, eq, isNull, ne } from "drizzle-orm";

import { db } from "@/server/db";
import { canonicalSubjects, canonicalTopics, contentItems } from "@/server/db/schema";

/**
 * CADASTRO DE MATERIAIS PELO PAINEL (pedido de 02/09/2026).
 * ============================================================================
 *
 * Palavras da cliente: "preciso conseguir cadastrar os materiais de estudo,
 * indicando a disciplina, o assunto e quem pode ver".
 *
 * ⚠️ O NÍVEL DE ACESSO É O CAMPO QUE MAIS IMPORTA AQUI.
 *
 * `limited` aparece no Free; `full` só no Premium. Errar para baixo entrega de
 * graça o material que sustenta a assinatura; errar para cima esconde do Free
 * justamente a amostra que o faz assinar. Por isso ele é obrigatório e explícito
 * no formulário, sem padrão silencioso.
 */

export type AdminMaterialRow = {
  id: string;
  title: string;
  type: string;
  status: string;
  requiredAccessLevel: string;
  subjectName: string | null;
  topicName: string | null;
  hasSource: boolean;
};

/**
 * ⚠️ BARALHO DE FLASHCARDS NÃO TEM ENDEREÇO, e não é falta.
 *
 * O conteúdo dele são os cartões, na tabela `flashcards` — não há arquivo nem
 * link para apontar. Exigir endereço marcaria todo baralho publicado como
 * defeituoso na lista e impediria publicar um novo, que é o oposto do que este
 * cadastro existe para fazer.
 */
function precisaDeEndereco(tipo: string): boolean {
  return tipo !== "flashcard_deck";
}

export async function listMaterialsForAdmin(input?: {
  subjectId?: string | null;
  type?: string | null;
}): Promise<AdminMaterialRow[]> {
  const condicoes = [isNull(contentItems.deletedAt)];

  if (input?.subjectId) condicoes.push(eq(contentItems.canonicalSubjectId, input.subjectId));

  const linhas = await db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      type: contentItems.type,
      status: contentItems.status,
      requiredAccessLevel: contentItems.requiredAccessLevel,
      subjectName: canonicalSubjects.name,
      topicName: canonicalTopics.name,
      storagePath: contentItems.storagePath,
      externalUrl: contentItems.externalUrl,
    })
    .from(contentItems)
    .leftJoin(canonicalSubjects, eq(canonicalSubjects.id, contentItems.canonicalSubjectId))
    .leftJoin(canonicalTopics, eq(canonicalTopics.id, contentItems.canonicalTopicId))
    .where(and(...condicoes))
    .orderBy(desc(contentItems.updatedAt))
    .limit(200);

  return linhas.map((linha) => ({
    id: linha.id,
    title: linha.title,
    type: linha.type,
    status: linha.status,
    requiredAccessLevel: linha.requiredAccessLevel,
    subjectName: linha.subjectName,
    topicName: linha.topicName,
    /*
      Material publicado sem origem é a falha mais provável deste cadastro: o
      card aparece na biblioteca e não abre nada. A lista marca; o formulário
      recusa publicar.
    */
    hasSource:
      !precisaDeEndereco(linha.type) ||
      Boolean(linha.storagePath?.trim() || linha.externalUrl?.trim()),
  }));
}

export type AdminMaterialDetail = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  requiredAccessLevel: string;
  canonicalSubjectId: string | null;
  canonicalTopicId: string | null;
  externalUrl: string | null;
  storagePath: string | null;
};

export async function getMaterialForAdmin(id: string): Promise<AdminMaterialDetail | null> {
  const [linha] = await db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      description: contentItems.description,
      type: contentItems.type,
      status: contentItems.status,
      requiredAccessLevel: contentItems.requiredAccessLevel,
      canonicalSubjectId: contentItems.canonicalSubjectId,
      canonicalTopicId: contentItems.canonicalTopicId,
      externalUrl: contentItems.externalUrl,
      storagePath: contentItems.storagePath,
    })
    .from(contentItems)
    .where(and(eq(contentItems.id, id), isNull(contentItems.deletedAt)))
    .limit(1);

  return linha ?? null;
}

export type MaterialInput = {
  /** Ausente cria; presente atualiza. */
  id?: string | null;
  title: string;
  description: string | null;
  type: string;
  status: "draft" | "published" | "archived";
  /** Os três níveis do README 2.5 — `extended` é o do meio e é usado. */
  requiredAccessLevel: "limited" | "extended" | "full";
  canonicalSubjectId: string | null;
  canonicalTopicId: string | null;
  externalUrl: string | null;
};

export type SaveMaterialResult =
  | { ok: true; id: string; created: boolean }
  | { ok: false; message: string };

export async function saveMaterial(input: MaterialInput): Promise<SaveMaterialResult> {
  const titulo = input.title.trim();
  if (titulo.length < 3) return { ok: false, message: "O título está curto demais." };

  const url = input.externalUrl?.trim() || null;

  if (url && !/^https?:\/\//i.test(url)) {
    /*
      Sem o esquema, o navegador trata "www.exemplo.com" como caminho relativo e
      o aluno cai numa página inexistente DENTRO da plataforma. Parece defeito
      nosso, não link errado.
    */
    return { ok: false, message: "O endereço precisa começar com http:// ou https://" };
  }

  if (input.status === "published" && precisaDeEndereco(input.type) && !url) {
    return {
      ok: false,
      message: "Material publicado precisa de um endereço. Salve como rascunho enquanto ele não existe.",
    };
  }

  if (input.status === "published" && !input.canonicalSubjectId) {
    /*
      Sem disciplina o material some da biblioteca filtrada e do algoritmo: ele
      existe no banco e não é alcançável por nenhum caminho do aluno.
    */
    return {
      ok: false,
      message: "Material publicado precisa de disciplina, senão ele não aparece na biblioteca.",
    };
  }

  const valores = {
    title: titulo,
    description: input.description?.trim() || null,
    type: input.type as never,
    status: input.status,
    requiredAccessLevel: input.requiredAccessLevel,
    canonicalSubjectId: input.canonicalSubjectId,
    canonicalTopicId: input.canonicalTopicId,
    externalUrl: url,
    /*
      `published_at` marca a PRIMEIRA publicação e não é reescrito depois: é a
      data que ordena "o que chegou de novo" na biblioteca. Reescrevê-la a cada
      salvamento faria um ajuste de vírgula empurrar o material de volta ao topo
      dos lançamentos.
    */
    publishedAt: input.status === "published" ? new Date() : null,
    updatedAt: new Date(),
  };

  if (input.id) {
    const atual = await getMaterialForAdmin(input.id);
    if (!atual) return { ok: false, message: "Material não encontrado." };

    await db
      .update(contentItems)
      .set({
        ...valores,
        publishedAt:
          atual.status === "published" && input.status === "published"
            ? undefined
            : valores.publishedAt,
      })
      .where(eq(contentItems.id, input.id));

    return { ok: true, id: input.id, created: false };
  }

  const [criado] = await db
    .insert(contentItems)
    .values(valores)
    .returning({ id: contentItems.id });

  return { ok: true, id: criado.id, created: true };
}

/**
 * Arquiva um material.
 *
 * ⚠️ SEMPRE `deleted_at`, nunca `delete`.
 *
 * `content_progress` e `review_schedules` apontam para o item: o material está
 * dentro do histórico de estudo e do calendário de revisões dos alunos. Apagar a
 * linha derrubaria revisões agendadas de gente que estudou aquilo.
 */
export async function archiveMaterial(id: string): Promise<{ ok: boolean }> {
  await db
    .update(contentItems)
    .set({ status: "archived", deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(contentItems.id, id));

  return { ok: true };
}

/** Quantos materiais publicados estão sem endereço — o card que não abre nada. */
export async function countPublishedWithoutSource(): Promise<number> {
  const [linha] = await db
    .select({ total: count() })
    .from(contentItems)
    .where(
      and(
        isNull(contentItems.deletedAt),
        eq(contentItems.status, "published"),
        isNull(contentItems.externalUrl),
        isNull(contentItems.storagePath),
        /* Baralho de flashcards guarda o conteúdo nos cartões, não num arquivo. */
        ne(contentItems.type, "flashcard_deck"),
      ),
    );

  return linha?.total ?? 0;
}
