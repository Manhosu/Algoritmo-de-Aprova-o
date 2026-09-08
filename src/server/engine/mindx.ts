import "server-only";

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { selectMindXFeed, type ScoredVideo } from "@/modules/mindx/select";
import { db } from "@/server/db";
import {
  canonicalSubjects,
  canonicalTopics,
  contentItems,
  contentProgress,
  studyPlanSubjects,
  studyPlanTopics,
  topicStates,
} from "@/server/db/schema";
import { getContentAccess } from "@/server/billing/content-access";
import { signContentUrl } from "@/server/storage";

/**
 * MIND-X — a parte que toca o banco.
 * ============================================================================
 *
 * Junta três coisas que já existem e nunca tinham conversado: os vídeos do
 * acervo, as lacunas que o Motor 1 calcula e o que o aluno já viu.
 *
 * ⚠️ O RECORTE É O EDITAL DELE, e ele é feito no SQL.
 *
 * Palavras da cliente: "o sistema só poderá apresentar vídeos relacionados às
 * disciplinas/assuntos que fazem parte do edital do aluno". Trazer o acervo
 * inteiro e filtrar em memória funcionaria hoje, com 66 materiais, e viraria
 * uma varredura completa no dia em que houver mil.
 *
 * ⚠️ O NÍVEL DE ACESSO DO PLANO VALE AQUI TAMBÉM.
 *
 * Um vídeo marcado como "Só no Completo" não pode aparecer no feed de quem está
 * no Free. Sem esta checagem, o Mind-X viraria a porta dos fundos do conteúdo
 * pago — e ninguém notaria, porque o feed é justamente o lugar onde o aluno não
 * escolhe o que vê.
 */

export type MindXItem = {
  id: string;
  title: string;
  description: string | null;
  /** URL assinada ou externa. Nulo quando o arquivo sumiu do armazenamento. */
  src: string | null;
  subjectName: string | null;
  topicName: string | null;
  /** Por que este vídeo está aqui — a tela mostra em uma linha. */
  reason: ScoredVideo["reason"];
};

export type MindXFeed = {
  items: MindXItem[];
  /** Quantos vídeos existem no edital dele, antes do corte de 24 horas. */
  totalInPlan: number;
};

/** Quantos vídeos o feed entrega por vez. */
const TAMANHO_DO_FEED = 10;

export async function getMindXFeed(input: {
  userId: string;
  preparationId: string;
  now?: Date;
}): Promise<MindXFeed> {
  const agora = input.now ?? new Date();

  /*
    Os assuntos canônicos do edital dele. É o universo do feed, e sai daqui
    porque tanto os vídeos quanto os sinais precisam ser recortados por ele.
  */
  const assuntos = await db
    .select({
      canonicalTopicId: studyPlanTopics.canonicalTopicId,
      canonicalSubjectId: studyPlanSubjects.canonicalSubjectId,
      weight: studyPlanTopics.weight,
      /*
        O erro do assunto, calculado no banco. `null` quando ele respondeu
        menos que o mínimo — abaixo disso o percentual mede sorte, e é a mesma
        régua que o card "Lacunas" usa.
      */
      errorPercent: sql<number | null>`case
        when ${topicStates.questionsAnswered} >= 5
        then round(
          (${topicStates.questionsAnswered} - ${topicStates.questionsCorrect}) * 100.0
          / nullif(${topicStates.questionsAnswered}, 0)
        )::int
        else null
      end`,
    })
    .from(studyPlanTopics)
    .innerJoin(studyPlanSubjects, eq(studyPlanSubjects.id, studyPlanTopics.planSubjectId))
    .leftJoin(topicStates, eq(topicStates.planTopicId, studyPlanTopics.id))
    .where(
      and(
        eq(studyPlanSubjects.preparationId, input.preparationId),
        eq(studyPlanTopics.isActive, true),
        isNull(studyPlanTopics.deletedAt),
      ),
    );

  const idsDeAssunto = assuntos
    .map((a) => a.canonicalTopicId)
    .filter((id): id is string => Boolean(id));

  const idsDeDisciplina = [
    ...new Set(
      assuntos.map((a) => a.canonicalSubjectId).filter((id): id is string => Boolean(id)),
    ),
  ];

  if (idsDeAssunto.length === 0 && idsDeDisciplina.length === 0) {
    return { items: [], totalInPlan: 0 };
  }

  /*
    Vídeos publicados que pertencem ao edital dele, pelo assunto OU pela
    disciplina. `left join` no progresso porque a maioria nunca foi vista, e um
    `inner` sumiria justamente com os inéditos.
  */
  const videos = await db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      description: contentItems.description,
      storagePath: contentItems.storagePath,
      externalUrl: contentItems.externalUrl,
      canonicalTopicId: contentItems.canonicalTopicId,
      canonicalSubjectId: contentItems.canonicalSubjectId,
      requiredAccessLevel: contentItems.requiredAccessLevel,
      lastSeenAt: contentProgress.lastAccessedAt,
    })
    .from(contentItems)
    .leftJoin(
      contentProgress,
      and(
        eq(contentProgress.contentItemId, contentItems.id),
        eq(contentProgress.userId, input.userId),
      ),
    )
    .where(
      and(
        eq(contentItems.type, "video"),
        eq(contentItems.status, "published"),
        isNull(contentItems.deletedAt),
        /*
          `inArray` com lista vazia gera `in ()`, que o Postgres recusa. Os dois
          ramos entram só quando têm conteúdo, e `or` de um ramo só continua
          válido — o caso de sair sem nenhum já foi tratado acima.
        */
        or(
          ...[
            idsDeAssunto.length > 0
              ? inArray(contentItems.canonicalTopicId, idsDeAssunto)
              : undefined,
            idsDeDisciplina.length > 0
              ? inArray(contentItems.canonicalSubjectId, idsDeDisciplina)
              : undefined,
          ].filter((clausula) => clausula !== undefined),
        ),
      ),
    );

  if (videos.length === 0) return { items: [], totalInPlan: 0 };

  /*
    ⚠️ O NÍVEL DO PLANO É APLICADO ANTES DA ORDENAÇÃO.

    Ordenar e depois cortar o que ele não pode ver entregaria um feed menor do
    que o previsto justamente para quem paga menos — e, pior, o vídeo pago
    ocuparia a vaga do melhor vídeo liberado.
  */
  const acesso = await getContentAccess(input.userId);
  const permitidos = videos.filter((v) =>
    acesso.canOpen(v.requiredAccessLevel, "video"),
  );

  const ordenados = selectMindXFeed({
    now: agora,
    videos: permitidos.map((v) => ({
      contentItemId: v.id,
      title: v.title,
      canonicalTopicId: v.canonicalTopicId,
      canonicalSubjectId: v.canonicalSubjectId,
      lastSeenAt: v.lastSeenAt,
    })),
    signals: assuntos.map((a) => ({
      canonicalTopicId: a.canonicalTopicId,
      canonicalSubjectId: a.canonicalSubjectId,
      errorPercent: a.errorPercent === null ? null : Number(a.errorPercent),
      weight: a.weight,
    })),
  });

  const escolhidos = ordenados.slice(0, TAMANHO_DO_FEED);
  const porId = new Map(permitidos.map((v) => [v.id, v]));

  /*
    Os nomes de disciplina e assunto vêm numa consulta só, para os escolhidos.
    Trazê-los no `select` de cima exigiria dois joins que a maioria das linhas
    descartaria — o feed entrega dez de um acervo que pode ter centenas.
  */
  const nomes = await carregarNomes(escolhidos.map((v) => v.contentItemId));

  const itens = await Promise.all(
    escolhidos.map(async (escolhido): Promise<MindXItem> => {
      const bruto = porId.get(escolhido.contentItemId)!;

      /*
        ⚠️ A FALHA DA ASSINATURA NÃO DERRUBA O FEED.

        É a mesma armadilha da tela de material, que a cliente encontrou duas
        vezes: `signContentUrl` lança quando o Supabase recusa, e num feed de
        dez vídeos um arquivo sumido levaria os outros nove junto.
      */
      let src: string | null = bruto.externalUrl;

      if (bruto.storagePath) {
        try {
          src = await signContentUrl(bruto.storagePath);
        } catch (erro) {
          console.error("[mindx] falha ao assinar o vídeo", bruto.id, erro);
          src = null;
        }
      }

      return {
        id: bruto.id,
        title: bruto.title,
        description: bruto.description,
        src,
        subjectName: nomes.get(bruto.id)?.subjectName ?? null,
        topicName: nomes.get(bruto.id)?.topicName ?? null,
        reason: escolhido.reason,
      };
    }),
  );

  return {
    /* Vídeo sem endereço não entra: um card preto que não toca é pior que nada. */
    items: itens.filter((item) => item.src !== null),
    totalInPlan: permitidos.length,
  };
}

/** Nomes de disciplina e assunto dos vídeos escolhidos. */
async function carregarNomes(
  ids: string[],
): Promise<Map<string, { subjectName: string | null; topicName: string | null }>> {
  if (ids.length === 0) return new Map();

  const linhas = await db
    .select({
      id: contentItems.id,
      subjectName: canonicalSubjects.name,
      topicName: canonicalTopics.name,
    })
    .from(contentItems)
    .leftJoin(canonicalSubjects, eq(canonicalSubjects.id, contentItems.canonicalSubjectId))
    .leftJoin(canonicalTopics, eq(canonicalTopics.id, contentItems.canonicalTopicId))
    .where(inArray(contentItems.id, ids));

  return new Map(
    linhas.map((l) => [l.id, { subjectName: l.subjectName, topicName: l.topicName }]),
  );
}

/**
 * Marca o vídeo como visto.
 *
 * ⚠️ É O QUE FAZ A ROTAÇÃO EXISTIR. Sem esta escrita, `lastSeenAt` fica nulo
 * para sempre e o aluno recebe os mesmos dez vídeos em todas as aberturas.
 *
 * Reaproveita `content_progress`, a mesma tabela do resto da biblioteca: o
 * Mind-X é uma forma de apresentar material, não um tipo novo de conteúdo.
 */
export async function markMindXSeen(input: {
  userId: string;
  contentItemId: string;
  now?: Date;
}): Promise<void> {
  const agora = input.now ?? new Date();

  await db
    .insert(contentProgress)
    .values({
      userId: input.userId,
      contentItemId: input.contentItemId,
      status: "in_progress",
      progressPercent: 0,
      lastAccessedAt: agora,
    })
    .onConflictDoUpdate({
      target: [contentProgress.userId, contentProgress.contentItemId],
      set: {
        /*
          O progresso NUNCA anda para trás: um vídeo já marcado como estudado
          na biblioteca não volta a "em andamento" só porque passou no feed.
        */
        lastAccessedAt: agora,
        updatedAt: agora,
      },
    });
}
