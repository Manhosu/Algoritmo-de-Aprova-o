import { createHash } from "node:crypto";

import { hash } from "@node-rs/argon2";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * CRIA UM ALUNO DE TESTE COM PREPARAÇÃO PRONTA.
 * ============================================================================
 *
 * ⚠️ EXISTE PORQUE VALIDAR EM PRODUÇÃO NÃO PODE SIGNIFICAR ENTRAR NA CONTA DE
 * UM ALUNO DE VERDADE.
 *
 * As telas que dependem de edital — Trilhas, Cronograma, Tarefa do Dia, prova
 * de domínio — só existem para quem tem preparação. A conta de administração
 * não tem, e as que têm são da cliente e da irmã dela: usar a senha de outra
 * pessoa para conferir uma tela é o tipo de atalho que não se toma.
 *
 * O aluno é criado com preparação COPIADA de uma existente, então o edital, os
 * assuntos e os estados vêm reais. Nada é inventado.
 *
 *   npx tsx scripts/seed-test-student.ts          # cria e imprime a senha
 *   npx tsx scripts/seed-test-student.ts --limpar # remove
 */

const MARCADOR = "aluno-de-teste";
const EMAIL = `${MARCADOR}@exemplo.com.br`;
const SENHA = "Teste2026#Longo";

const LIMPAR = process.argv.includes("--limpar");

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 2 });

async function limpar() {
  const [u] = await sql`select id from users where email = ${EMAIL}`;
  if (!u) {
    console.log("Nada a limpar.");
    return;
  }

  /*
    A ordem importa: `subscriptions` e `payments` referenciam `users` com
    `restrict` (guarda fiscal), então precisam sair antes. O resto cai por
    cascade a partir da preparação e do usuário.
  */
  await sql`delete from payments where user_id = ${u.id}`;
  await sql`delete from subscriptions where user_id = ${u.id}`;
  await sql`delete from user_funnel_progress where user_id = ${u.id}`;
  await sql`delete from preparations where user_id = ${u.id}`;
  await sql`delete from users where id = ${u.id}`;

  console.log(`Removido: ${EMAIL}`);
}

async function criar() {
  await limpar();

  const senhaHash = await hash(SENHA, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });

  /*
    `pseudonym_key` é exigido pelo check `users_identity_required_check`: ele é a
    ponte entre o usuário e os eventos de telemetria, e uma conta ativa sem ele
    ficaria fora de toda métrica agregada. Aqui vale qualquer valor único.
  */
  const pseudonimo = createHash("sha256").update(`${MARCADOR}-${Date.now()}`).digest("hex");

  const [aluno] = await sql<Array<{ id: string }>>`
    insert into users (name, email, whatsapp, password_hash, pseudonym_key, role, status, timezone)
    values ('Aluno de Teste', ${EMAIL}, '+5511999990001', ${senhaHash},
            ${pseudonimo}, 'student', 'active', 'America/Sao_Paulo')
    returning id
  `;

  const [free] = await sql<Array<{ id: string }>>`select id from plans where code = 'free' limit 1`;
  await sql`
    insert into subscriptions (user_id, plan_id, status, provider)
    values (${aluno.id}, ${free.id}, 'active', 'manual')
  `;

  /* A preparação com mais assuntos ativos serve de molde. */
  const [molde] = await sql<Array<{ id: string; title: string; exam_date: string | null }>>`
    select p.id, p.title, p.exam_date
      from preparations p
     where p.deleted_at is null
     order by (select count(*) from study_plan_topics t
                 join study_plan_subjects s on s.id = t.plan_subject_id
                where s.preparation_id = p.id and t.is_active) desc
     limit 1
  `;

  if (!molde) throw new Error("Nenhuma preparação para copiar.");

  /*
    ⚠️ `is_current` É O QUE O APP LÊ. Sem ele, `getStudentContext` não acha
    preparação nenhuma e todas as telas do aluno mostram "comece pela sua
    preparação" — foi exatamente o que aconteceu na primeira tentativa.
  */
  const [nova] = await sql<Array<{ id: string }>>`
    insert into preparations (user_id, title, target_position, status, exam_date, is_current)
    select ${aluno.id}, title, target_position, 'active', exam_date, true
      from preparations where id = ${molde.id}
    returning id
  `;

  /*
    Disponibilidade também é exigida: sem minutos declarados não há Tarefa do
    Dia, e o onboarding intercepta a navegação.
  */
  await sql`
    insert into user_availability (user_id, weekday, minutes_available)
    select ${aluno.id}, dia, 120 from generate_series(0, 6) as dia
  `;

  await sql`
    insert into study_plan_subjects
      (preparation_id, canonical_subject_id, raw_name, normalized_name, display_name, sort_order, is_active)
    select ${nova.id}, canonical_subject_id, raw_name, normalized_name, display_name, sort_order, is_active
      from study_plan_subjects where preparation_id = ${molde.id}
  `;

  /*
    Os assuntos são ligados às disciplinas NOVAS casando pelo nome de exibição:
    a cópia acima não devolve o mapeamento de ids, e o nome é único dentro de
    uma preparação.
  */
  await sql`
    insert into study_plan_topics
      (preparation_id, plan_subject_id, canonical_topic_id, raw_name, normalized_name, display_name, depth, sort_order, is_active, weight, weight_source)
    select ${nova.id}, novo_s.id, t.canonical_topic_id, t.raw_name, t.normalized_name, t.display_name, t.depth, t.sort_order, t.is_active, t.weight, t.weight_source
      from study_plan_topics t
      join study_plan_subjects velho_s on velho_s.id = t.plan_subject_id
      join study_plan_subjects novo_s
        on novo_s.preparation_id = ${nova.id}
       and novo_s.display_name = velho_s.display_name
     where t.preparation_id = ${molde.id}
  `;

  await sql`
    insert into topic_states (user_id, preparation_id, plan_topic_id, coverage_status)
    select ${aluno.id}, ${nova.id}, id, 'not_started'
      from study_plan_topics where preparation_id = ${nova.id}
  `;

  const [contagem] = await sql<Array<{ total: number }>>`
    select count(*)::int as total from study_plan_topics where preparation_id = ${nova.id}
  `;

  console.log(`Criado: ${EMAIL}`);
  console.log(`Senha:  ${SENHA}`);
  console.log(`Preparação copiada de "${molde.title}" com ${contagem.total} assuntos.`);
}

(LIMPAR ? limpar() : criar())
  .then(() => sql.end({ timeout: 5 }))
  .catch(async (erro) => {
    console.error(erro);
    await sql.end({ timeout: 5 });
    process.exit(1);
  });
