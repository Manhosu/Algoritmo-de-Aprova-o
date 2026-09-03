import { config } from "dotenv";
import postgres from "postgres";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * DESFAZ UMA MARCAÇÃO DE "ESTUDADO" FEITA EM TESTE.
 * ============================================================================
 *
 * ⚠️ EXISTE PORQUE EU TESTEI A RECOMPENSA NA CONTA DA CLIENTE, em produção.
 *
 * Validar o pagamento de moedas exigia um clique real, e a única sessão de
 * produção que eu tinha era a dela. O clique deixou um mapa mental marcado como
 * estudado que ela nunca abriu, mais 30 XP e 2 moedas — e ela vai testar amanhã.
 * Um material já concluído sem explicação viraria relato de defeito.
 *
 * ⚠️ APAGA AS TRÊS COISAS JUNTAS, e a ordem importa.
 *
 * Tirar o progresso e deixar o lançamento no ledger seria pior que não mexer: o
 * saldo continuaria alto, e a chave de idempotência do ledger impediria que um
 * clique futuro no mesmo material pagasse de novo. O material ficaria
 * permanentemente sem recompensa, sem nada explicando por quê.
 *
 * O saldo consolidado é RECALCULADO a partir do ledger, nunca decrementado à
 * mão: subtrair um número de um saldo que já pode ter mudado por outra
 * atividade produz um valor que não corresponde a lançamento nenhum.
 *
 *   npx tsx scripts/undo-material-study.ts <email> <contentItemId>          # mostra
 *   npx tsx scripts/undo-material-study.ts <email> <contentItemId> --apply
 */

const [, , EMAIL, ITEM_ID] = process.argv;
const APLICAR = process.argv.includes("--apply");

if (!EMAIL || !ITEM_ID) {
  console.error("Uso: npx tsx scripts/undo-material-study.ts <email> <contentItemId> [--apply]");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 2 });

async function main() {
  const [usuario] = await sql`select id, email from users where email = ${EMAIL} limit 1`;
  if (!usuario) throw new Error(`Usuário ${EMAIL} não encontrado.`);

  const [progresso] = await sql`
    select ci.title, cp.status, cp.completed_at
    from content_progress cp
    join content_items ci on ci.id = cp.content_item_id
    where cp.user_id = ${usuario.id} and cp.content_item_id = ${ITEM_ID}
  `;

  const xp = await sql`
    select activity, amount from xp_ledger
    where user_id = ${usuario.id} and source_type = 'content_item' and source_id = ${ITEM_ID}
  `;

  const moedas = await sql`
    select reason, amount from coin_ledger
    where user_id = ${usuario.id} and source_type = 'content_item' and source_id = ${ITEM_ID}
  `;

  console.log(`\nConta: ${usuario.email}`);
  console.log(`Material: ${progresso?.title ?? "(sem progresso registrado)"}`);
  console.log(`Progresso: ${progresso?.status ?? "—"}`);
  console.log(`XP a estornar: ${xp.reduce((s, l) => s + l.amount, 0)}`);
  console.log(`Moedas a estornar: ${moedas.reduce((s, l) => s + l.amount, 0)}`);

  if (!APLICAR) {
    console.log("\nNada foi alterado. Rode com --apply.\n");
    await sql.end({ timeout: 5 });
    return;
  }

  await sql.begin(async (tx) => {
    await tx`
      delete from content_progress
      where user_id = ${usuario.id} and content_item_id = ${ITEM_ID}
    `;
    await tx`
      delete from xp_ledger
      where user_id = ${usuario.id} and source_type = 'content_item' and source_id = ${ITEM_ID}
    `;
    await tx`
      delete from coin_ledger
      where user_id = ${usuario.id} and source_type = 'content_item' and source_id = ${ITEM_ID}
    `;

    /* Recalculado do ledger — ver a nota do cabeçalho. */
    await tx`
      update user_gamification_states s
      set total_xp = coalesce((
            select sum(amount)::int from xp_ledger where user_id = s.user_id
          ), 0),
          coin_balance = coalesce((
            select sum(amount)::int from coin_ledger where user_id = s.user_id
          ), 0),
          updated_at = now()
      where s.user_id = ${usuario.id}
    `;
  });

  const [depois] = await sql`
    select total_xp, coin_balance from user_gamification_states where user_id = ${usuario.id}
  `;

  console.log(`\nEstornado. Agora: ${depois.total_xp} XP, ${depois.coin_balance} moedas.\n`);

  await sql.end({ timeout: 5 });
}

main().catch(async (erro) => {
  console.error(erro);
  await sql.end({ timeout: 5 });
  process.exit(1);
});
