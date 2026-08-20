import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  ENGINE_CONFIG_DEFAULTS,
  parseEngineConfig,
  type EngineConfigKind,
} from "@/modules/engine-config/schemas";
import { slugify, taxonomyKey } from "@/modules/taxonomy/normalize";
import { parseQuestionSheet, type ParsedQuestion } from "@/server/import/questions";

import * as schema from "../schema";
import {
  AUTHORIAL_BOARD_NAME,
  AUTHORIAL_BOARD_SLUG,
  SEED_EXAM_BOARDS,
  SEED_SUBJECTS,
  type SeedTopic,
} from "./catalog-data";
import { buildExampleQuestions } from "./example-questions";
import { PRIVACY_POLICY_DRAFT } from "./legal-data";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Popula o banco com os dados que a aplicação precisa para existir.
 *
 * É IDEMPOTENTE: rodar duas vezes não duplica nada. Cada bloco procura pela
 * chave natural antes de inserir. Isso importa porque o seed vai ser rodado de
 * novo toda vez que o catálogo crescer, e um seed que só funciona em banco vazio
 * é um seed que ninguém usa depois da primeira semana.
 *
 * O que ele NÃO faz: criar usuários, preparações ou qualquer dado de aluno.
 * Dados de teste desse tipo entram por outro caminho, para nunca haver risco de
 * um usuário fictício aparecer em produção.
 */

const log = {
  section: (title: string) => console.log(`\n${title}`),
  item: (text: string) => console.log(`   ${text}`),
  warn: (text: string) => console.log(`   ⚠ ${text}`),
};

/**
 * O seed em si, separado da conexão.
 *
 * Recebe o banco por parâmetro em vez de abrir a conexão sozinho, para poder ser
 * executado contra um Postgres efêmero na verificação (`npm run db:verify`) —
 * do contrário só saberíamos que o seed compila, nunca que ele roda.
 */
export async function runSeed(db: Db) {
  await seedPlans(db);
  await seedLevels(db);
  await seedEngineConfigs(db);
  await seedLegalDocuments(db);
  const catalog = await seedCatalog(db);
  await seedQuestions(db, catalog);
  await seedMissions(db);
}

async function main() {
  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL não definida. Copie o .env.example para .env.local antes de rodar o seed.",
    );
  }

  const connection = postgres(url, { max: 1, prepare: false });
  const db = drizzle(connection, { schema, casing: "snake_case" });

  console.log("Populando o banco...");
  await runSeed(db);
  console.log("\nPronto.\n");

  await connection.end();
}

export type Db = ReturnType<typeof drizzle<typeof schema>>;
type Catalog = {
  boardsBySlug: Map<string, string>;
  subjectsByKey: Map<string, string>;
  topicsByKey: Map<string, string>;
};

/* ========================================================================== *
 * PLANOS (README 2.5)
 * ========================================================================== */

async function seedPlans(db: Db) {
  log.section("Planos");

  const definitions = [
    {
      code: "free",
      name: "Free",
      tagline: "Comece agora, sem cartão",
      sortOrder: 0,
      isFeatured: false,
      prices: [] as Array<{ period: "monthly" | "annual"; cents: number; discount?: number }>,
      limits: {
        dailyQuestionLimit: 10,
        maxActivePreparations: 1,
        monthlyEditalUploadLimit: 2,
      },
      contentAccess: "limited" as const,
    },
    {
      code: "intermediate",
      name: "Intermediário",
      tagline: "Mais questões por dia e acervo ampliado",
      sortOrder: 1,
      isFeatured: false,
      prices: [
        { period: "monthly" as const, cents: 6990 },
        { period: "annual" as const, cents: 41940, discount: 50 },
      ],
      limits: {
        dailyQuestionLimit: 20,
        maxActivePreparations: 1,
        monthlyEditalUploadLimit: 5,
      },
      contentAccess: "extended" as const,
    },
    {
      code: "premium",
      name: "Premium",
      tagline: "Questões ilimitadas e mais de uma preparação",
      sortOrder: 2,
      isFeatured: true,
      prices: [
        { period: "monthly" as const, cents: 8990 },
        { period: "annual" as const, cents: 53940, discount: 50 },
      ],
      limits: {
        // NULL = ilimitado. Nunca 0, nunca número mágico.
        dailyQuestionLimit: null,
        maxActivePreparations: null,
        monthlyEditalUploadLimit: null,
      },
      contentAccess: "full" as const,
    },
  ];

  const contentTypes = [
    "flashcard_deck",
    "mind_map",
    "video",
    "study_text",
    "pdf",
    "audio",
  ] as const;

  for (const def of definitions) {
    const [plan] = await db
      .insert(schema.plans)
      .values({
        code: def.code,
        name: def.name,
        tagline: def.tagline,
        sortOrder: def.sortOrder,
        isFeatured: def.isFeatured,
      })
      .onConflictDoUpdate({
        target: schema.plans.code,
        set: { name: def.name, tagline: def.tagline, sortOrder: def.sortOrder },
      })
      .returning({ id: schema.plans.id });

    await db
      .insert(schema.planLimits)
      .values({ planId: plan.id, ...def.limits })
      .onConflictDoUpdate({ target: schema.planLimits.planId, set: def.limits });

    for (const price of def.prices) {
      const existing = await db.query.planPrices.findFirst({
        where: (t, { and, eq: e }) =>
          and(e(t.planId, plan.id), e(t.billingPeriod, price.period)),
      });
      if (!existing) {
        await db.insert(schema.planPrices).values({
          planId: plan.id,
          billingPeriod: price.period,
          amountCents: price.cents,
          discountPercent: price.discount,
        });
      }
    }

    for (const contentType of contentTypes) {
      await db
        .insert(schema.planContentAccess)
        .values({ planId: plan.id, contentType, accessLevel: def.contentAccess })
        .onConflictDoUpdate({
          target: [schema.planContentAccess.planId, schema.planContentAccess.contentType],
          set: { accessLevel: def.contentAccess },
        });
    }

    const limit = def.limits.dailyQuestionLimit;
    const preparations = def.limits.maxActivePreparations;
    log.item(
      `${def.name.padEnd(14)} ${limit === null ? "questões ilimitadas" : `${limit} questões/dia`} · ` +
        `${preparations === null ? "preparações ilimitadas" : `${preparations} preparação`}`,
    );
  }
}

/* ========================================================================== *
 * NÍVEIS (README 2.3)
 * ========================================================================== */

async function seedLevels(db: Db) {
  log.section("Níveis de gamificação");

  const levels = [
    { levelNumber: 1, code: "iniciante", name: "Iniciante", emoji: "🌱", minXp: 0, maxXp: 999, colorToken: "level-1" },
    { levelNumber: 2, code: "competitivo", name: "Competitivo", emoji: "🎯", minXp: 1000, maxXp: 2999, colorToken: "level-2" },
    { levelNumber: 3, code: "estrategista", name: "Estrategista", emoji: "🧠", minXp: 3000, maxXp: 5999, colorToken: "level-3" },
    { levelNumber: 4, code: "elite", name: "Elite", emoji: "🔥", minXp: 6000, maxXp: 9999, colorToken: "level-4" },
    // maxXp nulo é o que faz "10.000+" funcionar sem número mágico.
    { levelNumber: 5, code: "implacavel", name: "Implacável", emoji: "👑", minXp: 10000, maxXp: null, colorToken: "level-5" },
  ];

  for (const level of levels) {
    await db
      .insert(schema.levels)
      .values(level)
      .onConflictDoUpdate({
        target: schema.levels.levelNumber,
        set: { name: level.name, emoji: level.emoji, minXp: level.minXp, maxXp: level.maxXp },
      });
  }

  log.item(
    levels.map((l) => `${l.emoji} ${l.name}`).join(" → "),
  );
}

/* ========================================================================== *
 * CONFIGURAÇÃO DOS MOTORES — VERSÃO 1
 * ========================================================================== */

async function seedEngineConfigs(db: Db) {
  log.section("Configuração dos motores (versão 1)");

  const kinds = Object.keys(ENGINE_CONFIG_DEFAULTS) as EngineConfigKind[];

  for (const kind of kinds) {
    const existing = await db.query.engineConfigs.findFirst({
      where: (t, { and, eq: e }) => and(e(t.kind, kind), e(t.isActive, true)),
    });

    if (existing) {
      log.item(`${kind.padEnd(20)} já existe (v${existing.version}) — preservada`);
      continue;
    }

    // Valida antes de gravar: uma configuração inválida no banco geraria
    // tarefas erradas silenciosamente.
    const payload = parseEngineConfig(kind, ENGINE_CONFIG_DEFAULTS[kind]);

    await db.insert(schema.engineConfigs).values({
      kind,
      version: 1,
      payload,
      isActive: true,
      activatedAt: new Date(),
      changeNote: "Versão inicial, com os valores padrão do README.",
    });

    log.item(`${kind.padEnd(20)} v1 criada e ativada`);
  }

  const weights = ENGINE_CONFIG_DEFAULTS.daily_task_weights;
  log.item(
    `  pesos do Motor 1: desempenho ${weights.performance}% · edital ${weights.editalWeight}% · ` +
      `urgência ${weights.urgency}% · recência ${weights.recency}% · lacunas ${weights.knowledgeGap}%`,
  );
}

/* ========================================================================== *
 * DOCUMENTOS LEGAIS
 * ========================================================================== */

async function seedLegalDocuments(db: Db) {
  log.section("Documentos legais");

  const existing = await db.query.legalDocuments.findFirst({
    where: (t, { and, eq: e }) =>
      and(e(t.type, "privacy"), e(t.version, PRIVACY_POLICY_DRAFT.version)),
  });

  if (existing) {
    log.item(`Política de Privacidade ${PRIVACY_POLICY_DRAFT.version} já existe`);
    return;
  }

  await db.insert(schema.legalDocuments).values({
    type: "privacy",
    version: PRIVACY_POLICY_DRAFT.version,
    title: PRIVACY_POLICY_DRAFT.title,
    content: PRIVACY_POLICY_DRAFT.content,
    changeSummary: "Rascunho inicial.",
    // isCurrent fica FALSO de propósito: um rascunho não pode ser publicado por
    // acidente. Só vira corrente depois da revisão jurídica.
    isCurrent: false,
  });

  log.item(`Política de Privacidade ${PRIVACY_POLICY_DRAFT.version} inserida como RASCUNHO`);
  log.warn("Não publicada. Precisa de revisão jurídica antes de virar a versão corrente.");
}

/* ========================================================================== *
 * CATÁLOGO CANÔNICO
 * ========================================================================== */

async function seedCatalog(db: Db): Promise<Catalog> {
  log.section("Catálogo canônico");

  const boardsBySlug = new Map<string, string>();
  for (const board of SEED_EXAM_BOARDS) {
    const [row] = await db
      .insert(schema.examBoards)
      .values(board)
      .onConflictDoUpdate({
        target: schema.examBoards.slug,
        set: { name: board.name, shortName: board.shortName, sortOrder: board.sortOrder },
      })
      .returning({ id: schema.examBoards.id });
    boardsBySlug.set(board.slug, row.id);
  }
  log.item(`${SEED_EXAM_BOARDS.length} bancas`);

  const subjectsByKey = new Map<string, string>();
  const topicsByKey = new Map<string, string>();
  let topicCount = 0;
  let aliasCount = 0;

  for (const [index, subject] of SEED_SUBJECTS.entries()) {
    const [row] = await db
      .insert(schema.canonicalSubjects)
      .values({
        name: subject.name,
        slug: slugify(subject.name),
        normalizedName: taxonomyKey(subject.name),
        icon: subject.icon,
        sortOrder: index,
      })
      .onConflictDoUpdate({
        target: schema.canonicalSubjects.slug,
        set: { name: subject.name, icon: subject.icon, sortOrder: index },
      })
      .returning({ id: schema.canonicalSubjects.id });

    subjectsByKey.set(taxonomyKey(subject.name), row.id);

    for (const alias of subject.aliases ?? []) {
      const inserted = await db
        .insert(schema.canonicalSubjectAliases)
        .values({
          subjectId: row.id,
          alias,
          normalizedAlias: taxonomyKey(alias),
          origin: "admin",
        })
        .onConflictDoNothing()
        .returning({ id: schema.canonicalSubjectAliases.id });
      aliasCount += inserted.length;
    }

    const result = await insertTopics(db, row.id, subject.topics, null, "", 0);
    topicCount += result.topics;
    aliasCount += result.aliases;
    for (const [key, id] of result.byKey) topicsByKey.set(key, id);
  }

  log.item(`${SEED_SUBJECTS.length} disciplinas · ${topicCount} assuntos · ${aliasCount} sinônimos`);
  log.item("Os sinônimos são a camada que evita a fila do painel encher de item repetido.");

  return { boardsBySlug, subjectsByKey, topicsByKey };
}

async function insertTopics(
  db: Db,
  subjectId: string,
  topics: SeedTopic[],
  parentId: string | null,
  parentPath: string,
  depth: number,
): Promise<{ topics: number; aliases: number; byKey: Map<string, string> }> {
  let count = 0;
  let aliases = 0;
  const byKey = new Map<string, string>();

  for (const [index, topic] of topics.entries()) {
    const slug = slugify(`${parentPath ? `${parentPath} ` : ""}${topic.name}`);
    const path = parentPath ? `${parentPath}.${slugify(topic.name)}` : slugify(topic.name);

    const [row] = await db
      .insert(schema.canonicalTopics)
      .values({
        subjectId,
        parentId,
        name: topic.name,
        slug,
        normalizedName: taxonomyKey(topic.name),
        path,
        depth,
        sortOrder: index,
      })
      .onConflictDoUpdate({
        target: schema.canonicalTopics.slug,
        set: { name: topic.name, path, depth, sortOrder: index },
      })
      .returning({ id: schema.canonicalTopics.id });

    count++;
    byKey.set(taxonomyKey(topic.name), row.id);

    for (const alias of topic.aliases ?? []) {
      const inserted = await db
        .insert(schema.canonicalTopicAliases)
        .values({
          topicId: row.id,
          alias,
          normalizedAlias: taxonomyKey(alias),
          origin: "admin",
        })
        .onConflictDoNothing()
        .returning({ id: schema.canonicalTopicAliases.id });
      aliases += inserted.length;
    }

    if (topic.children?.length) {
      const child = await insertTopics(db, subjectId, topic.children, row.id, path, depth + 1);
      count += child.topics;
      aliases += child.aliases;
      for (const [k, v] of child.byKey) byKey.set(k, v);
    }
  }

  return { topics: count, aliases, byKey };
}

/* ========================================================================== *
 * QUESTÕES
 * ========================================================================== */

const AUTHORIAL_SPREADSHEET = "AUTORAISCRASE.xlsx";

async function seedQuestions(db: Db, catalog: Catalog) {
  log.section("Banco de questões");

  /* --- 1. acervo autoral da cliente --------------------------------------- */
  if (existsSync(AUTHORIAL_SPREADSHEET)) {
    const buffer = readFileSync(AUTHORIAL_SPREADSHEET);
    const result = parseQuestionSheet(new Uint8Array(buffer));

    log.item(`${AUTHORIAL_SPREADSHEET}: ${result.questions.length} questões lidas`);
    for (const issue of result.issues.slice(0, 10)) {
      log.warn(`linha ${issue.row}: ${issue.message}`);
    }
    if (result.issues.length > 10) {
      log.warn(`... e mais ${result.issues.length - 10} linha(s) com problema.`);
    }
    if (result.answerBalanceWarning) {
      log.warn(result.answerBalanceWarning);
      log.item("  (não bloqueia a importação — é a §8 do padrão editorial da cliente)");
    }

    await insertQuestions(db, catalog, result.questions, {
      fileName: AUTHORIAL_SPREADSHEET,
      totalRows: result.questions.length + result.issues.length,
      failedRows: result.issues.length,
      errors: result.issues.map((i) => ({ row: i.row, message: i.message })),
    });
  } else {
    log.warn(`${AUTHORIAL_SPREADSHEET} não encontrada na raiz — acervo autoral não importado.`);
  }

  /* --- 2. exemplos para exercitar os filtros ------------------------------- */
  const examples = buildExampleQuestions();
  await insertQuestions(db, catalog, examples, {
    fileName: "exemplos-para-teste-de-filtros",
    totalRows: examples.length,
    failedRows: 0,
    errors: [],
  });
  log.item(`${examples.length} questões de exemplo (4 disciplinas × 5 bancas × 3 níveis)`);
}

async function insertQuestions(
  db: Db,
  catalog: Catalog,
  questions: ParsedQuestion[],
  batch: {
    fileName: string;
    totalRows: number;
    failedRows: number;
    errors: Array<{ row: number; message: string }>;
  },
) {
  if (questions.length === 0) return;

  const existingBatch = await db.query.questionImportBatches.findFirst({
    where: (t, { eq: e }) => e(t.fileName, batch.fileName),
  });

  if (existingBatch) {
    log.item(`  lote "${batch.fileName}" já importado — pulando`);
    return;
  }

  const [batchRow] = await db
    .insert(schema.questionImportBatches)
    .values({
      fileName: batch.fileName,
      status: batch.failedRows > 0 ? "completed_with_errors" : "completed",
      totalRows: batch.totalRows,
      importedRows: questions.length,
      failedRows: batch.failedRows,
      errors: batch.errors,
      finishedAt: new Date(),
    })
    .returning({ id: schema.questionImportBatches.id });

  let inserted = 0;
  let skippedUnmapped = 0;

  for (const question of questions) {
    const subjectId = catalog.subjectsByKey.get(taxonomyKey(question.subjectName));
    if (!subjectId) {
      skippedUnmapped++;
      continue;
    }

    const topicId = catalog.topicsByKey.get(taxonomyKey(question.topicName)) ?? null;

    // A banca autoral da planilha chega como "Algoritmo da Aprovação".
    const boardSlug =
      question.examBoardName === AUTHORIAL_BOARD_NAME
        ? AUTHORIAL_BOARD_SLUG
        : slugifyBoard(question.examBoardName);
    const boardId = catalog.boardsBySlug.get(boardSlug) ?? null;

    const contentHash = hashStatement(question.statement);

    const [row] = await db
      .insert(schema.questions)
      .values({
        examBoardId: boardId,
        canonicalSubjectId: subjectId,
        canonicalTopicId: topicId,
        difficulty: question.difficulty,
        type: "multiple_choice",
        statement: question.statement,
        explanation: question.explanation,
        status: "published",
        importBatchId: batchRow.id,
        contentHash,
      })
      .onConflictDoNothing({ target: schema.questions.contentHash })
      .returning({ id: schema.questions.id });

    if (!row) continue; // já existia

    await db.insert(schema.questionOptions).values(
      question.options.map((option, index) => ({
        questionId: row.id,
        label: option.label,
        content: option.content,
        isCorrect: option.isCorrect,
        sortOrder: index,
      })),
    );

    inserted++;
  }

  log.item(`  ${inserted} questões gravadas no lote "${batch.fileName}"`);
  if (skippedUnmapped > 0) {
    log.warn(
      `  ${skippedUnmapped} questão(ões) ignorada(s): a disciplina não existe no catálogo canônico.`,
    );
  }
}

function slugifyBoard(name: string): string {
  const key = taxonomyKey(name);
  const match = SEED_EXAM_BOARDS.find(
    (b) => taxonomyKey(b.name) === key || taxonomyKey(b.shortName) === key,
  );
  return match?.slug ?? slugify(name);
}

/**
 * SHA-256 do enunciado normalizado — chave de deduplicação entre importações.
 *
 * Normalizado, e não bruto: a mesma questão reimportada com um espaço a mais ou
 * a acentuação corrigida continua sendo a mesma questão, e não deve duplicar.
 */
function hashStatement(statement: string): string {
  return createHash("sha256").update(taxonomyKey(statement)).digest("hex");
}

/* ========================================================================== *
 * MISSÕES DIÁRIAS (Marco 2)
 * ========================================================================== */

async function seedMissions(db: Db) {
  log.section("Missões diárias");

  const missions = [
    { code: "answer_questions_10", name: "Resolver 10 questões", targetType: "answer_questions", targetValue: 10, xpReward: 60, coinReward: 10, sortOrder: 0 },
    { code: "study_minutes_60", name: "Estudar 1 hora", targetType: "study_minutes", targetValue: 60, xpReward: 120, coinReward: 15, sortOrder: 1 },
    { code: "complete_reviews_1", name: "Fazer 1 revisão espaçada", targetType: "complete_reviews", targetValue: 1, xpReward: 40, coinReward: 5, sortOrder: 2 },
    { code: "review_errors_5", name: "Revisar 5 erros", targetType: "review_errors", targetValue: 5, xpReward: 50, coinReward: 8, sortOrder: 3 },
    { code: "complete_daily_task", name: "Cumprir todas as metas do dia", targetType: "complete_daily_task", targetValue: 1, xpReward: 100, coinReward: 25, sortOrder: 4 },
  ];

  for (const mission of missions) {
    await db
      .insert(schema.missions)
      .values({ ...mission, recurrence: "daily" })
      .onConflictDoUpdate({
        target: schema.missions.code,
        set: { name: mission.name, targetValue: mission.targetValue, xpReward: mission.xpReward },
      });
  }

  log.item(`${missions.length} missões (as 5 do mockup da Home)`);
}

// Só abre conexão quando executado direto (`npm run db:seed`), nunca quando
// importado pelo verificador.
if (process.argv[1]?.includes("seed")) {
  main().catch((error) => {
    console.error("\nFalha no seed:", error);
    process.exit(1);
  });
}
