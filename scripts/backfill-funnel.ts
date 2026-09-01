import { config } from "dotenv";
import postgres from "postgres";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * RECONSTRÓI OS DEGRAUS DO FUNIL A PARTIR DO QUE JÁ ACONTECEU.
 * ============================================================================
 *
 * Metade de `user_funnel_progress` era instrumentação morta: as colunas
 * existiam, o painel as lia, e NADA no código as gravava. `markFunnelStage`
 * era chamado só nos quatro degraus da ativação — `first_task_generated`,
 * `first_question_answered` e `first_review_completed` nunca; retenção e
 * limite do plano tampouco. O painel mostrava "0 responderam a 1ª questão"
 * com 1.046 questões respondidas no banco.
 *
 * O código já foi corrigido e passa a gravar dali em diante. Este script
 * preenche o passado.
 *
 * ⚠️ TUDO SAI DAS TABELAS DE ORIGEM, nada é estimado.
 *
 * "Quando respondeu a primeira questão" é `min(answered_at)` em
 * `question_attempts`. Não é um chute nem uma data de hoje: é o instante que já
 * está gravado. Um backfill que inventa carimbo destrói a única coisa que o
 * funil tem de valioso, que é ser verificável.
 *
 * ⚠️ `coalesce` EM TODO CANTO: só preenche o que está nulo. Rodar duas vezes
 * não muda nada, e um marco já gravado pelo código novo nunca é sobrescrito
 * por um cálculo daqui.
 *
 *   npx tsx scripts/backfill-funnel.ts          # mostra o que faria
 *   npx tsx scripts/backfill-funnel.ts --apply
 */

const APLICAR = process.argv.includes("--apply");
const FUSO = "America/Sao_Paulo";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 2 });

async function main() {
  const antes = await sql`
    select
      count(*) filter (where first_task_generated_at is not null)::int as tarefa,
      count(*) filter (where first_question_answered_at is not null)::int as questao,
      count(*) filter (where first_review_completed_at is not null)::int as revisao,
      count(*) filter (where returned_next_day_at is not null)::int as d1,
      count(*) filter (where returned_week_two_at is not null)::int as s2,
      count(*) filter (where free_limit_first_reached_at is not null)::int as limite,
      sum(completed_tasks_count)::int as tarefas_concluidas,
      sum(active_days_count)::int as dias_ativos,
      count(*)::int as total
    from user_funnel_progress
  `;

  console.log("Antes:", antes[0]);

  if (!APLICAR) {
    console.log("\nNada foi alterado. Rode com --apply.");
    await sql.end({ timeout: 5 });
    return;
  }

  /*
    Um UPDATE só, com subconsultas correlacionadas.

    Poderia ser um UPDATE por coluna, mais fácil de ler e sete varreduras da
    tabela. Como cada subconsulta usa o índice por `user_id` da sua tabela de
    origem, a versão única custa uma passada e resolve tudo na mesma linha.
  */
  const resultado = await sql`
    update user_funnel_progress p set
      first_task_generated_at = coalesce(p.first_task_generated_at, (
        select min(t.created_at) from daily_tasks t where t.user_id = p.user_id
      )),

      first_question_answered_at = coalesce(p.first_question_answered_at, (
        select min(a.answered_at) from question_attempts a where a.user_id = p.user_id
      )),

      first_review_completed_at = coalesce(p.first_review_completed_at, (
        select min(o.completed_at) from review_occurrences o
        where o.user_id = p.user_id and o.status = 'completed'
      )),

      -- Retorno: o primeiro dia de atividade posterior ao dia do cadastro.
      -- streak_days é a tabela certa, porque ela já É "um dia com atividade",
      -- na data civil do fuso do produto — a mesma definição que o funil usa.
      returned_next_day_at = coalesce(p.returned_next_day_at, (
        select min(s.activity_date)::timestamptz from streak_days s
        where s.user_id = p.user_id
          and s.activity_date > (p.signed_up_at at time zone ${FUSO})::date
      )),

      returned_week_two_at = coalesce(p.returned_week_two_at, (
        select min(s.activity_date)::timestamptz from streak_days s
        where s.user_id = p.user_id
          and s.activity_date >= (p.signed_up_at at time zone ${FUSO})::date + 7
          and s.activity_date <= (p.signed_up_at at time zone ${FUSO})::date + 20
      )),

      last_active_date = coalesce((
        select max(s.activity_date) from streak_days s where s.user_id = p.user_id
      ), p.last_active_date),

      active_days_count = greatest(p.active_days_count, (
        select count(*)::int from streak_days s where s.user_id = p.user_id
      )),

      completed_tasks_count = greatest(p.completed_tasks_count, (
        select count(*)::int from daily_tasks t
        where t.user_id = p.user_id and t.status = 'completed'
      )),

      free_limit_first_reached_at = coalesce(p.free_limit_first_reached_at, (
        select min(u.limit_reached_at) from daily_question_usage u
        where u.user_id = p.user_id and u.limit_reached_at is not null
      )),

      free_limit_reach_count = greatest(p.free_limit_reach_count, (
        select count(*)::int from daily_question_usage u
        where u.user_id = p.user_id and u.limit_reached_at is not null
      )),

      updated_at = now()
    where p.user_id is not null
  `;

  console.log(`\n${resultado.count} linhas atualizadas.`);

  const depois = await sql`
    select
      count(*) filter (where first_task_generated_at is not null)::int as tarefa,
      count(*) filter (where first_question_answered_at is not null)::int as questao,
      count(*) filter (where first_review_completed_at is not null)::int as revisao,
      count(*) filter (where returned_next_day_at is not null)::int as d1,
      count(*) filter (where returned_week_two_at is not null)::int as s2,
      count(*) filter (where free_limit_first_reached_at is not null)::int as limite,
      sum(completed_tasks_count)::int as tarefas_concluidas,
      sum(active_days_count)::int as dias_ativos,
      count(*)::int as total
    from user_funnel_progress
  `;

  console.log("Depois:", depois[0]);

  await sql.end({ timeout: 5 });
}

main().catch(async (erro) => {
  console.error(erro);
  await sql.end({ timeout: 5 });
  process.exit(1);
});
