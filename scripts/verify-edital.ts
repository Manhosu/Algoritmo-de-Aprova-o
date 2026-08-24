import { readFileSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";

import { hash } from "@node-rs/argon2";
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * LEITURA DE UM EDITAL DE VERDADE, COM CHAMADA REAL À IA.
 * ============================================================================
 *
 * Item 3 do checklist de aceite: "ele clica no '+', sobe um PDF de edital real
 * e a IA extrai disciplinas e assuntos".
 *
 * ⚠️ ESTE SCRIPT GASTA DINHEIRO. Cerca de 4 centavos de dólar por execução com
 * um edital pequeno; um edital real de 40 páginas custa mais. Por isso ele NÃO
 * entra na validação padrão — roda quando alguém quer conferir a leitura de um
 * documento específico.
 *
 * O QUE ELE MOSTRA
 * ----------------------------------------------------------------------------
 * O caminho inteiro, do arquivo ao que o aluno vê na tela de revisão:
 * armazenamento, leitura pela IA, casamento com o catálogo, custo registrado e
 * o que caiu na fila do painel. O número que mais importa é a PORCENTAGEM DE
 * CASAMENTO: ela diz quanto do edital vai render questão para o aluno.
 *
 * Um casamento baixo quase nunca é defeito de código — é buraco de catálogo, e
 * a fila do painel é exatamente a lista do que precisa ser cadastrado.
 *
 * Uso:
 *   npx tsx scripts/make-sample-edital.ts edital.pdf   (gera um de exemplo)
 *   npm run verify:edital -- edital.pdf
 *   npm run verify:edital -- edital.pdf "Analista Judiciário - Área Judiciária"
 *
 * O segundo argumento é o CARGO. Ele muda o resultado: a IA extrai o tronco
 * comum mais a especialidade daquele cargo, e ignora as dos outros. Num edital
 * com oito especialidades, é a diferença entre ler e estourar o orçamento de
 * saída.
 */

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error(
      "Informe o PDF:\n  npm run verify:edital -- caminho/do/edital.pdf\n\n" +
        "Para gerar um de exemplo:\n  npx tsx scripts/make-sample-edital.ts edital.pdf",
    );
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  if (url.includes(":6543")) {
    throw new Error("Use a porta 5432 — ver a nota em src/server/db/index.ts.");
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY não configurada. A leitura não roda sem ela.");
  }

  const { db } = await import("../src/server/db");
  const schema = await import("../src/server/db/schema");
  const { receiveEdital, runExtraction, getEditalStatus } = await import(
    "../src/server/preparations/edital"
  );
  const { getPlanContent } = await import("../src/server/preparations/content");
  const { eq, inArray, like } = await import("drizzle-orm");

  const userId = randomUUID();
  const email = `edital-check-${Date.now()}@exemplo.invalido`;
  const pseudonym = createHmac("sha256", process.env.ANONYMIZATION_PEPPER ?? "x")
    .update(userId)
    .digest("hex");

  /** A fila é global: sem o retrato, cada execução deixaria lixo no painel. */
  const queueBefore = new Set(
    (
      await db
        .select({ key: schema.topicMappingQueue.normalizedName })
        .from(schema.topicMappingQueue)
    ).map((row) => row.key),
  );

  try {
    await db.insert(schema.users).values({
      id: userId,
      name: "Leitor de Edital",
      email,
      whatsapp: "+5511900000010",
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

    const plan = await db.query.plans.findFirst({
      where: (t, { eq: e }) => e(t.code, "free"),
      columns: { id: true },
    });
    await db.insert(schema.subscriptions).values({
      userId,
      planId: plan!.id,
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

    const [preparation] = await db
      .insert(schema.preparations)
      .values({
        userId,
        // O cargo entra na leitura e é o que a torna viável num edital real.
        targetPosition: process.argv[3] ?? "Analista Judiciário",
        title: "Leitura de edital",
        status: "draft",
        isCurrent: true,
      })
      .returning({ id: schema.preparations.id });

    const bytes = new Uint8Array(readFileSync(file));
    console.log(`Arquivo: ${file} — ${(bytes.byteLength / 1024).toFixed(1)} KB\n`);

    console.log("1. Recebendo e guardando o PDF...");
    const received = await receiveEdital({
      preparationId: preparation.id,
      userId,
      fileName: file.split(/[\\/]/).pop() ?? "edital.pdf",
      bytes,
    });

    /**
     * ⚠️ `throw`, NUNCA `process.exit()` aqui dentro.
     *
     * `process.exit()` mata o processo na hora e PULA o `finally` — a limpeza
     * não roda justamente no caminho de falha, que é quando ela mais importa.
     * Descobri isso depois de quatro leituras que falharam: sobraram 7 usuários
     * de teste e 347 itens na fila do painel da cliente.
     */
    if (!received.ok) {
      throw new Error(received.message);
    }

    const afterUpload = await getEditalStatus(preparation.id, userId);
    console.log(`   ✓ guardado · preparação em "${afterUpload?.status}"`);

    console.log("\n2. Lendo com a IA (chamada real, pode levar um minuto)...");
    const started = Date.now();
    const result = await runExtraction(received.extractionId);

    if (result.status !== "succeeded") {
      throw new Error(result.message);
    }

    console.log(
      `   ✓ ${((Date.now() - started) / 1000).toFixed(1)}s · ` +
        `${result.subjects} disciplinas · ${result.topics} assuntos · ` +
        `${result.mappedPercent}% casados com o catálogo`,
    );

    console.log("\n3. O que o aluno vê na tela de revisão:\n");
    const content = await getPlanContent(preparation.id, userId);

    for (const subject of content!.subjects) {
      console.log(`   ${subject.displayName}`);
      for (const topic of subject.topics) {
        const mapped =
          topic.mappingStatus === "mapped" || topic.mappingStatus === "manually_mapped";
        const questions = topic.questionCount > 0 ? ` [${topic.questionCount}q]` : "";
        const weight = topic.weight !== null ? ` · peso ${topic.weight}` : "";
        console.log(
          `     ${mapped ? "✓" : "·"} ${"  ".repeat(topic.depth)}${topic.displayName}${questions}${weight}`,
        );
      }
      console.log("");
    }

    const extraction = await db.query.editalExtractions.findFirst({
      where: (t, { eq: e }) => e(t.preparationId, preparation.id),
      columns: {
        model: true,
        inputTokens: true,
        outputTokens: true,
        estimatedCostCents: true,
        durationMs: true,
      },
    });

    console.log(
      `4. Custo: ${extraction?.estimatedCostCents} centavos de dólar · ` +
        `${extraction?.inputTokens} entrada / ${extraction?.outputTokens} saída · ${extraction?.model}`,
    );

    const queueAfter = await db
      .select({
        key: schema.topicMappingQueue.normalizedName,
        raw: schema.topicMappingQueue.rawName,
      })
      .from(schema.topicMappingQueue);

    const novos = queueAfter.filter((row) => !queueBefore.has(row.key));

    console.log(`\n5. Foram para a fila do painel: ${novos.length} assunto(s)`);
    if (novos.length > 0) {
      console.log("   (buraco de catálogo — cadastrar estes rende questão ao aluno)");
      for (const row of novos.slice(0, 15)) console.log(`     · ${row.raw}`);
      if (novos.length > 15) console.log(`     … e mais ${novos.length - 15}`);
    }

    console.log(
      `\nCasamento: ${result.mappedPercent}%. ` +
        (result.mappedPercent >= 70
          ? "O catálogo cobre bem este edital."
          : "Boa parte do edital ainda não tem correspondência no catálogo."),
    );
  } finally {
    await db.delete(schema.subscriptions).where(eq(schema.subscriptions.userId, userId));
    await db.delete(schema.users).where(like(schema.users.email, "edital-check-%"));

    const after = await db
      .select({
        id: schema.topicMappingQueue.id,
        key: schema.topicMappingQueue.normalizedName,
      })
      .from(schema.topicMappingQueue);

    const created = after.filter((row) => !queueBefore.has(row.key)).map((row) => row.id);
    if (created.length > 0) {
      await db
        .delete(schema.topicMappingQueue)
        .where(inArray(schema.topicMappingQueue.id, created));
    }

    console.log("\n(dados de teste removidos)");
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("\n", error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
