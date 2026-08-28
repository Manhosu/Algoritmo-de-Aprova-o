import { config } from "dotenv";
import postgres from "postgres";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Reconstrói a fila de mapeamento a partir dos assuntos que estão no banco.
 *
 *   npx tsx scripts/rebuild-mapping-queue.ts [--aplicar]
 *
 * O QUE É A FILA, E POR QUE ELA PODE SE PERDER
 * ----------------------------------------------------------------------------
 * `topic_mapping_queue` é a lista de "assunto que apareceu no edital de alguém
 * e NÃO existe no catálogo" — ou seja, a lista do que cadastrar para render
 * questão ao aluno. Ela é preenchida na leitura do edital e nunca mais: é um
 * registro derivado, mas escrito uma única vez.
 *
 * Isso a torna frágil de um jeito específico: qualquer limpeza que mire "lixo
 * de teste" pela ausência de vínculo pode levar junto os itens reais, e não há
 * de onde eles voltem sozinhos — a próxima leitura só repõe o que aparecer
 * naquele edital. Foi o que aconteceu em 27/08/2026, quando uma limpeza minha
 * apagou 28 itens legítimos das preparações da cliente.
 *
 * ⚠️ A FILA É GLOBAL, e a chave é o nome normalizado. Ela junta o mesmo assunto
 * vindo de alunos diferentes, e `occurrences` / `affected_user_count` são o que
 * ordena o painel — é por eles que se decide o que cadastrar primeiro. Este
 * script recalcula os dois a partir dos dados, em vez de chutar 1.
 *
 * Roda em modo de conferência por padrão. Só grava com `--aplicar`.
 */

const APLICAR = process.argv.includes("--aplicar");

async function main() {
  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");

  const sql = postgres(url, { max: 1, prepare: false });

  try {
    /**
     * Um assunto entra na fila quando não casou com o catálogo. Agrupa pelo
     * nome normalizado, que é a chave única da fila.
     *
     * `subject_hint` sai da disciplina onde ele apareceu — é o contexto de quem
     * vai resolver, e sem ele "Princípios" não diz de que matéria se trata.
     */
    const pendentes = await sql<
      Array<{
        normalized_name: string;
        raw_name: string;
        subject_hint: string | null;
        occurrences: number;
        affected_user_count: number;
      }>
    >`
      select
        t.normalized_name,
        min(t.raw_name)                        as raw_name,
        min(s.display_name)                    as subject_hint,
        count(*)::int                          as occurrences,
        count(distinct p.user_id)::int         as affected_user_count
      from study_plan_topics t
      join study_plan_subjects s on s.id = t.plan_subject_id
      join preparations p        on p.id = t.preparation_id
      where t.canonical_topic_id is null
        and p.deleted_at is null
      group by t.normalized_name
      order by count(*) desc
    `;

    const naFila = await sql<Array<{ normalized_name: string }>>`
      select normalized_name from topic_mapping_queue
    `;
    const jaExiste = new Set(naFila.map((f) => f.normalized_name));
    const faltando = pendentes.filter((p) => !jaExiste.has(p.normalized_name));

    console.log(`\nAssuntos sem casamento no catálogo: ${pendentes.length}`);
    console.log(`Já na fila: ${naFila.length}`);
    console.log(`Faltando na fila: ${faltando.length}\n`);

    for (const item of faltando.slice(0, 20)) {
      console.log(
        `  · ${item.raw_name}  [${item.subject_hint ?? "sem disciplina"}] ` +
          `· ${item.occurrences} ocorrência(s), ${item.affected_user_count} aluno(s)`,
      );
    }
    if (faltando.length > 20) console.log(`  … e mais ${faltando.length - 20}`);

    if (!APLICAR) {
      console.log("\n(conferência — rode com --aplicar para gravar)\n");
      return;
    }

    for (const item of faltando) {
      await sql`
        insert into topic_mapping_queue
          (raw_name, normalized_name, subject_hint, occurrences, affected_user_count, status)
        values
          (${item.raw_name}, ${item.normalized_name}, ${item.subject_hint},
           ${item.occurrences}, ${item.affected_user_count}, 'pending')
        on conflict (normalized_name) do nothing
      `;
    }

    const [{ total }] = await sql<Array<{ total: number }>>`
      select count(*)::int as total from topic_mapping_queue
    `;
    console.log(`\n✓ ${faltando.length} item(ns) repostos. A fila tem ${total}.\n`);
  } finally {
    await sql.end();
  }
}

await main();
