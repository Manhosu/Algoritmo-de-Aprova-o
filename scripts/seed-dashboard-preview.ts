import { createHash, randomBytes, randomUUID, createHmac } from "node:crypto";

import { hash } from "@node-rs/argon2";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Monta um aluno com HISTÓRICO para conferir o painel da Home no navegador.
 *
 * POR QUE ISSO EXISTE
 * ----------------------------------------------------------------------------
 * O `smoke-flow` cria um aluno que chega até a preparação ativa, mas sem
 * semanas de estudo atrás dele. O painel do mockup — nível, evolução,
 * desempenho por disciplina, sequência, índice — só mostra alguma coisa quando
 * existe passado. Sem este script, a única forma de ver os cards com dado real
 * seria usar a plataforma por um mês.
 *
 * ⚠️ ESCREVE NO BANCO DA CLIENTE. Todo registro nasce com o marcador abaixo, e
 * `--limpar` remove tudo. Rode a limpeza assim que terminar de olhar.
 *
 *   npx tsx scripts/seed-dashboard-preview.ts
 *   npx tsx scripts/seed-dashboard-preview.ts --limpar
 */

const MARKER = "dashboard-preview";
const LIMPAR = process.argv.includes("--limpar");

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não configurada.");

const sql = postgres(url, { max: 1, prepare: false });

/** Data civil de N dias atrás, no fuso do produto. */
function daysAgo(n: number): string {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date.toISOString().slice(0, 10);
}

async function limpar() {
  await sql`
    delete from subscriptions
    where user_id in (select id from users where email like ${`${MARKER}-%`})
  `;
  const removed = await sql`
    delete from users where email like ${`${MARKER}-%`} returning id
  `;
  console.log(`Contas de preview removidas: ${removed.length}`);
}

async function semear() {
  const userId = randomUUID();
  const email = `${MARKER}-${Date.now()}@exemplo.invalido`;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const pseudonym = createHmac("sha256", process.env.ANONYMIZATION_PEPPER ?? "x")
    .update(userId)
    .digest("hex");

  const passwordHash = await hash("uma frase longa de teste", {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  await sql`
    insert into users (id, name, email, whatsapp, password_hash, pseudonym_key, role, status, timezone)
    values (${userId}, 'Marina Prado', ${email}, '+5511999990001', ${passwordHash},
            ${pseudonym}, 'student', 'active', 'America/Sao_Paulo')
  `;

  const [freePlan] = await sql<Array<{ id: string }>>`
    select id from plans where code = 'free' limit 1
  `;
  await sql`
    insert into subscriptions (user_id, plan_id, status, provider)
    values (${userId}, ${freePlan.id}, 'active', 'manual')
  `;
  await sql`
    insert into auth_sessions (user_id, token_hash, expires_at)
    values (${userId}, ${tokenHash}, now() + interval '1 day')
  `;

  // Estuda todo dia, para o painel não cair no estado "dia de folga".
  await sql`
    insert into user_availability (user_id, weekday, minutes_available) values
      (${userId}, 0, 120), (${userId}, 1, 60), (${userId}, 2, 60), (${userId}, 3, 60),
      (${userId}, 4, 60), (${userId}, 5, 60), (${userId}, 6, 240)
  `;

  /* --- preparação ativa --------------------------------------------------- */
  const [prep] = await sql<Array<{ id: string }>>`
    insert into preparations (user_id, target_position, title, status, is_current, exam_date)
    values (${userId}, 'Analista Previdenciário', 'Analista Previdenciário',
            'active', true, current_date + 74)
    returning id
  `;

  /* --- disciplinas e assuntos, com desempenho ----------------------------- */
  const disciplinas = [
    { nome: "Português", acerto: 0.87 },
    { nome: "Direito Constitucional", acerto: 0.91 },
    { nome: "Direito Administrativo", acerto: 0.82 },
    { nome: "Matemática", acerto: 0.74 },
    { nome: "Raciocínio Lógico", acerto: 0.69 },
    { nome: "Legislação Previdenciária", acerto: 0.78 },
  ];

  for (const [index, disciplina] of disciplinas.entries()) {
    const [subject] = await sql<Array<{ id: string }>>`
      insert into study_plan_subjects
        (preparation_id, raw_name, display_name, normalized_name, sort_order, is_active)
      values (${prep.id}, ${disciplina.nome}, ${disciplina.nome},
              ${disciplina.nome.toLowerCase()}, ${index}, true)
      returning id
    `;

    for (let t = 0; t < 3; t += 1) {
      const [topic] = await sql<Array<{ id: string }>>`
        insert into study_plan_topics
          (preparation_id, plan_subject_id, raw_name, display_name, normalized_name,
           sort_order, weight, is_active)
        values (${prep.id}, ${subject.id}, ${`${disciplina.nome} — tema ${t + 1}`},
                ${`${disciplina.nome} — tema ${t + 1}`},
                ${`${disciplina.nome.toLowerCase()} tema ${t + 1}`}, ${t}, 1, true)
        returning id
      `;

      const answered = 40 + t * 15;
      await sql`
        insert into topic_states
          (preparation_id, plan_topic_id, user_id, questions_answered, questions_correct,
           current_mastery_score, coverage_status, study_minutes_total, reviews_completed)
        values (${prep.id}, ${topic.id}, ${userId}, ${answered},
                ${Math.round(answered * disciplina.acerto)},
                ${disciplina.acerto}, 'in_progress', ${60 + t * 20}, ${2 + t})
      `;
    }
  }

  /* --- 30 dias de histórico ----------------------------------------------- */
  for (let d = 29; d >= 0; d -= 1) {
    // Acerto subindo devagar, com ruído — uma reta perfeita denunciaria fixture.
    const base = 0.58 + (29 - d) * 0.009;
    const ruido = ((d * 37) % 11) / 100 - 0.05;
    const acerto = Math.min(0.95, Math.max(0.4, base + ruido));
    const respondidas = 18 + ((d * 13) % 14);

    await sql`
      insert into daily_user_rollups
        (user_id, rollup_date, questions_answered, questions_correct, study_minutes,
         study_sessions_count, reviews_completed, xp_earned, coins_earned)
      values (${userId}, ${daysAgo(d)}, ${respondidas},
              ${Math.round(respondidas * acerto)}, ${90 + ((d * 7) % 60)},
              ${2}, ${d % 3 === 0 ? 2 : 1}, ${180 + ((d * 11) % 90)}, ${12})
    `;

    await sql`
      insert into streak_days (user_id, activity_date, had_questions, had_study, had_review, xp_earned)
      values (${userId}, ${daysAgo(d)}, true, true, ${d % 3 === 0}, ${180})
    `;
  }

  /*
   * --- tentativas reais ----------------------------------------------------
   *
   * ⚠️ SEM ISTO O PAINEL SE CONTRADIZ. "Questões resolvidas" sai de
   * `question_attempts`, e o desempenho por disciplina sai de `topic_states`.
   * Popular só o segundo produzia "0 questões resolvidas" ao lado de "91% de
   * acerto em Direito Constitucional" — foi assim que o defeito apareceu.
   */
  const questoes = await sql<Array<{ id: string }>>`
    select id from questions limit 40
  `;

  const topicos = await sql<Array<{ id: string }>>`
    select id from study_plan_topics where preparation_id = ${prep.id}
  `;

  if (questoes.length > 0) {
    for (let d = 29; d >= 0; d -= 1) {
      const base = 0.58 + (29 - d) * 0.009;
      const acerto = Math.min(0.95, Math.max(0.4, base + (((d * 37) % 11) / 100 - 0.05)));
      const respondidas = 18 + ((d * 13) % 14);

      const linhas = Array.from({ length: respondidas }, (_, i) => ({
        userId,
        questionId: questoes[(d * 7 + i) % questoes.length].id,
        preparationId: prep.id,
        planTopicId: topicos[(d + i) % topicos.length].id,
        source: "daily_task" as const,
        isCorrect: i / respondidas < acerto,
        answeredDate: daysAgo(d),
      }));

      for (const linha of linhas) {
        await sql`
          insert into question_attempts
            (user_id, question_id, preparation_id, plan_topic_id, source, is_correct,
             answered_at, answered_date, answered_hour)
          values (${linha.userId}, ${linha.questionId}, ${linha.preparationId},
                  ${linha.planTopicId}, ${linha.source}, ${linha.isCorrect},
                  ${`${linha.answeredDate} 20:00:00-03`}, ${linha.answeredDate}, 20)
        `;
      }
    }
  }

  /* --- gamificação e índice ------------------------------------------------ */
  const [level] = await sql<Array<{ id: string }>>`
    select id from levels where is_active order by min_xp desc limit 1 offset 2
  `;
  await sql`
    insert into user_gamification_states
      (user_id, total_xp, current_level_id, coin_balance, current_streak, longest_streak, last_activity_date)
    values (${userId}, 5740, ${level?.id ?? null}, 570, 30, 30, current_date)
  `;

  await sql`
    insert into preparation_metrics
      (preparation_id, metric_date, coverage_percent, accuracy_percent,
       review_adherence_percent, task_completion_percent, preparation_index)
    values (${prep.id}, current_date, 62, 80.7, 88, 74, 78)
  `;

  console.log("\nAluno de preview criado.\n");
  console.log(`  E-mail:  ${email}`);
  console.log(`  Senha:   uma frase longa de teste`);
  console.log(`  Cookie:  aa_session=${token}`);
  console.log(`\nAo terminar:  npx tsx scripts/seed-dashboard-preview.ts --limpar\n`);
}

try {
  if (LIMPAR) await limpar();
  else await semear();
} finally {
  await sql.end({ timeout: 5 });
}
