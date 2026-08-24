import { readFileSync } from "node:fs";

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * COMPARA A QUALIDADE DA LEITURA ENTRE OS MODELOS.
 * ============================================================================
 *
 * ⚠️ GASTA DINHEIRO: uma leitura por modelo. Com o texto já extraído
 * localmente, o edital do TJ-RJ custa cerca de US$ 0,50 no Opus, US$ 0,20 no
 * Sonnet e US$ 0,10 no Haiku — menos de um dólar para os três.
 *
 * POR QUE MEDIR EM VEZ DE ESCOLHER PELO PREÇO
 * ----------------------------------------------------------------------------
 * A leitura do edital é a operação que decide se o aluno confia no produto: uma
 * extração torta significa corrigir trezentas linhas na mão, e ninguém faz isso
 * duas vezes. Trocar por um modelo mais barato sem medir é economizar cinquenta
 * centavos e arriscar a primeira impressão.
 *
 * Mas a tarefa MUDOU: antes o modelo recebia um PDF de 83 páginas e precisava
 * interpretar layout e imagem; agora recebe texto limpo do anexo certo. É bem
 * provável que um modelo menor dê o mesmo resultado. Este script responde isso
 * com dado, não com opinião.
 *
 * O QUE COMPARAR NA SAÍDA
 * ----------------------------------------------------------------------------
 *   • número de disciplinas e assuntos — faltou conteúdo?
 *   • pesos preenchidos — o modelo achou a tabela de questões?
 *   • hierarquia — os subitens viraram filhos ou viraram irmãos?
 *   • fidelidade — os nomes batem com o documento?
 *
 * O último é o que mais importa e é o que o script NÃO decide sozinho: ele
 * imprime os primeiros assuntos de cada modelo lado a lado para quem estiver
 * lendo comparar.
 *
 * Uso: npm run compare:models -- edital.pdf "Analista Judiciário"
 */

const MODELS = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5-20251001"] as const;

const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

async function main() {
  const file = process.argv[2];
  const position = process.argv[3] ?? null;

  if (!file) {
    console.error(
      'Informe o PDF:\n  npm run compare:models -- edital.pdf "Analista Judiciário"',
    );
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY não configurada.");
  }

  const bytes = new Uint8Array(readFileSync(file));

  console.log(`Arquivo: ${file}`);
  console.log(`Cargo:   ${position ?? "(todos)"}\n`);
  console.log("⚠️  Cada modelo é uma chamada paga. Total estimado: menos de US$ 1.\n");

  type Row = {
    model: string;
    ok: boolean;
    subjects: number;
    topics: number;
    withWeight: number;
    withChildren: number;
    seconds: number;
    cents: number;
    sample: string[];
    note: string;
  };

  const rows: Row[] = [];

  for (const model of MODELS) {
    // O extrator lê o modelo do ambiente; trocamos por execução.
    process.env.EDITAL_MODEL = model;

    // Import fresco a cada volta: o módulo lê `env` na avaliação.
    const modulePath = `../src/server/ai/edital-extractor?m=${model}`;
    const { extractEdital, countTopics, countTopicsWithWeight } = await import(
      /* @vite-ignore */ modulePath
    );

    process.stdout.write(`  ${model.padEnd(28)} lendo... `);
    const started = Date.now();

    const outcome = await extractEdital({ pdf: bytes, targetPosition: position });
    const seconds = (Date.now() - started) / 1000;

    if (outcome.status !== "succeeded") {
      console.log(`✗ ${outcome.message}`);
      rows.push({
        model,
        ok: false,
        subjects: 0,
        topics: 0,
        withWeight: 0,
        withChildren: 0,
        seconds,
        cents: 0,
        sample: [],
        note: outcome.message,
      });
      continue;
    }

    const data = outcome.data;
    const price = PRICES[model];
    const dollars =
      (outcome.usage.inputTokens / 1_000_000) * price.input +
      (outcome.usage.outputTokens / 1_000_000) * price.output;

    rows.push({
      model,
      ok: true,
      subjects: data.subjects.length,
      topics: countTopics(data),
      withWeight: countTopicsWithWeight(data),
      withChildren: data.subjects
        .flatMap((s: { topics: Array<{ children?: unknown[] }> }) => s.topics)
        .filter((t: { children?: unknown[] }) => (t.children?.length ?? 0) > 0).length,
      seconds,
      cents: Math.round(dollars * 100),
      sample: data.subjects[0]?.topics.slice(0, 5).map((t: { name: string }) => t.name) ?? [],
      note: `${outcome.usage.inputTokens} entrada / ${outcome.usage.outputTokens} saída · ${outcome.usage.inputMode}`,
    });

    console.log(`✓ ${seconds.toFixed(0)}s`);
  }

  console.log("\nRESULTADO\n");
  console.log(
    "  " +
      "modelo".padEnd(28) +
      "disc".padStart(6) +
      "assuntos".padStart(10) +
      "c/ peso".padStart(9) +
      "c/ filhos".padStart(11) +
      "tempo".padStart(8) +
      "custo".padStart(10),
  );

  for (const row of rows) {
    if (!row.ok) {
      console.log(`  ${row.model.padEnd(28)}  ✗ ${row.note}`);
      continue;
    }
    console.log(
      "  " +
        row.model.padEnd(28) +
        String(row.subjects).padStart(6) +
        String(row.topics).padStart(10) +
        String(row.withWeight).padStart(9) +
        String(row.withChildren).padStart(11) +
        `${row.seconds.toFixed(0)}s`.padStart(8) +
        `US$ ${(row.cents / 100).toFixed(2)}`.padStart(10),
    );
  }

  console.log("\nPRIMEIROS ASSUNTOS DA PRIMEIRA DISCIPLINA");
  console.log("(é aqui que se vê fidelidade ao documento — compare com o PDF)\n");

  for (const row of rows) {
    if (!row.ok) continue;
    console.log(`  ${row.model}`);
    for (const name of row.sample) console.log(`    · ${name}`);
    console.log("");
  }

  const best = rows.filter((r) => r.ok).sort((a, b) => b.topics - a.topics)[0];
  if (best) {
    console.log(
      `O mais completo foi ${best.model}, com ${best.topics} assuntos. ` +
        `Se os menores chegarem perto disso E os nomes baterem com o PDF, vale trocar: ` +
        `defina EDITAL_MODEL no .env.local.`,
    );
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("\n", error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
