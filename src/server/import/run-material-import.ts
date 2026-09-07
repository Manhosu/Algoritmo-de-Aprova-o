import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { taxonomyKey } from "@/modules/taxonomy/normalize";
import { db } from "@/server/db";
import { contentItems } from "@/server/db/schema";
import { loadCatalog, matchSubject, matchTopic } from "@/server/taxonomy/mapping";

import { parseMaterialSheet, type ParsedMaterial } from "./materials";

/**
 * IMPORTAÇÃO DE MATERIAIS — a parte que grava.
 * ============================================================================
 *
 * ⚠️ A MESMA REGRA DE CASAMENTO DA IMPORTAÇÃO DE QUESTÕES.
 *
 * A disciplina de um material é a DONA do assunto dele, não a que veio na
 * planilha. Foi a correção que reparou 560 questões guardadas sob a disciplina
 * errada, e repetir o caminho antigo aqui recriaria o mesmo problema no acervo
 * de materiais — com o agravante de que a biblioteca filtra por disciplina.
 *
 * ⚠️ MATERIAL SEM ENDEREÇO ENTRA COMO RASCUNHO, e não é recusado.
 *
 * A cliente monta a planilha antes de ter todos os links. Recusar a linha faria
 * ela reenviar a planilha inteira depois; entrar como rascunho deixa o material
 * cadastrado, classificado e invisível para o aluno até ela colar o endereço.
 *
 * Baralho de flashcards é a exceção: o conteúdo dele são os cartões, então ele
 * publica sem endereço nenhum.
 */

export type MaterialImportReport = {
  fileName: string;
  parsed: number;
  issues: Array<{ row: number; message: string }>;
  /** Casaram com o catálogo e podiam ser gravados. */
  matched: number;
  created: number;
  updated: number;
  /** Entraram como rascunho por falta de endereço. */
  drafts: number;
  /** Nada no catálogo casou. A cliente precisa cadastrar e reimportar. */
  unmatched: Array<{ label: string; count: number }>;
};

type Preparado = {
  material: ParsedMaterial;
  subjectId: string;
  topicId: string | null;
};

/** Baralho guarda o conteúdo nos cartões — ver a nota em `material-admin`. */
function precisaDeEndereco(tipo: string): boolean {
  return tipo !== "flashcard_deck";
}

export async function runMaterialImport(input: {
  bytes: Uint8Array;
  fileName: string;
  /** Confere e relata sem gravar nada. */
  dryRun?: boolean;
}): Promise<MaterialImportReport> {
  const resultado = parseMaterialSheet(input.bytes);
  const catalogo = await loadCatalog();

  const prontos: Preparado[] = [];
  const foraDoCatalogo = new Map<string, number>();

  for (const material of resultado.materials) {
    const disciplina = matchSubject(material.subjectName, catalogo);

    if (!disciplina.canonicalId) {
      conta(foraDoCatalogo, `(disciplina) ${material.subjectName}`);
      continue;
    }

    /*
      Assunto em branco é legítimo: existe material que cobre a disciplina
      inteira. Ele entra com `canonical_topic_id` nulo e aparece na biblioteca
      pelo filtro de disciplina.
    */
    if (!material.topicName) {
      prontos.push({ material, subjectId: disciplina.canonicalId, topicId: null });
      continue;
    }

    const assunto = matchTopic(material.topicName, disciplina.canonicalId, catalogo);

    const encontrado =
      assunto.canonicalId
        ? catalogo.topics.find((t) => t.id === assunto.canonicalId)
        : catalogo.topics.find(
            (t) => t.normalizedName === taxonomyKey(material.topicName),
          );

    if (!encontrado) {
      conta(foraDoCatalogo, `${material.subjectName} › ${material.topicName}`);
      continue;
    }

    prontos.push({
      material,
      /* A dona do assunto manda. Ver a nota do cabeçalho. */
      subjectId: encontrado.subjectId ?? disciplina.canonicalId,
      topicId: encontrado.id,
    });
  }

  const base: MaterialImportReport = {
    fileName: input.fileName,
    parsed: resultado.materials.length,
    issues: resultado.issues,
    matched: prontos.length,
    created: 0,
    updated: 0,
    drafts: 0,
    unmatched: ordenar(foraDoCatalogo),
  };

  if (input.dryRun) {
    /*
      Na conferência, "rascunho" ainda é informação útil: ela vê quantos vão
      entrar invisíveis antes de decidir gravar.
    */
    return {
      ...base,
      drafts: prontos.filter(
        (p) => precisaDeEndereco(p.material.type) && !p.material.externalUrl,
      ).length,
    };
  }

  let criados = 0;
  let atualizados = 0;
  let rascunhos = 0;

  for (const { material, subjectId, topicId } of prontos) {
    const publicavel =
      !precisaDeEndereco(material.type) || Boolean(material.externalUrl);

    if (!publicavel) rascunhos++;

    const valores = {
      title: material.title,
      description: material.description,
      type: material.type as never,
      canonicalSubjectId: subjectId,
      canonicalTopicId: topicId,
      externalUrl: material.externalUrl,
      requiredAccessLevel: material.requiredAccessLevel,
      status: (publicavel ? "published" : "draft") as "published" | "draft",
      publishedAt: publicavel ? new Date() : null,
      updatedAt: new Date(),
    };

    /*
      ⚠️ REIMPORTAR A MESMA PLANILHA ATUALIZA, e não duplica.

      É o comportamento que ela vai querer: corrigir um endereço na planilha e
      reenviar. O par (título, tipo) é a identidade — dois materiais com o mesmo
      nome e tipo são o mesmo material, e `content_items` não tem chave natural
      para um índice único cobrir isso.
    */
    const [existente] = await db
      .select({ id: contentItems.id })
      .from(contentItems)
      .where(
        and(
          sql`lower(${contentItems.title}) = lower(${material.title})`,
          eq(contentItems.type, material.type as never),
          isNull(contentItems.deletedAt),
        ),
      )
      .limit(1);

    if (existente) {
      await db.update(contentItems).set(valores).where(eq(contentItems.id, existente.id));
      atualizados++;
    } else {
      await db.insert(contentItems).values(valores);
      criados++;
    }
  }

  return { ...base, created: criados, updated: atualizados, drafts: rascunhos };
}

function conta(mapa: Map<string, number>, chave: string): void {
  mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
}

function ordenar(mapa: Map<string, number>): Array<{ label: string; count: number }> {
  return [...mapa].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
}
