import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * CALCULA AS CONQUISTAS DE QUEM JÁ ESTUDOU ANTES DELAS EXISTIREM.
 * ============================================================================
 *
 * `checkAchievements` roda depois de cada questão, estudo e revisão. Quem já
 * estava usando a plataforma antes das conquistas existirem só veria a primeira
 * delas na próxima questão respondida — e apareceria com "0 de 12" numa tela que
 * deveria mostrar meses de trabalho.
 *
 * ⚠️ NADA É INVENTADO AQUI. A função é a mesma que roda em produção, e o
 * critério é sempre "contador >= alvo" lido das tabelas de origem. O script só
 * antecipa a conta que aconteceria de qualquer jeito.
 *
 * É seguro repetir: o carimbo de desbloqueio é preservado por `coalesce` e as
 * recompensas são chaveadas pelo id da conquista nos livros-razão.
 *
 *   npx tsx --conditions=react-server scripts/backfill-achievements.ts
 */

async function main() {
  const { db } = await import("../src/server/db");
  const schema = await import("../src/server/db/schema");
  const { eq, and } = await import("drizzle-orm");
  const { checkAchievements } = await import("../src/server/engine/achievements");

  const alunos = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(and(eq(schema.users.role, "student"), eq(schema.users.status, "active")));

  console.log(`Alunos ativos: ${alunos.length}\n`);

  for (const aluno of alunos) {
    /*
      Um por vez, de propósito. Cada chamada faz uma leitura de contadores e até
      duas escritas por conquista desbloqueada; disparar tudo em paralelo
      estouraria o pooler de sessão do Supabase, que é o que a nota em
      `server/db/index.ts` mede.
    */
    const novas = await checkAchievements({ userId: aluno.id });

    console.log(
      `  ${aluno.email ?? aluno.id}: ${
        novas.length === 0
          ? "nenhuma nova"
          : novas.map((c) => `${c.icon ?? ""} ${c.name}`).join(", ")
      }`,
    );
  }

  const [total] = await db
    .select({
      desbloqueadas: schema.userAchievements.id,
    })
    .from(schema.userAchievements)
    .limit(1);

  console.log(`\nPronto.${total ? "" : " Nenhum progresso foi gravado."}`);
  process.exit(0);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
