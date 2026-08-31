import "server-only";

import { and, eq } from "drizzle-orm";

import { normalizeText } from "@/modules/taxonomy/normalize";
import { db } from "@/server/db";
import { preparations, studyPlanSubjects, studyPlanTopics } from "@/server/db/schema";
import {
  enqueueUnmapped,
  loadCatalog,
  matchSubject,
  matchTopic,
} from "@/server/taxonomy/mapping";

/**
 * MONTAR O PLANO À MÃO, quando a leitura do edital não funciona.
 *
 * POR QUE ISTO EXISTE
 * ----------------------------------------------------------------------------
 * A leitura por IA falha em uma minoria de editais — PDF escaneado sem camada
 * de texto, arquivo grande demais, anexo com estrutura fora do comum. Até aqui
 * o aluno nessa situação tinha um único caminho: tentar de novo o mesmo
 * arquivo, que ia falhar de novo.
 *
 * A cliente pediu a saída ("seria possível incluir também a opção: CADASTRAR
 * MANUALMENTE"), e ela é a diferença entre um aluno que usa o produto e um
 * aluno que desiste na primeira tela.
 *
 * ⚠️ O CASAMENTO COM O CATÁLOGO É O MESMO da leitura automática. Quem digita
 * "Crase" precisa receber as mesmas questões de quem subiu um edital que diz
 * "Crase" — usar comparação literal aqui criaria dois acervos paralelos para o
 * mesmo assunto, e o aluno que digitou veria metade do que existe.
 *
 * O que não casa vai para a fila do painel, igual à leitura automática: é dali
 * que sai a lista do que cadastrar em seguida.
 */

export type ManualSubject = {
  name: string;
  /** Um assunto por linha, como a pessoa copia do edital. */
  topics: string[];
};

export type ManualPlanResult =
  | { ok: true; subjects: number; topics: number; mappedPercent: number }
  | { ok: false; message: string };

/** Teto por preparação. Edital nenhum tem mais que isso, e protege contra colagem acidental. */
const MAX_SUBJECTS = 30;
const MAX_TOPICS_PER_SUBJECT = 200;

export async function createManualPlan(input: {
  preparationId: string;
  userId: string;
  subjects: ManualSubject[];
}): Promise<ManualPlanResult> {
  const preparation = await db.query.preparations.findFirst({
    where: (t, { and: a, eq: e }) =>
      a(e(t.id, input.preparationId), e(t.userId, input.userId)),
    columns: { id: true, status: true },
  });

  if (!preparation) return { ok: false, message: "Preparação não encontrada." };
  if (preparation.status === "archived") {
    return { ok: false, message: "Esta preparação está encerrada." };
  }

  /* --- limpeza da entrada -------------------------------------------------- */

  const limpos = input.subjects
    .map((subject) => ({
      name: subject.name.trim().slice(0, 200),
      topics: subject.topics
        .map((topic) => topic.trim().slice(0, 300))
        .filter((topic) => topic.length > 1)
        .slice(0, MAX_TOPICS_PER_SUBJECT),
    }))
    .filter((subject) => subject.name.length > 1 && subject.topics.length > 0)
    .slice(0, MAX_SUBJECTS);

  if (limpos.length === 0) {
    return {
      ok: false,
      message: "Informe pelo menos uma disciplina com um assunto.",
    };
  }

  const catalog = await loadCatalog();
  const fila: Parameters<typeof enqueueUnmapped>[0] = [];

  let totalTopics = 0;
  let mapeados = 0;

  await db.transaction(async (tx) => {
    /**
     * ⚠️ APAGA O QUE EXISTIA ANTES, e é deliberado.
     *
     * Esta tela é usada depois de uma leitura que falhou, mas nada impede o
     * aluno de voltar a ela. Somar ao que já está lá criaria disciplinas
     * duplicadas a cada visita, e ele não teria como perceber até o cronograma
     * ficar com o dobro do conteúdo.
     */
    await tx
      .delete(studyPlanTopics)
      .where(eq(studyPlanTopics.preparationId, input.preparationId));
    await tx
      .delete(studyPlanSubjects)
      .where(eq(studyPlanSubjects.preparationId, input.preparationId));

    for (const [ordemDisciplina, subject] of limpos.entries()) {
      const casamentoDisciplina = matchSubject(subject.name, catalog);

      const [linhaDisciplina] = await tx
        .insert(studyPlanSubjects)
        .values({
          preparationId: input.preparationId,
          canonicalSubjectId: casamentoDisciplina.canonicalId ?? null,
          rawName: subject.name,
          displayName: subject.name,
          normalizedName: normalizeText(subject.name).slice(0, 300),
          sortOrder: ordemDisciplina,
          isActive: true,
        })
        .returning({ id: studyPlanSubjects.id });

      if (!casamentoDisciplina.canonicalId) {
        fila.push({
          rawName: subject.name,
          subjectHint: null,
          userId: input.userId,
          result: casamentoDisciplina,
        });
      }

      for (const [ordemAssunto, topicName] of subject.topics.entries()) {
        const casamento = casamentoDisciplina.canonicalId
          ? matchTopic(topicName, casamentoDisciplina.canonicalId, catalog)
          : null;

        await tx.insert(studyPlanTopics).values({
          preparationId: input.preparationId,
          planSubjectId: linhaDisciplina.id,
          canonicalTopicId: casamento?.canonicalId ?? null,
          rawName: topicName,
          displayName: topicName,
          normalizedName: normalizeText(topicName).slice(0, 300),
          depth: 0,
          sortOrder: ordemAssunto,
          /*
            Sem peso: o edital digitado à mão raramente traz a quantidade de
            questões por tema, e inventar um peso distorceria a priorização do
            Motor 1. Em branco, ele trata todos por igual — que é honesto.
          */
          weight: null,
          weightSource: "default",
          isActive: true,
          mappingStatus: casamento?.canonicalId ? casamento.status : "unmapped",
          mappingConfidence: casamento?.confidence ?? 0,
          mappedAt: casamento?.canonicalId ? new Date() : null,
          origin: "student",
        });

        totalTopics += 1;
        if (casamento?.canonicalId) mapeados += 1;
        else if (casamento) {
          fila.push({
            rawName: topicName,
            subjectHint: subject.name,
            userId: input.userId,
            result: casamento,
          });
        }
      }
    }

    /*
      Vai direto para o diagnóstico: não há o que revisar numa lista que o
      próprio aluno acabou de escrever.
    */
    await tx
      .update(preparations)
      .set({
        status: "diagnosis_pending",
        contentConfirmedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(preparations.id, input.preparationId), eq(preparations.userId, input.userId)),
      );
  });

  await enqueueUnmapped(fila);

  return {
    ok: true,
    subjects: limpos.length,
    topics: totalTopics,
    mappedPercent: totalTopics === 0 ? 0 : Math.round((mapeados / totalTopics) * 100),
  };
}
