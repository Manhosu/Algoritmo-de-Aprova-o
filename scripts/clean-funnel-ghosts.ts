import { config } from "dotenv";
import postgres from "postgres";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * REMOVE OS CADASTROS FANTASMAS DO FUNIL.
 * ============================================================================
 *
 * O painel administrativo mostrava 114 cadastros onde há 5 contas. As outras
 * 110 eram usuários que o `smoke-flow` cria e apaga a cada execução: ele
 * apagava a linha de `users`, e `user_funnel_progress.user_id` é ON DELETE SET
 * NULL — a linha do funil ficava para trás, órfã, contando como um cadastro.
 *
 * O `smoke-flow` já foi corrigido para apagar a própria linha. Este script
 * limpa as que ficaram.
 *
 * ⚠️ POR QUE `user_id IS NULL` É UM CRITÉRIO SEGURO AQUI
 * ----------------------------------------------------------------------------
 * A pergunta óbvia é se isso não apagaria a história de quem exerceu o direito
 * de exclusão — que é exatamente o caso que o SET NULL existe para preservar.
 *
 * Não apaga, e a razão está em `server/auth/anonymize.ts`: a exclusão da LGPD
 * é um UPDATE, não um DELETE. A linha de `users` PERMANECE, com os campos de
 * identificação nulos e `status = 'anonymized'`. O `user_id` do funil continua
 * apontando para ela.
 *
 * Ou seja: `user_id IS NULL` só acontece quando alguém apagou fisicamente a
 * linha de `users`, e o único código que faz isso é o script de smoke.
 *
 * Mesmo assim o script CONFERE a premissa antes de apagar. Se algum dia a
 * exclusão passar a remover a linha, a conferência falha e nada é apagado.
 *
 *   npx tsx scripts/clean-funnel-ghosts.ts          # mostra o que faria
 *   npx tsx scripts/clean-funnel-ghosts.ts --apply  # apaga
 */

const APLICAR = process.argv.includes("--apply");

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 2 });

async function main() {
  /*
    A conferência da premissa. Toda conta anonimizada precisa ter a linha do
    funil ainda ligada a ela; se alguma perdeu o vínculo, o critério deste
    script deixou de valer e ele não pode rodar.
  */
  const [premissa] = await sql`
    select
      count(*)::int as anonimizadas,
      count(*) filter (where not exists (
        select 1 from user_funnel_progress p where p.user_id = u.id
      ))::int as sem_linha
    from users u
    where u.status = 'anonymized'
  `;

  if (premissa.sem_linha > 0) {
    console.error(
      `ABORTADO: ${premissa.sem_linha} conta(s) anonimizada(s) perderam a linha do funil.\n` +
        `A exclusão passou a apagar a linha de users, e "user_id is null" deixou de\n` +
        `distinguir usuário de teste de pessoa real. Nada foi alterado.`,
    );
    await sql.end({ timeout: 5 });
    process.exit(1);
  }

  const [antes] = await sql`select count(*)::int as total from user_funnel_progress`;
  const [orfas] = await sql`
    select count(*)::int as total, min(signed_up_at) as primeira, max(signed_up_at) as ultima
    from user_funnel_progress
    where user_id is null
  `;

  console.log(`Linhas no funil: ${antes.total}`);
  console.log(`Contas anonimizadas (preservadas): ${premissa.anonimizadas}`);
  console.log(`Fantasmas do smoke: ${orfas.total}`);

  if (orfas.total > 0) {
    console.log(
      `  de ${(orfas.primeira as Date).toLocaleString("pt-BR")}` +
        ` até ${(orfas.ultima as Date).toLocaleString("pt-BR")}`,
    );
  }

  const restantes = await sql`
    select u.email, u.status, p.last_stage_reached
    from user_funnel_progress p
    join users u on u.id = p.user_id
    order by p.signed_up_at
  `;

  console.log(`\nPermanecem ${restantes.length}:`);
  for (const linha of restantes) {
    console.log(`  ${linha.email ?? "(anonimizada)"} — ${linha.last_stage_reached}`);
  }

  if (!APLICAR) {
    console.log("\nNada foi alterado. Rode com --apply para apagar.");
    await sql.end({ timeout: 5 });
    return;
  }

  const apagadas = await sql`delete from user_funnel_progress where user_id is null`;
  console.log(`\n${apagadas.count} linhas removidas.`);

  await sql.end({ timeout: 5 });
}

main().catch(async (erro) => {
  console.error(erro);
  await sql.end({ timeout: 5 });
  process.exit(1);
});
