import { config } from "dotenv";
import postgres from "postgres";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Devolve as revisões que ficaram canceladas depois de uma reabertura.
 *
 *   npx tsx scripts/repair-orphan-reviews.ts [--aplicar]
 *
 * O QUE ACONTECEU
 * ----------------------------------------------------------------------------
 * Encerrar uma preparação cancela as revisões pendentes, e isso está certo.
 * Reabrir devolvia `status = active` e mais nada: o aluno recuperava a
 * preparação com o ciclo de revisões morto, e "Revisões para hoje" ficava vazia
 * para sempre. Nada na tela dizia que aquilo tinha acontecido.
 *
 * `reopenPreparation` já restaura desde 28/08/2026. Este script conserta quem
 * passou pela versão antiga — as revisões daquelas contas continuam canceladas,
 * e nenhuma reabertura futura vai alcançá-las.
 *
 * COMO ELE RECONHECE UMA ÓRFÃ
 * ----------------------------------------------------------------------------
 * Revisão CANCELADA numa preparação que está ATIVA, cujo assunto continua no
 * plano. Não existe caminho legítimo que produza esse estado: as duas outras
 * razões de cancelamento — preparação encerrada e assunto desativado — deixam
 * rastro na preparação ou no assunto.
 *
 * ⚠️ Revisões vencidas voltam VENCIDAS, e é o certo: o aluno realmente deve
 * aquele conteúdo. O motor já trata atraso acumulando, não punindo.
 *
 * Roda em conferência por padrão. Só grava com `--aplicar`.
 */

const APLICAR = process.argv.includes("--aplicar");

async function main() {
  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");

  const sql = postgres(url, { max: 1, prepare: false });

  try {
    const orfas = await sql<
      Array<{
        id: string;
        email: string;
        title: string;
        display_name: string;
        due_date: string;
        stage_index: number;
      }>
    >`
      select r.id, u.email, p.title, t.display_name, r.due_date, r.stage_index
      from review_occurrences r
      join preparations p     on p.id = r.preparation_id
      join study_plan_topics t on t.id = r.plan_topic_id
      join users u            on u.id = r.user_id
      where r.status = 'canceled'
        and p.status = 'active'
        and p.deleted_at is null
        and t.is_active = true
        and t.deleted_at is null
      order by u.email, r.due_date
    `;

    console.log(`\nRevisões órfãs encontradas: ${orfas.length}\n`);

    for (const o of orfas.slice(0, 30)) {
      console.log(
        `  ${o.email} · ${o.title} · ${o.display_name} · etapa ${o.stage_index} · vence ${o.due_date}`,
      );
    }
    if (orfas.length > 30) console.log(`  … e mais ${orfas.length - 30}`);

    if (!APLICAR) {
      console.log("\n(conferência — rode com --aplicar para restaurar)\n");
      return;
    }

    if (orfas.length === 0) return;

    const restauradas = await sql`
      update review_occurrences
      set status = 'scheduled', canceled_at = null
      where id in ${sql(orfas.map((o) => o.id))}
      returning id
    `;

    console.log(`\n✓ ${restauradas.length} revisão(ões) restaurada(s).\n`);
  } finally {
    await sql.end();
  }
}

await main();
