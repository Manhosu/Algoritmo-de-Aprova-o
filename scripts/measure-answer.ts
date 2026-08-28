import { config } from "dotenv";
import postgres from "postgres";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Cronometra o caminho de responder uma questão.
 *
 *   npx tsx --conditions=react-server scripts/measure-answer.ts
 *
 * POR QUE MEDIR AQUI E NÃO NO NAVEGADOR
 * ----------------------------------------------------------------------------
 * No navegador o número vem somado ao RSC, ao React e ao próprio JavaScript da
 * página, e ainda varia com o que mais está na thread. A cliente reclamou de
 * demora ("demora um pouco para computar a resposta") e a medição precisa
 * separar o que é servidor do que é tela — senão a gente otimiza o lado errado.
 *
 * Ele CRIA um usuário próprio e apaga tudo ao final, inclusive se falhar no
 * meio: medir com a conta de outra pessoa gastaria a cota diária dela.
 */

const MARKER = "measure-answer";
const VOLTAS = 6;

function percentil(valores: number[], p: number): number {
  const ordenado = [...valores].sort((a, b) => a - b);
  return ordenado[Math.min(ordenado.length - 1, Math.floor((p / 100) * ordenado.length))];
}

async function main() {
  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");

  const sql = postgres(url, { max: 1, prepare: false });

  const [{ id: userId }] = await sql<Array<{ id: string }>>`
    insert into users (name, email, whatsapp, password_hash, pseudonym_key, role, status, timezone)
    values ('Medição', ${`${MARKER}-${Date.now()}@exemplo.invalido`}, '+5511999990002',
            'x', ${`${MARKER}-${Date.now()}`}, 'student', 'active', 'America/Sao_Paulo')
    returning id
  `;

  try {
    // Plano sem teto diário: o objetivo é medir o tempo, não bater no limite.
    const [plano] = await sql<Array<{ id: string }>>`
      select p.id
      from plans p
      join plan_limits l on l.plan_id = p.id
      order by l.daily_question_limit is null desc, l.daily_question_limit desc
      limit 1
    `;

    await sql`
      insert into subscriptions (user_id, plan_id, status, provider)
      values (${userId}, ${plano.id}, 'active', 'manual')
    `;

    const questoes = await sql<Array<{ id: string; option_id: string }>>`
      select q.id, (
        select o.id from question_options o where o.question_id = q.id order by o.sort_order limit 1
      ) as option_id
      from questions q
      where q.status = 'published' and q.deleted_at is null
      limit ${VOLTAS}
    `;

    if (questoes.length < VOLTAS) {
      throw new Error(`Só encontrei ${questoes.length} questões publicadas.`);
    }

    // Importado aqui, e não no topo, porque puxa `@/config/env`, que precisa
    // do dotenv já carregado.
    const { answerQuestion } = await import("@/server/questions/service");

    console.log(`\nRespondendo ${VOLTAS} questões, uma de cada vez:\n`);

    const tempos: number[] = [];
    for (const [i, questao] of questoes.entries()) {
      const inicio = performance.now();
      const resultado = await answerQuestion({
        userId,
        questionId: questao.id,
        optionId: questao.option_id,
        source: "question_bank",
        timeSpentSeconds: 30,
      });
      const ms = Math.round(performance.now() - inicio);
      tempos.push(ms);
      console.log(`  ${String(i + 1).padStart(2)}. ${String(ms).padStart(5)}ms  ${resultado.ok ? "ok" : `recusada (${resultado.reason})`}`);
    }

    const media = Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length);
    console.log(`\n  média ${media}ms · mediana ${percentil(tempos, 50)}ms · pior ${Math.max(...tempos)}ms\n`);
  } finally {
    // `subscriptions.user_id` não tem ON DELETE CASCADE (mesma ordem usada em
    // `smoke-flow.ts`), então a assinatura sai antes do usuário.
    await sql`delete from subscriptions where user_id = ${userId}`;
    await sql`delete from users where id = ${userId}`;

    /**
     * ⚠️ APAGAR O USUÁRIO NÃO DESFAZ AS ESTATÍSTICAS DA QUESTÃO.
     *
     * `question_attempts` cai por CASCADE junto com o usuário, mas
     * `questions.attempt_count` e `correct_count` são ROLLUP: sobem dentro da
     * transação de resposta e ninguém os faz descer. Sem esta recomposição,
     * cada medição envenenava o "onde a turma mais erra" do painel com
     * respostas que nunca existiram — foi exatamente o que aconteceu na
     * primeira execução, e deu nove questões com contador inflado.
     *
     * Recompor a partir de `question_attempts` é exato, e não só decrementa o
     * que ESTA execução somou: conserta também qualquer desvio anterior, já
     * que `answerQuestion` é o único lugar que escreve esses dois campos.
     */
    await sql`
      update questions q
      set attempt_count = a.total, correct_count = a.certas
      from (
        select q2.id,
               (select count(*) from question_attempts x where x.question_id = q2.id) as total,
               (select count(*) from question_attempts x
                where x.question_id = q2.id and x.is_correct) as certas
        from questions q2
      ) a
      where a.id = q.id
        and (q.attempt_count <> a.total or q.correct_count <> a.certas)
    `;

    await sql.end();
  }
}

await main();
