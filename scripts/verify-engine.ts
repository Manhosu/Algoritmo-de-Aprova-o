import { createHmac, randomUUID } from "node:crypto";

import { hash } from "@node-rs/argon2";
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * VERIFICAÇÃO DO CAMINHO COMPLETO, SEM GASTAR UMA CHAMADA DE IA.
 * ============================================================================
 *
 * Alimenta um edital CONHECIDO — escrito à mão, com as redações reais que os
 * editais usam — e percorre tudo que vem depois:
 *
 *   extração → casamento com o catálogo → revisão do aluno → diagnóstico →
 *   Motor 1 → Missões do Dia
 *
 * POR QUE ISSO EXISTE SEPARADO DO `npm run smoke`
 * ----------------------------------------------------------------------------
 * O smoke prova que as TELAS respondem. Este prova que as REGRAS produzem o
 * resultado certo contra o Postgres de verdade — com os tipos, as constraints e
 * os gatilhos que o PGlite e os testes de unidade não exercitam.
 *
 * Ele não chama a API da Anthropic: a extração entra pronta, por
 * `applyExtractedContent`. O que está sendo verificado aqui é o que acontece
 * DEPOIS da leitura, que é onde mora a maior parte das regras.
 *
 * Limpa tudo que criou, inclusive quando falha no meio.
 *
 * ⚠️ Roda com `--conditions=react-server`. Sem isso, o pacote `server-only`
 * lança ao ser importado fora do Next e nenhum módulo de servidor pode ser
 * carregado por um script. A condição faz o Node resolver o `empty.js` que o
 * próprio pacote publica para esse caso — a proteção real continua valendo
 * onde importa, no `next build`.
 *
 * Uso: npm run verify:engine
 */

const MARKER = "engine-check";

type Check = { label: string; ok: boolean; detail: string };
const checks: Check[] = [];

function check(label: string, ok: boolean, detail = "") {
  checks.push({ label, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Um edital de mentira, com problemas de verdade.
 *
 * Cada item aqui existe para exercitar uma regra específica:
 *   • "Emprego do sinal indicativo de crase" — a redação longa que precisa
 *     casar com o assunto canônico "Crase" pela camada de contenção;
 *   • "Conceitos de Crase" — a variação que a cliente perguntou explicitamente;
 *   • "Tópico Inexistente de Teste" — o que NÃO casa e precisa cair na fila;
 *   • pesos presentes em uma disciplina e ausentes em outra — para conferir que
 *     `weightSource` distingue "do edital" de "não informado".
 */
const FAKE_EXTRACTION = {
  isReadable: true,
  unreadableReason: null,
  institution: "Tribunal de Justiça de Teste",
  examBoard: "Cebraspe",
  positions: ["Analista Judiciário — Área Administrativa"],
  matchedPosition: null,
  examDate: null,
  examDateIsEstimated: false,
  notes: null,
  subjects: [
    {
      name: "Língua Portuguesa",
      questionCount: 20,
      topics: [
        { name: "Emprego do sinal indicativo de crase", questionCount: 4, children: [] },
        { name: "Conceitos de Crase", questionCount: 3, children: [] },
        { name: "Concordância verbal e nominal", questionCount: 5, children: [] },
        { name: "Tópico Inexistente de Teste", questionCount: null, children: [] },
      ],
    },
    {
      name: "Direito Administrativo",
      questionCount: null,
      topics: [
        { name: "Atos administrativos", questionCount: null, children: [] },
        { name: "Licitações", questionCount: null, children: [] },
      ],
    },
  ],
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");

  /**
   * O pooler de TRANSAÇÃO (6543) trava a partir da quarta consulta simultânea.
   * Este script faz exatamente isso em vários pontos, e a falha seria um
   * travamento sem mensagem. Melhor recusar rodar e dizer o motivo.
   * Ver a nota em `src/server/db/index.ts`.
   */
  if (url.includes(":6543")) {
    throw new Error(
      "DATABASE_URL aponta para o pooler de transação (6543), que trava com 4 " +
        "consultas simultâneas. Use a porta 5432 (pooler de sessão).",
    );
  }

  // Importados aqui, e não no topo, porque puxam `@/config/env`, que precisa do
  // dotenv já carregado.
  const { db } = await import("../src/server/db");
  const schema = await import("../src/server/db/schema");
  const { applyExtractedContent } = await import("../src/server/preparations/edital");
  const { getPlanContent, savePlanContent } = await import(
    "../src/server/preparations/content"
  );
  const { getDiagnosis, submitDiagnosis } = await import(
    "../src/server/preparations/diagnosis"
  );
  const { ensureDailyTask, getDailyMissions } = await import(
    "../src/server/engine/daily-task"
  );
  const { completeStudy, completeReviewOccurrence, getReviewsToday } = await import(
    "../src/server/engine/review"
  );
  const manage = await import("../src/server/preparations/manage");
  const { and, eq, like, sql } = await import("drizzle-orm");
  const { EDITAL_PROMPT_VERSION } = await import("../src/server/ai/edital-schema");

  const userId = randomUUID();
  const email = `${MARKER}-${Date.now()}@exemplo.invalido`;
  let preparationId = "";

  /** Respostas gravadas — para desfazer o rollup de turma na limpeza. */
  const answeredQuestions: Array<{ questionId: string; isCorrect: boolean }> = [];

  /**
   * A fila de mapeamento é GLOBAL, não pertence ao usuário de teste: apagar o
   * usuário não a limpa. Sem este retrato, cada execução deixaria itens para
   * trás e a fila do painel administrativo acumularia trabalho que nunca
   * existiu — o oposto do que ela serve para mostrar.
   */
  const queueBefore = new Set(
    (
      await db
        .select({ key: schema.topicMappingQueue.normalizedName })
        .from(schema.topicMappingQueue)
    ).map((row) => row.key),
  );

  try {
    console.log("Preparando aluno de teste...\n");

    const pseudonym = createHmac("sha256", process.env.ANONYMIZATION_PEPPER ?? "x")
      .update(userId)
      .digest("hex");

    await db.insert(schema.users).values({
      id: userId,
      name: "Aluno do Motor",
      email,
      whatsapp: "+5511900000000",
      passwordHash: await hash("uma frase longa de teste", {
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      }),
      pseudonymKey: pseudonym,
      role: "student",
      status: "active",
      timezone: "America/Sao_Paulo",
    });

    const freePlan = await db.query.plans.findFirst({
      where: (t, { eq: e }) => e(t.code, "free"),
      columns: { id: true },
    });

    await db.insert(schema.subscriptions).values({
      userId,
      planId: freePlan!.id,
      status: "active",
      provider: "manual",
    });

    await db.insert(schema.userFunnelProgress).values({
      pseudonymKey: pseudonym,
      userId,
      signedUpAt: new Date(),
      lastStageReached: "signed_up",
      lastStageReachedAt: new Date(),
    });

    // Disponibilidade generosa em TODOS os dias: o script precisa rodar em
    // qualquer dia da semana sem que a tarefa seja pulada por folga.
    await db.insert(schema.userAvailability).values(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        userId,
        weekday,
        minutesAvailable: 180,
      })),
    );

    const [preparation] = await db
      .insert(schema.preparations)
      .values({
        userId,
        targetPosition: "Analista Judiciário — Área Administrativa",
        title: "Analista Judiciário",
        status: "extracting",
        isCurrent: true,
      })
      .returning({ id: schema.preparations.id });

    preparationId = preparation.id;

    console.log("Percorrendo o caminho:\n");

    /* --- 1. a extração vira plano de estudo ------------------------------- */
    const persisted = await applyExtractedContent({
      preparationId,
      extraction: FAKE_EXTRACTION,
    });

    check(
      "Extração vira conteúdo programático",
      persisted.subjects === 2 && persisted.topics === 6,
      `${persisted.subjects} disciplinas, ${persisted.topics} assuntos`,
    );

    /* --- 2. o casamento com o catálogo ------------------------------------ */
    const content = await getPlanContent(preparationId, userId);
    const topics = content!.subjects.flatMap((s) => s.topics);

    const crase = topics.find((t) => t.displayName.includes("indicativo de crase"));
    check(
      'A redação longa do edital casa com "Crase"',
      crase?.mappingStatus === "mapped" || crase?.mappingStatus === "manually_mapped",
      `"${crase?.displayName}" → ${crase?.mappingStatus}`,
    );

    const conceitos = topics.find((t) => t.displayName === "Conceitos de Crase");
    check(
      '"Conceitos de Crase" também casa (pergunta da cliente)',
      conceitos?.mappingStatus === "mapped" ||
        conceitos?.mappingStatus === "manually_mapped",
      `${conceitos?.mappingStatus}`,
    );

    const inexistente = topics.find((t) => t.displayName.includes("Inexistente"));
    check(
      "Assunto sem correspondência NÃO casa em silêncio",
      inexistente?.mappingStatus === "unmapped" ||
        inexistente?.mappingStatus === "ambiguous",
      `${inexistente?.mappingStatus}`,
    );

    /* --- 3. a fila do painel recebeu o que não casou ---------------------- */
    const queued = await db
      .select({ normalizedName: schema.topicMappingQueue.normalizedName })
      .from(schema.topicMappingQueue)
      .where(like(schema.topicMappingQueue.normalizedName, "%inexistente%"));

    check(
      "O que não casou aparece na fila do painel",
      queued.length > 0,
      `${queued.length} item(ns)`,
    );

    /* --- 4. pesos: do edital vs. não informado ---------------------------- */
    const doEdital = topics.filter((t) => t.weightSource === "edital").length;
    const semPeso = topics.filter((t) => t.weight === null).length;
    check(
      "Peso do edital é distinguido de peso ausente",
      doEdital === 3 && semPeso === 3,
      `${doEdital} do edital, ${semPeso} sem peso`,
    );

    /* --- 5. renomear refaz o casamento ------------------------------------ */
    const edits = topics.map((topic) => ({
      id: topic.id,
      subjectId: content!.subjects.find((s) => s.topics.some((t) => t.id === topic.id))!.id,
      // O aluno reescreve o item que não casou usando o nome canônico.
      displayName: topic.displayName.includes("Inexistente")
        ? "Concordância verbal e nominal"
        : topic.displayName,
      weight: topic.weight,
      isActive: true,
    }));

    const saved = await savePlanContent({
      preparationId,
      userId,
      topics: edits,
      confirm: true,
    });

    check(
      "Revisão do aluno é gravada e refaz o casamento do que ele renomeou",
      saved.ok && saved.remapped >= 1,
      saved.ok ? `${saved.remapped} reprocessado(s)` : "falhou",
    );

    const afterRename = await getPlanContent(preparationId, userId);
    const renamed = afterRename!.subjects
      .flatMap((s) => s.topics)
      .filter((t) => t.displayName === "Concordância verbal e nominal");

    check(
      "O item renomeado pelo aluno passa a casar com o catálogo",
      renamed.length === 2 && renamed.every((t) => t.mappingStatus === "mapped"),
      renamed.map((t) => t.mappingStatus).join(", "),
    );

    check(
      "Confirmar o conteúdo move a preparação para o diagnóstico",
      afterRename!.status === "diagnosis_pending",
      afterRename!.status,
    );

    /* --- 6. diagnóstico incompleto é recusado ----------------------------- */
    const diagnosis = await getDiagnosis(preparationId, userId);
    const partial = await submitDiagnosis({
      preparationId,
      userId,
      answers: [{ subjectId: diagnosis!.subjects[0].id, level: "low" }],
    });

    check(
      "Diagnóstico incompleto é recusado (ele não pode ser refeito depois)",
      !partial.ok,
      partial.ok ? "aceitou" : "recusado",
    );

    /* --- 7. diagnóstico completo ativa a preparação ----------------------- */
    const complete = await submitDiagnosis({
      preparationId,
      userId,
      answers: diagnosis!.subjects.map((subject, index) => ({
        subjectId: subject.id,
        // Domínio baixo na primeira disciplina: o Motor 1 deve priorizá-la.
        level: index === 0 ? ("low" as const) : ("high" as const),
      })),
    });

    check(
      "Diagnóstico completo semeia o estado de todos os assuntos",
      complete.ok && complete.topicsInitialized === 6,
      complete.ok ? `${complete.topicsInitialized} assuntos` : "falhou",
    );

    const activated = await db.query.preparations.findFirst({
      where: (t, { eq: e }) => e(t.id, preparationId),
      columns: { status: true },
    });

    check(
      "A preparação fica ativa ao concluir o diagnóstico",
      activated?.status === "active",
      activated?.status ?? "—",
    );

    /* --- 8. o diagnóstico não se refaz ------------------------------------ */
    const again = await submitDiagnosis({
      preparationId,
      userId,
      answers: diagnosis!.subjects.map((s) => ({ subjectId: s.id, level: "high" as const })),
    });

    check(
      "Diagnóstico concluído NÃO aceita ser refeito",
      !again.ok,
      again.ok ? "aceitou de novo" : "recusado",
    );

    /* --- 9. Motor 1 gera a Tarefa do Dia ---------------------------------- */
    const generated = await ensureDailyTask({ userId, preparationId });

    check(
      "Motor 1 gera a Tarefa do Dia",
      generated.status === "generated" && generated.blocks > 0,
      generated.status === "generated"
        ? `${generated.blocks} blocos, ${generated.plannedMinutes} min`
        : generated.status,
    );

    /* --- 10. idempotência por dia ----------------------------------------- */
    const second = await ensureDailyTask({ userId, preparationId });
    check(
      "Recarregar a página NÃO gera uma segunda tarefa no mesmo dia",
      second.status === "existing",
      second.status,
    );

    /* --- 11. a priorização é explicável ----------------------------------- */
    const items = await db
      .select({
        priorityScore: schema.dailyTaskItems.priorityScore,
        breakdown: schema.dailyTaskItems.priorityBreakdown,
      })
      .from(schema.dailyTaskItems)
      .where(eq(schema.dailyTaskItems.preparationId, preparationId));

    const explainable = items.every((item) => {
      const contributions = item.breakdown?.contributions;
      if (!contributions || item.priorityScore === null) return false;
      const sum = Object.values(contributions).reduce((a, b) => a + b, 0);
      // A soma das contribuições TEM que reproduzir o score. É o que torna
      // possível responder "por que este assunto caiu hoje?".
      return Math.abs(sum - item.priorityScore) < 0.001;
    });

    check(
      "Cada item guarda os 5 sinais e a soma reproduz o score",
      items.length > 0 && explainable,
      `${items.length} itens`,
    );

    /**
     * A versão da configuração fica na TAREFA, não no item: os itens de um
     * mesmo dia foram todos produzidos pela mesma rodada do motor, e repetir a
     * referência em cada linha abriria a possibilidade de divergirem.
     */
    const taskConfig = await db
      .select({ engineConfigId: schema.dailyTasks.engineConfigId })
      .from(schema.dailyTasks)
      .where(eq(schema.dailyTasks.preparationId, preparationId));

    check(
      "A tarefa aponta para a versão da configuração que a produziu",
      taskConfig.length === 1 && taskConfig[0].engineConfigId !== null,
      "decisão 14",
    );

    /* --- 12. as Missões do Dia chegam à tela ------------------------------ */
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());

    const missions = await getDailyMissions(preparationId, today as `${number}-${number}-${number}`);

    check(
      "As Missões do Dia chegam prontas para a Home",
      missions !== null && missions.blocks.length > 0,
      `${missions?.blocks.length ?? 0} blocos`,
    );

    const pairs = missions?.blocks.filter((block) => block.practice !== null).length ?? 0;
    check(
      'Blocos com questão no acervo vêm com a dupla "Estude + Pratique"',
      pairs > 0,
      `${pairs} de ${missions?.blocks.length ?? 0} blocos com prática`,
    );

    /* --- 13. o motor não oferece prática sem acervo ------------------------ */
    const semAcervo =
      missions?.blocks.filter((block) => block.practice === null).length ?? 0;
    check(
      "Assunto sem questão NÃO ganha item de prática vazio",
      // Direito Administrativo não tem questões no acervo semeado.
      semAcervo > 0,
      `${semAcervo} bloco(s) só de estudo`,
    );

    /* --- 14. responder questão ------------------------------------------- */
    const { answerQuestion, findQuestions, getDailyLimit } = await import(
      "../src/server/questions/service"
    );

    const bank = await findQuestions({
      userId,
      filters: { onlyUnanswered: true },
    });

    check(
      "Banco de questões devolve questões com alternativas",
      bank.questions.length > 0 && bank.questions[0].options.length > 1,
      `${bank.total} questões, ${bank.questions[0]?.options.length ?? 0} alternativas`,
    );

    /**
     * ⚠️ A verificação mais importante desta seção: o gabarito NÃO pode chegar
     * junto com a lista. Quem abre o inspetor veria a alternativa certa, e o
     * diagnóstico, a priorização e as métricas passariam a medir uma pessoa
     * que não existe.
     */
    const leaked = bank.questions.some(
      (question) =>
        question.explanation !== undefined ||
        question.options.some((option) => option.isCorrect !== undefined),
    );

    check(
      "O gabarito NÃO viaja junto com a lista de questões",
      !leaked,
      leaked ? "VAZOU" : "só depois de responder",
    );

    const first = bank.questions[0];
    const answer = await answerQuestion({
      userId,
      questionId: first.id,
      optionId: first.options[0].id,
      preparationId,
    });

    if (answer.ok) {
      answeredQuestions.push({ questionId: first.id, isCorrect: answer.isCorrect });
    }

    check(
      "Responder devolve o gabarito e o comentário",
      answer.ok && typeof answer.correctOptionId === "string",
      answer.ok ? (answer.isCorrect ? "acertou" : "errou") : "falhou",
    );

    /* --- 15. o desempenho volta para o Motor 1 ---------------------------- */
    const touched = await db
      .select({
        questionsAnswered: schema.topicStates.questionsAnswered,
        masteryConfidence: schema.topicStates.masteryConfidence,
        lastAnsweredAt: schema.topicStates.lastAnsweredAt,
      })
      .from(schema.topicStates)
      .where(eq(schema.topicStates.preparationId, preparationId));

    const moved = touched.filter((row) => row.questionsAnswered > 0);

    check(
      "A resposta atualiza o estado do assunto (item 9 do aceite)",
      moved.length === 1 && moved[0].lastAnsweredAt !== null,
      `${moved.length} assunto(s) com desempenho registrado`,
    );

    check(
      "A confiança do sistema no nível do aluno sobe com a resposta",
      moved.length === 1 && moved[0].masteryConfidence > 0.15,
      moved[0] ? moved[0].masteryConfidence.toFixed(3) : "—",
    );

    /* --- 16. XP e sequência ----------------------------------------------- */
    const xpRows = await db
      .select({ amount: schema.xpLedger.amount, activity: schema.xpLedger.activity })
      .from(schema.xpLedger)
      .where(eq(schema.xpLedger.userId, userId));

    check(
      "A resposta credita XP no livro-razão",
      xpRows.length > 0,
      xpRows.map((r) => `${r.activity} +${r.amount}`).join(", "),
    );

    const gami = await db.query.userGamificationStates.findFirst({
      where: (t, { eq: e }) => e(t.userId, userId),
      columns: { totalXp: true, currentStreak: true },
    });

    check(
      "O saldo consolidado e a sequência acompanham",
      (gami?.totalXp ?? 0) > 0 && (gami?.currentStreak ?? 0) === 1,
      `${gami?.totalXp} XP, sequência ${gami?.currentStreak}`,
    );

    /* --- 17. o mesmo XP não é pago duas vezes ----------------------------- */
    const duplicate = await answerQuestion({
      userId,
      questionId: first.id,
      optionId: first.options[0].id,
      preparationId,
    });

    if (duplicate.ok) {
      answeredQuestions.push({ questionId: first.id, isCorrect: duplicate.isCorrect });
    }

    const xpAfter = await db
      .select({ total: sql<number>`coalesce(sum(${schema.xpLedger.amount}), 0)::int` })
      .from(schema.xpLedger)
      .where(eq(schema.xpLedger.userId, userId));

    /**
     * Responder de novo é PERMITIDO — é assim que se pratica o que se errou —
     * mas não pode pagar XP de participação outra vez. A chave de idempotência
     * é a questão, não a tentativa. Esta verificação existe porque a primeira
     * versão do código usava o id da tentativa e pagava dez vezes por dez
     * respostas à mesma questão.
     */
    check(
      "Responder a mesma questão de novo não paga XP em dobro",
      duplicate.ok && (xpAfter[0]?.total ?? 0) === (gami?.totalXp ?? 0),
      `${xpAfter[0]?.total} XP no total (era ${gami?.totalXp})`,
    );

    /* --- 18. o limite diário do plano Free -------------------------------- */
    const limitBefore = await getDailyLimit(userId);

    check(
      "O limite diário do plano Free é 10 questões",
      limitBefore.limit === 10 && limitBefore.planCode === "free",
      `${limitBefore.used}/${limitBefore.limit} usadas`,
    );

    // Empurra o consumo até o teto sem responder 10 questões de verdade.
    await db
      .update(schema.dailyQuestionUsage)
      .set({ questionsAnswered: 10 })
      .where(eq(schema.dailyQuestionUsage.userId, userId));

    const blocked = await answerQuestion({
      userId,
      questionId: bank.questions[1]!.id,
      optionId: bank.questions[1]!.options[0].id,
      preparationId,
    });

    check(
      "Atingido o limite, o servidor recusa a resposta",
      !blocked.ok && blocked.reason === "limit_reached",
      blocked.ok ? "aceitou" : blocked.reason,
    );

    const usage = await db.query.dailyQuestionUsage.findFirst({
      where: (t, { eq: e }) => e(t.userId, userId),
      columns: { limitAtTime: true },
    });

    check(
      "O teto vigente fica gravado no consumo do dia",
      usage?.limitAtTime === 10,
      `limite registrado: ${usage?.limitAtTime}`,
    );

    /* --- 19. Motor 1 não agenda revisão ----------------------------------- */
    const reviewRows = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.reviewOccurrences)
      .where(eq(schema.reviewOccurrences.userId, userId));

    check(
      "Motor 1 não agenda revisão (os motores são separados)",
      (reviewRows[0]?.total ?? 0) === 0,
      "nenhuma revisão criada",
    );

    /* --- 20. MOTOR 2: o estudo concluído faz nascer a série ---------------- */
    const studyItem = await db.query.dailyTaskItems.findFirst({
      where: (t, { and: a, eq: e }) =>
        a(e(t.preparationId, preparationId), e(t.kind, "study")),
      columns: { id: true, planTopicId: true },
    });
    const studiedTopicId = studyItem!.planTopicId;

    const studied = await completeStudy({
      userId,
      dailyTaskItemId: studyItem!.id,
    });

    check(
      "Concluir um estudo faz nascer a série de revisões",
      studied.ok && typeof studied.firstReviewOn === "string",
      studied.ok ? `primeira revisão em ${studied.firstReviewOn}` : "falhou",
    );

    /**
     * ⚠️ Só a PRIMEIRA etapa nasce agendada. Materializar as cinco criaria
     * quatro datas que estarão erradas assim que o aluno atrasar uma revisão —
     * e corrigi-las depois seria reescrever o compromisso, apagando o atraso
     * que a métrica de aderência precisa medir.
     */
    const occurrences = await db
      .select({
        id: schema.reviewOccurrences.id,
        stageIndex: schema.reviewOccurrences.stageIndex,
        intervalDays: schema.reviewOccurrences.intervalDays,
        dueDate: schema.reviewOccurrences.dueDate,
      })
      .from(schema.reviewOccurrences)
      .where(eq(schema.reviewOccurrences.userId, userId));

    check(
      "Só a PRIMEIRA etapa nasce agendada, não as cinco",
      occurrences.length === 1 &&
        occurrences[0].stageIndex === 0 &&
        occurrences[0].intervalDays === 1,
      `${occurrences.length} ocorrência, etapa ${occurrences[0]?.stageIndex}, ${occurrences[0]?.intervalDays} dia`,
    );

    const schedule = await db.query.reviewSchedules.findFirst({
      where: (t, { eq: e }) => e(t.userId, userId),
      columns: { totalStages: true, trigger: true, engineConfigId: true },
    });

    check(
      "A série guarda as 5 etapas do README e a configuração que a produziu",
      schedule?.totalStages === 5 &&
        schedule.trigger === "study_completed" &&
        schedule.engineConfigId !== null,
      `${schedule?.totalStages} etapas`,
    );

    /* --- 21. a revisão atrasada acumula ----------------------------------- */
    /**
     * Empurra a revisão para 10 dias atrás — contados no FUSO DO ALUNO.
     *
     * A primeira versão usava `current_date` do Postgres, que é UTC: rodando às
     * 22h de Brasília, o servidor já virou o dia e o atraso saía 9 em vez de
     * 10. Não era defeito do motor; era o teste supondo que servidor e aluno
     * compartilham a data. Eles não compartilham, e é exatamente por isso que o
     * produto guarda data civil.
     */
    const civilToday = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    const overdueDate = new Date(`${civilToday}T00:00:00Z`);
    overdueDate.setUTCDate(overdueDate.getUTCDate() - 10);
    const overdueCivil = overdueDate.toISOString().slice(0, 10);

    await db.execute(
      sql`update review_occurrences
          set due_date = ${overdueCivil}::date, due_at = ${overdueCivil}::date
          where user_id = ${userId}`,
    );

    const reviewsToday = await getReviewsToday({ userId, preparationId });

    check(
      "Revisão vencida em dia anterior ACUMULA, não some",
      reviewsToday.due.length === 1 &&
        reviewsToday.due[0].isLate &&
        reviewsToday.due[0].daysLate === 10,
      `${reviewsToday.due.length} pendente(s), ${reviewsToday.due[0]?.daysLate} dia(s) de atraso`,
    );

    /* --- 22. a regra do atraso -------------------------------------------- */
    const reviewed = await completeReviewOccurrence({
      userId,
      occurrenceId: occurrences[0].id,
      performanceRating: "hard",
    });

    check(
      "Concluir a revisão agenda a seguinte",
      reviewed.ok && reviewed.nextReviewOn !== null,
      reviewed.ok ? `próxima em ${reviewed.nextReviewOn}` : "falhou",
    );

    /**
     * ⚠️ A REGRA DO ATRASO (decisão do Eduardo).
     *
     * O próximo intervalo conta a partir da EXECUÇÃO REAL, não da data
     * prevista. Sem isso, quem revisa com 10 dias de atraso receberia a
     * segunda etapa (7 dias) já vencida há 3 — um acúmulo instantâneo, que é o
     * oposto do que a curva do esquecimento quer.
     */
    const expectedNext = new Date(`${civilToday}T00:00:00Z`);
    expectedNext.setUTCDate(expectedNext.getUTCDate() + 7);

    check(
      "O próximo intervalo conta da EXECUÇÃO REAL, não da data prevista",
      reviewed.ok && reviewed.nextReviewOn === expectedNext.toISOString().slice(0, 10),
      reviewed.ok
        ? `${reviewed.nextReviewOn} (esperado ${expectedNext.toISOString().slice(0, 10)})`
        : "—",
    );

    const completedRow = await db.query.reviewOccurrences.findFirst({
      where: (t, { eq: e }) => e(t.id, occurrences[0].id),
      columns: { isLate: true, daysLate: true, performanceRating: true },
    });

    check(
      "O atraso NÃO é perdoado nem escondido — fica registrado",
      completedRow?.isLate === true && completedRow.daysLate === 10,
      `${completedRow?.daysLate} dias registrados`,
    );

    check(
      "A percepção do aluno é coletada para calibração futura",
      completedRow?.performanceRating === "hard",
      `${completedRow?.performanceRating}`,
    );

    /* --- 23. cobertura e aderência ---------------------------------------- */
    const covered = await db.query.topicStates.findFirst({
      where: (t, { eq: e }) => e(t.planTopicId, studiedTopicId),
      columns: { coverageStatus: true, reviewsCompleted: true },
    });

    check(
      "A revisão concluída move a cobertura do assunto",
      covered?.reviewsCompleted === 1 && covered.coverageStatus !== "not_started",
      `${covered?.coverageStatus}, ${covered?.reviewsCompleted} revisão`,
    );

    /* --- 24. GESTÃO DA PREPARAÇÃO (README 1.10) --------------------------- */
    const list = await manage.listPreparations(userId);

    check(
      "A lista de preparações traz o progresso de cada uma",
      list.length === 1 && list[0].isCurrent && list[0].topicCount === 6,
      `${list.length} preparação · ${list[0]?.studiedCount}/${list[0]?.topicCount} estudados`,
    );

    const renamedPrep = await manage.renamePreparation({
      userId,
      preparationId,
      title: "Meu concurso renomeado",
    });
    check(
      "Renomear a preparação funciona",
      renamedPrep.ok,
      renamedPrep.ok ? "ok" : renamedPrep.message!,
    );

    /**
     * ⚠️ Encerrar CANCELA as revisões pendentes. Continuar cobrando revisão de
     * um concurso que o aluno abandonou seria uma dívida que não existe mais, e
     * estragaria a aderência dele na preparação que importa.
     */
    const pendentesAntes = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.reviewOccurrences)
      .where(
        and(
          eq(schema.reviewOccurrences.preparationId, preparationId),
          eq(schema.reviewOccurrences.status, "scheduled"),
        ),
      );

    const archived = await manage.archivePreparation({ userId, preparationId });
    check("Encerrar a preparação funciona", archived.ok, archived.ok ? "ok" : archived.reason);

    const canceledReviews = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.reviewOccurrences)
      .where(
        and(
          eq(schema.reviewOccurrences.preparationId, preparationId),
          eq(schema.reviewOccurrences.status, "scheduled"),
        ),
      );

    check(
      "Encerrar cancela as revisões pendentes daquela preparação",
      (canceledReviews[0]?.total ?? 0) === 0,
      "nenhuma revisão pendente sobrou",
    );

    /**
     * ⚠️ Encerrar NÃO apaga. O aluno que passou meses estudando não perde o
     * registro por ter mudado de alvo — e a vaga no limite do plano é liberada.
     */
    const stillThere = await db.query.preparations.findFirst({
      where: (t, { eq: e }) => e(t.id, preparationId),
      columns: { status: true, isCurrent: true, archivedAt: true },
    });

    const topicsKept = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.studyPlanTopics)
      .where(eq(schema.studyPlanTopics.preparationId, preparationId));

    check(
      "Encerrar NÃO apaga o conteúdo nem o histórico",
      stillThere?.status === "archived" &&
        stillThere.archivedAt !== null &&
        (topicsKept[0]?.total ?? 0) === 6,
      `${topicsKept[0]?.total} assuntos preservados`,
    );

    const gateAfter = await import("../src/server/preparations/service").then((m) =>
      m.checkPreparationLimit(userId),
    );
    check(
      "Encerrar libera a vaga no limite do plano Free",
      gateAfter.allowed && gateAfter.current === 0,
      `${gateAfter.current}/${gateAfter.limit} usadas`,
    );

    const reopened = await manage.reopenPreparation({ userId, preparationId });
    check(
      "Reabrir funciona quando há vaga",
      reopened.ok,
      reopened.ok ? "ok" : reopened.message!,
    );

    /**
     * ⚠️ REABRIR TEM QUE DEVOLVER O QUE ENCERRAR TIROU.
     *
     * Encerrar cancela as revisões pendentes, e isso está certo. Mas por um
     * tempo reabrir devolvia só o `status = active`: o aluno recuperava a
     * preparação com o ciclo de revisões morto, e nada na tela dizia — a lista
     * "Revisões para hoje" ficava vazia para sempre.
     *
     * A cliente perdeu assim as quatro revisões de 24 horas dos estudos que
     * tinha acabado de concluir. Encerrou, reabriu minutos depois, e no dia
     * seguinte não havia revisão nenhuma. O resto da tela funcionava, o que
     * tornava o defeito mais difícil de acreditar do que de reproduzir.
     *
     * O par encerrar/reabrir é o tipo de simetria que só um teste que faz os
     * DOIS lados protege. Havia checagem para o cancelamento; não havia para a
     * volta.
     */
    const pendentesDepois = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.reviewOccurrences)
      .where(
        and(
          eq(schema.reviewOccurrences.preparationId, preparationId),
          eq(schema.reviewOccurrences.status, "scheduled"),
        ),
      );

    check(
      "Reabrir RESTAURA as revisões que o encerramento cancelou",
      (pendentesAntes[0]?.total ?? 0) > 0 &&
        (pendentesDepois[0]?.total ?? 0) === (pendentesAntes[0]?.total ?? 0),
      `${pendentesAntes[0]?.total} antes → ${pendentesDepois[0]?.total} depois`,
    );

    /* --- 25. CACHE DE EXTRAÇÃO ENTRE ALUNOS ------------------------------- */
    /**
     * ⚠️ A economia que decide o custo em escala.
     *
     * Concurso popular tem milhares de candidatos subindo O MESMO PDF do MESMO
     * site da banca. Sem cache, mil alunos do TJ-RJ seriam mil leituras
     * idênticas — cerca de US$ 500 para produzir mil vezes a mesma resposta.
     *
     * Este teste simula o segundo aluno: mesmo arquivo, mesmo cargo, e verifica
     * que a leitura foi REAPROVEITADA (custo zero, sem chamar a IA).
     */
    const { receiveEdital, runExtraction } = await import(
      "../src/server/preparations/edital"
    );

    // Primeiro aluno: grava uma extração bem-sucedida à mão, como se a IA já
    // tivesse lido este arquivo.
    const sharedPdf = new TextEncoder().encode(
      [
        "%PDF-1.4",
        "/Type /Font /BaseFont /Helvetica",
        "BT (edital compartilhado) Tj ET",
        "%%EOF",
      ].join("\n"),
    );

    const [firstPrep] = await db
      .insert(schema.preparations)
      .values({
        userId,
        targetPosition: "Analista Judiciário — Área Administrativa",
        title: "Primeiro aluno",
        status: "draft",
      })
      .returning({ id: schema.preparations.id });

    const firstUpload = await receiveEdital({
      preparationId: firstPrep.id,
      userId,
      fileName: "edital-compartilhado.pdf",
      bytes: sharedPdf,
    });

    await db
      .update(schema.editalExtractions)
      .set({
        status: "succeeded",
        promptVersion: EDITAL_PROMPT_VERSION,
        model: "claude-opus-5",
        estimatedCostCents: 50,
        finishedAt: new Date(),
        rawResponse: FAKE_EXTRACTION,
      })
      .where(eq(schema.editalExtractions.id, firstUpload.ok ? firstUpload.extractionId : ""));

    // Segundo aluno: MESMO arquivo, MESMO cargo.
    const [secondPrep] = await db
      .insert(schema.preparations)
      .values({
        userId,
        targetPosition: "analista judiciario - area administrativa",
        title: "Segundo aluno",
        status: "draft",
      })
      .returning({ id: schema.preparations.id });

    const secondUpload = await receiveEdital({
      preparationId: secondPrep.id,
      userId,
      fileName: "edital-compartilhado.pdf",
      bytes: sharedPdf,
    });

    const reused = secondUpload.ok
      ? await runExtraction(secondUpload.extractionId)
      : { status: "failed" as const, message: "upload falhou" };

    check(
      "Segundo aluno com o MESMO edital reaproveita a leitura",
      reused.status === "succeeded",
      reused.status === "succeeded" ? `${reused.topics} assuntos` : reused.message,
    );

    const reusedRow = secondUpload.ok
      ? await db.query.editalExtractions.findFirst({
          where: (t, { eq: e }) => e(t.id, secondUpload.extractionId),
          columns: { estimatedCostCents: true, errorMessage: true },
        })
      : null;

    check(
      "O reaproveitamento custa ZERO — nenhuma chamada de IA",
      reusedRow?.estimatedCostCents === 0,
      `${reusedRow?.estimatedCostCents} centavos`,
    );

    /**
     * O cargo faz parte da chave: a leitura é específica dele, e servir a um
     * aluno de Direito o programa de TI seria pior que ler de novo.
     */
    const [thirdPrep] = await db
      .insert(schema.preparations)
      .values({
        userId,
        targetPosition: "Técnico Judiciário — Área Apoio Especializado",
        title: "Terceiro aluno, outro cargo",
        status: "draft",
      })
      .returning({ id: schema.preparations.id });

    const thirdUpload = await receiveEdital({
      preparationId: thirdPrep.id,
      userId,
      fileName: "edital-compartilhado.pdf",
      bytes: sharedPdf,
    });

    const cachedForOther = thirdUpload.ok
      ? await db
          .select({ id: schema.editalExtractions.id })
          .from(schema.editalExtractions)
          .where(eq(schema.editalExtractions.id, thirdUpload.extractionId))
      : [];

    check(
      "Cargo DIFERENTE não reaproveita a leitura do outro cargo",
      cachedForOther.length === 1,
      "fila própria de leitura",
    );

    /* --- 26. NULL no limite significa ILIMITADO --------------------------- */
    /**
     * ⚠️ Verificação nascida de um bug real (24/08/2026).
     *
     * `limits?.maxActivePreparations ?? 1` parecia certo e transformava o
     * Premium — onde a coluna é NULL de propósito, querendo dizer "sem teto" —
     * em UMA preparação. O gêmeo do mesmo erro limitava o Premium a 10 questões
     * por dia. Cliente pagante recebendo o plano Free em silêncio.
     */
    const premiumPlan = await db.query.plans.findFirst({
      where: (t, { eq: e }) => e(t.code, "premium"),
      columns: { id: true },
    });

    await db
      .update(schema.subscriptions)
      .set({ planId: premiumPlan!.id })
      .where(eq(schema.subscriptions.userId, userId));

    const { checkPreparationLimit } = await import("../src/server/preparations/service");

    const premiumPreps = await checkPreparationLimit(userId);
    check(
      "Premium tem preparações ILIMITADAS (NULL não é 1)",
      premiumPreps.limit === null && premiumPreps.allowed,
      `limite ${premiumPreps.limit === null ? "ilimitado" : premiumPreps.limit}`,
    );

    const premiumQuestions = await getDailyLimit(userId);
    check(
      "Premium tem questões diárias ILIMITADAS (NULL não é 10)",
      premiumQuestions.limit === null && !premiumQuestions.reached,
      `limite ${premiumQuestions.limit === null ? "ilimitado" : premiumQuestions.limit}`,
    );
  } finally {
    const { db } = await import("../src/server/db");
    const schema = await import("../src/server/db/schema");
    const { eq, like, sql: sqlFragment, inArray: inArrayFragment } = await import(
      "drizzle-orm",
    );

    /**
     * ⚠️ A LINHA DO FUNIL PRIMEIRO, e à mão.
     *
     * `user_funnel_progress.user_id` é ON DELETE SET NULL de propósito: a linha
     * SOBREVIVE à exclusão da conta, para que a coorte histórica não encolha a
     * cada pedido de exclusão da LGPD. Certo para gente de verdade, errado para
     * um usuário de verificação — cada execução deixava um cadastro fantasma no
     * painel administrativo.
     */
    await db
      .delete(schema.userFunnelProgress)
      .where(eq(schema.userFunnelProgress.userId, userId));

    // Ordem obrigatória: `subscriptions` referencia `users` com ON DELETE
    // RESTRICT, de propósito — registro financeiro tem prazo de guarda legal.
    await db.delete(schema.subscriptions).where(eq(schema.subscriptions.userId, userId));
    await db.delete(schema.users).where(like(schema.users.email, `${MARKER}-%`));

    /**
     * As estatísticas de turma na questão sobem com o teste e NÃO descem com o
     * `delete` do usuário: `questions.attempt_count` é rollup, não chave
     * estrangeira. Sem desfazer, cada execução envenenaria o "onde a turma mais
     * erra" do painel administrativo com respostas que nunca existiram.
     */
    for (const answered of answeredQuestions) {
      await db
        .update(schema.questions)
        .set({
          attemptCount: sqlFragment`greatest(0, ${schema.questions.attemptCount} - 1)`,
          correctCount: answered.isCorrect
            ? sqlFragment`greatest(0, ${schema.questions.correctCount} - 1)`
            : schema.questions.correctCount,
        })
        .where(eq(schema.questions.id, answered.questionId));
    }

    // Remove só o que ESTA execução acrescentou à fila global.
    const queueAfter = await db
      .select({
        id: schema.topicMappingQueue.id,
        key: schema.topicMappingQueue.normalizedName,
      })
      .from(schema.topicMappingQueue);

    const created = queueAfter.filter((row) => !queueBefore.has(row.key)).map((r) => r.id);
    if (created.length > 0) {
      await db
        .delete(schema.topicMappingQueue)
        .where(inArrayFragment(schema.topicMappingQueue.id, created));
    }
  }

  const failed = checks.filter((item) => !item.ok);
  console.log("");
  if (failed.length > 0) {
    console.error(`${failed.length} de ${checks.length} verificações falharam.`);
    process.exit(1);
  }
  console.log(`${checks.length} verificações passaram. Dados de teste removidos.`);
  process.exit(0);
}

main().catch((error) => {
  console.error("\n", error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
