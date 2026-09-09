import "server-only";

import { eq } from "drizzle-orm";

import { questionContentHash } from "@/modules/questions/content-hash";
import { taxonomyKey } from "@/modules/taxonomy/normalize";
import { db } from "@/server/db";
import {
  canonicalTopics,
  examBoards,
  questionImportBatches,
  questionOptions,
  questionTopics,
  questions,
} from "@/server/db/schema";
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
  /** Assuntos criados no catálogo por esta importação. */
  createdTopics: Array<{ label: string; count: number }>;
  /** Bancas que a planilha citou e que não existem no cadastro. */
  unknownBoards: Array<{ label: string; count: number }>;
  /**
   * Questões que cobrem mais de um assunto, vindas de uma célula com ";".
   *
   * Pedido da cliente em 09/09/2026. Ela precisa ver o número para saber que o
   * ";" foi entendido, e não engolido.
   */
  multiTopic: number;
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

  /** Questões cujo assunto ainda não existe: o assunto é criado abaixo. */
  const criados: Array<{ questao: ParsedQuestion; subjectId: string }> = [];

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

    /*
      ⚠️ ASSUNTO NOVO É CRIADO, e não descartado.

      Pedido da cliente: "o site não está permitindo salvar questões de assuntos
      novos, somente assuntos que já existam. É importante que ele aceite
      assuntos novos".

      Ela tinha razão e o custo era alto: das 108 questões da VUNESP, 71 foram
      jogadas fora por isso — mais da metade da planilha, em silêncio para quem
      só olhou o número de importadas.

      A disciplina JÁ casou com o catálogo, então o assunto novo nasce dentro
      dela, não solto. E cada criação é RELATADA: encher a taxonomia sem contar
      a ela seria trocar um problema por outro, e o nome vem digitado à mão numa
      planilha.
    */
    criados.push({ questao, subjectId: disciplina.canonicalId });
  }

  /*
    Os assuntos novos entram ANTES da gravação das questões, numa passada só.
    Criar dentro do laço faria uma ida ao banco por questão, e uma planilha com
    setenta linhas do mesmo assunto novo criaria a mesma linha setenta vezes.
  */
  const assuntosCriados = new Map<string, number>();

  if (criados.length > 0 && !input.dryRun) {
    const porChave = new Map<string, { nome: string; subjectId: string }>();

    for (const { questao, subjectId } of criados) {
      porChave.set(`${subjectId}::${taxonomyKey(questao.topicName)}`, {
        nome: questao.topicName,
        subjectId,
      });
    }

    for (const [, novo] of porChave) {
      const chave = taxonomyKey(novo.nome);
      const base = chave.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 180);

      /*
        O sufixo evita colidir com o índice único de `slug` quando duas
        disciplinas têm um assunto de mesmo nome — "Princípios" existe em
        Constitucional e em Administrativo.
      */
      const sufixo = Math.random().toString(36).slice(2, 8);

      const dona = catalogo.subjects.find((d) => d.id === novo.subjectId);

      const [linha] = await db
        .insert(canonicalTopics)
        .values({
          subjectId: novo.subjectId,
          name: novo.nome,
          slug: `${base}-${sufixo}`,
          normalizedName: chave,
          /* Caminho materializado, no mesmo formato do catálogo semeado. */
          path: `${taxonomyKey(dona?.name ?? "")}.${chave}`,
        })
        .returning({ id: canonicalTopics.id });

      for (const { questao, subjectId } of criados) {
        if (
          subjectId === novo.subjectId &&
          taxonomyKey(questao.topicName) === taxonomyKey(novo.nome)
        ) {
          prontas.push({ questao, subjectId, topicId: linha.id });
          conta(assuntosCriados, `${questao.subjectName} › ${questao.topicName}`);
        }
      }
    }
  } else if (criados.length > 0) {
    /* Na conferência nada é criado, mas ela precisa ver o que SERIA criado. */
    for (const { questao } of criados) {
      conta(assuntosCriados, `${questao.subjectName} › ${questao.topicName}`);
    }
  }

  /*
    ⚠️ CONTADO SOBRE `prontas`, e antes de gravar, para que "Conferir sem
    gravar" e "Importar" mostrem O MESMO número. Contar dentro do laço de
    escrita daria um número menor na importação — as questões repetidas não
    passam por lá — e a conferência passaria a prometer diferente do que
    entrega, que é o pior defeito de uma tela de conferência.
  */
  const multiAssunto = prontas.filter((p) => p.questao.topicNames.length > 1).length;

  const base: ImportReport = {
    fileName: input.fileName,
    parsed: resultado.questions.length,
    issues: resultado.issues.map((i) => ({ row: i.row, message: i.message })),
    matched: prontas.length,
    written: 0,
    duplicates: 0,
    remapped: ordenar(remapeadas),
    unmatched: ordenar(foraDoCatalogo),
    createdTopics: ordenar(assuntosCriados),
    unknownBoards: [],
    multiTopic: multiAssunto,
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

  /**
   * ⚠️ A BANCA VEM DA PLANILHA, e não era usada.
   *
   * O parser sempre leu a coluna "Banca"; o gravador a ignorava e carimbava
   * "Autoral" em tudo. A cliente importou 108 questões da VUNESP, o painel
   * disse "36 importadas", e o filtro por VUNESP no Banco mostrava 2 — as duas
   * do seed. As 36 estavam lá, sob a banca errada.
   *
   * O casamento é por nome curto ou por nome completo, sem acento e sem caixa:
   * ela escreve "Vunesp", "VUNESP" e "Fundação Carlos Chagas" na mesma coluna.
   * Banca desconhecida cai em Autoral E É RELATADA — inventar uma banca a
   * partir de um nome digitado encheria o cadastro de duplicatas.
   */
  const bancas = await db
    .select({ id: examBoards.id, slug: examBoards.slug, shortName: examBoards.shortName, name: examBoards.name })
    .from(examBoards);

  const porNome = new Map<string, string>();
  for (const banca of bancas) {
    porNome.set(taxonomyKey(banca.shortName), banca.id);
    porNome.set(taxonomyKey(banca.name), banca.id);
    porNome.set(taxonomyKey(banca.slug), banca.id);
  }

  const autoral = bancas.find((b) => b.slug === "autoral");
  const bancasDesconhecidas = new Map<string, number>();

  let gravadas = 0;
  let repetidas = 0;

  /*
    Cache dos assuntos extras já resolvidos nesta importação.

    Sem ele, uma planilha com setenta questões de "Crase; Concordância" faria
    setenta consultas ao catálogo pelo mesmo nome, e a criação do assunto novo
    aconteceria setenta vezes.
  */
  const cacheDeAssunto = new Map<string, string | null>();

  /**
   * O id do assunto extra, criando no catálogo quando ele ainda não existe.
   *
   * Segue a mesma regra do assunto principal: o do catálogo manda, e o que não
   * existe nasce dentro da disciplina que já casou. Um extra descartado deixaria
   * a questão fora justamente do assunto que a cliente quis marcar.
   */
  async function resolverAssunto(nome: string, subjectId: string): Promise<string | null> {
    const chave = `${subjectId}::${taxonomyKey(nome)}`;
    const emCache = cacheDeAssunto.get(chave);
    if (emCache !== undefined) return emCache;

    const casado = matchTopic(nome, subjectId, catalogo);

    if (casado.canonicalId) {
      cacheDeAssunto.set(chave, casado.canonicalId);
      return casado.canonicalId;
    }

    const normalizado = taxonomyKey(nome);
    const base = normalizado.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 180);
    const dona = catalogo.subjects.find((d) => d.id === subjectId);

    const [criado] = await db
      .insert(canonicalTopics)
      .values({
        subjectId,
        name: nome,
        slug: `${base}-${Math.random().toString(36).slice(2, 8)}`,
        normalizedName: normalizado,
        path: `${taxonomyKey(dona?.name ?? "")}.${normalizado}`,
      })
      .returning({ id: canonicalTopics.id });

    conta(assuntosCriados, `${dona?.name ?? "?"} › ${nome}`);
    cacheDeAssunto.set(chave, criado.id);
    return criado.id;
  }

  for (const { questao, subjectId, topicId } of prontas) {
    const contentHash = questionContentHash(questao.statement);

    const bancaId = porNome.get(taxonomyKey(questao.examBoardName ?? ""));
    if (!bancaId && questao.examBoardName) {
      conta(bancasDesconhecidas, questao.examBoardName);
    }

    const [linha] = await db
      .insert(questions)
      .values({
        examBoardId: bancaId ?? autoral?.id ?? null,
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

    /*
      ⚠️ OS ASSUNTOS DA QUESTÃO, incluindo o principal.

      O principal entra aqui também, e não só em `questions.canonical_topic_id`.
      Sem isso, a busca por assunto precisaria consultar as duas colunas e unir
      os resultados — duas fontes para a mesma pergunta, que um dia divergem.

      Questão sem assunto nenhum (disciplina casou, assunto não) não gera linha:
      a tabela só diz ONDE a questão aparece, e essa não aparece em lugar algum
      até alguém classificá-la no painel.
    */
    const idsDosAssuntos = new Set<string>(topicId ? [topicId] : []);

    for (const nome of questao.topicNames.slice(1)) {
      const extra = await resolverAssunto(nome, subjectId);
      if (extra) idsDosAssuntos.add(extra);
    }

    if (idsDosAssuntos.size > 0) {
      await db.insert(questionTopics).values(
        [...idsDosAssuntos].map((id) => ({
          questionId: linha.id,
          canonicalTopicId: id,
          isPrimary: id === topicId,
        })),
      );
    }

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

  return {
    ...base,
    written: gravadas,
    duplicates: repetidas,
    unknownBoards: ordenar(bancasDesconhecidas),
  };
}

function conta(mapa: Map<string, number>, chave: string): void {
  mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
}

function ordenar(mapa: Map<string, number>): Array<{ label: string; count: number }> {
  return [...mapa]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }));
}
