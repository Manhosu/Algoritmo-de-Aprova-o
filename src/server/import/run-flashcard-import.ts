import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { taxonomyKey } from "@/modules/taxonomy/normalize";
import { db } from "@/server/db";
import { canonicalTopics, contentItems, flashcards } from "@/server/db/schema";
import { loadCatalog, matchSubject, matchTopic } from "@/server/taxonomy/mapping";

import { parseFlashcards } from "./flashcards";

/**
 * IMPORTAÇÃO DE BARALHOS DE FLASHCARDS PELA PLANILHA.
 * ============================================================================
 *
 * ⚠️ ESTA LÓGICA VIVIA SÓ DENTRO DE UM SCRIPT, e a cliente não roda scripts.
 *
 * Palavras dela, nas observações de 08/09/2026: "tentei cadastrar um arquivo
 * xlsx de flashcards e um mapa mental, não deu certo, coloquei o link do drive.
 * Liberar o cadastro por upload".
 *
 * O mapa mental foi resolvido pelo botão de enviar arquivo. O baralho não é
 * arquivo: o conteúdo dele são os CARTÕES, que precisam virar linhas em
 * `flashcards` para o aluno poder virar um a um. Guardar o .xlsx no acervo
 * entregaria uma planilha para download no lugar de um baralho.
 *
 * Então a importação saiu do script e virou este módulo, que o painel chama.
 *
 * ⚠️ ASSUNTO NOVO É CRIADO, e não descartado.
 *
 * É a mesma correção que o importador de QUESTÕES recebeu depois de ela
 * relatar: "o site não está permitindo salvar questões de assuntos novos". O
 * baralho tinha o mesmo defeito, e ninguém tinha reclamado ainda porque só eu
 * rodava a importação.
 */

export type FlashcardImportReport = {
  fileName: string;
  /** Cartões lidos da planilha. */
  parsed: number;
  issues: Array<{ row: number; message: string }>;
  decks: Array<{ label: string; cards: number; status: "novo" | "substituído" | "recusado" }>;
  created: number;
  updated: number;
  /** Assuntos que não existiam no catálogo e foram criados. */
  createdTopics: string[];
  /** Disciplinas fora do catálogo. O baralho fica de fora até alguém cadastrá-la. */
  unknownSubjects: string[];
};

export async function runFlashcardImport(input: {
  bytes: Uint8Array;
  fileName: string;
  dryRun: boolean;
}): Promise<FlashcardImportReport> {
  const lido = parseFlashcards(input.bytes);
  const catalogo = await loadCatalog();

  const report: FlashcardImportReport = {
    fileName: input.fileName,
    parsed: lido.cards.length,
    issues: lido.issues.slice(0, 20),
    decks: [],
    created: 0,
    updated: 0,
    createdTopics: [],
    unknownSubjects: [],
  };

  /*
    ⚠️ O CASAMENTO USA O MESMO CASADOR DO EDITAL, e não comparação literal.

    A planilha dela diz "Português"; o catálogo diz "Língua Portuguesa".
    Comparar `normalized_name` direto reprovava a planilha inteira. Duas formas
    de casar disciplina no mesmo sistema dariam dois resultados diferentes para
    o mesmo nome.
  */
  const assuntosNovos = new Map<string, { nome: string; subjectId: string }>();

  const preparados: Array<{
    deck: (typeof lido.decks)[number];
    subjectId: string;
    topicId: string | null;
    /** Chave do assunto a criar, quando ele ainda não existe. */
    chaveDoNovo: string | null;
  }> = [];

  for (const deck of lido.decks) {
    const disciplina = matchSubject(deck.subject, catalogo);

    if (!disciplina.canonicalId) {
      if (!report.unknownSubjects.includes(deck.subject)) {
        report.unknownSubjects.push(deck.subject);
      }
      report.decks.push({
        label: `${deck.subject} › ${deck.topic} › ${deck.deck}`,
        cards: deck.count,
        status: "recusado",
      });
      continue;
    }

    const assunto = matchTopic(deck.topic, disciplina.canonicalId, catalogo);
    const chave = `${disciplina.canonicalId}::${taxonomyKey(deck.topic)}`;

    if (!assunto.canonicalId) {
      assuntosNovos.set(chave, { nome: deck.topic, subjectId: disciplina.canonicalId });
      if (!report.createdTopics.includes(deck.topic)) report.createdTopics.push(deck.topic);
    }

    preparados.push({
      deck,
      subjectId: disciplina.canonicalId,
      topicId: assunto.canonicalId,
      chaveDoNovo: assunto.canonicalId ? null : chave,
    });
  }

  if (input.dryRun) {
    for (const { deck } of preparados) {
      report.decks.push({
        label: `${deck.subject} › ${deck.topic} › ${deck.deck}`,
        cards: deck.count,
        status: "novo",
      });
    }
    return report;
  }

  /*
    Os assuntos novos nascem numa passada só, ANTES dos baralhos. Criá-los
    dentro do laço faria uma ida ao banco por baralho e criaria a mesma linha
    várias vezes quando dois baralhos dividem o assunto.
  */
  const idsDosNovos = new Map<string, string>();

  for (const [chave, novo] of assuntosNovos) {
    const normalizado = taxonomyKey(novo.nome);
    const base = normalizado.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 180);

    /* O sufixo evita colidir com o índice único de `slug` entre disciplinas. */
    const sufixo = Math.random().toString(36).slice(2, 8);
    const dona = catalogo.subjects.find((d) => d.id === novo.subjectId);

    const [linha] = await db
      .insert(canonicalTopics)
      .values({
        subjectId: novo.subjectId,
        name: novo.nome,
        slug: `${base}-${sufixo}`,
        normalizedName: normalizado,
        path: `${taxonomyKey(dona?.name ?? "")}.${normalizado}`,
      })
      .returning({ id: canonicalTopics.id });

    idsDosNovos.set(chave, linha.id);
  }

  for (const preparado of preparados) {
    const topicId = preparado.topicId ?? idsDosNovos.get(preparado.chaveDoNovo ?? "") ?? null;
    if (!topicId) continue;

    const { deck } = preparado;

    const cartoes = lido.cards.filter(
      (c) => c.subject === deck.subject && c.topic === deck.topic && c.deck === deck.deck,
    );

    const existente = await db.query.contentItems.findFirst({
      where: (t, { and: e, eq: is, isNull: n }) =>
        e(
          is(t.type, "flashcard_deck"),
          is(t.title, deck.deck.slice(0, 240)),
          is(t.canonicalTopicId, topicId),
          n(t.deletedAt),
        ),
      columns: { id: true },
    });

    const itemId =
      existente?.id ??
      (
        await db
          .insert(contentItems)
          .values({
            type: "flashcard_deck",
            title: deck.deck.slice(0, 240),
            canonicalSubjectId: preparado.subjectId,
            canonicalTopicId: topicId,
            requiredAccessLevel: cartoes[0]?.accessLevel ?? "limited",
            status: "published",
            publishedAt: new Date(),
          })
          .returning({ id: contentItems.id })
      )[0].id;

    /*
      ⚠️ REIMPORTAR SUBSTITUI OS CARTÕES, e não acrescenta.

      Sem apagar antes, a segunda importação da mesma planilha criaria um
      baralho com cada cartão duplicado, e ninguém consegue distinguir a cópia
      do original depois.
    */
    if (existente) {
      await db.delete(flashcards).where(eq(flashcards.contentItemId, itemId));
      report.updated += 1;
    } else {
      report.created += 1;
    }

    if (cartoes.length > 0) {
      await db.insert(flashcards).values(
        cartoes.map((card) => ({
          contentItemId: itemId,
          front: card.front,
          back: card.back,
          hint: card.hint,
          sortOrder: card.sortOrder,
        })),
      );
    }

    report.decks.push({
      label: `${deck.subject} › ${deck.topic} › ${deck.deck}`,
      cards: cartoes.length,
      status: existente ? "substituído" : "novo",
    });
  }

  return report;
}

/** Quantos baralhos publicados existem hoje. Serve ao aviso do painel. */
export async function countPublishedDecks(): Promise<number> {
  const linhas = await db
    .select({ id: contentItems.id })
    .from(contentItems)
    .where(
      and(
        eq(contentItems.type, "flashcard_deck"),
        eq(contentItems.status, "published"),
        isNull(contentItems.deletedAt),
      ),
    );

  return linhas.length;
}
