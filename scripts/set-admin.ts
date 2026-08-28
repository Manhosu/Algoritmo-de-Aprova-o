import { config } from "dotenv";
import postgres from "postgres";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Dá (ou tira) acesso de administrador a uma conta.
 *
 *   npx tsx scripts/set-admin.ts email@exemplo.com
 *   npx tsx scripts/set-admin.ts email@exemplo.com --remover
 *
 * POR QUE UM SCRIPT, E NÃO UM UPDATE NO PSQL
 * ----------------------------------------------------------------------------
 * `update users set role = 'admin'` sem WHERE, ou com um WHERE que erra o
 * e-mail, promove gente que não devia — e ninguém percebe, porque nada quebra.
 * Aqui o e-mail precisa existir, a conta precisa estar ativa, e o script diz em
 * voz alta o que mudou e o que a pessoa passa a poder fazer.
 *
 * ⚠️ ADMIN VÊ E EDITA O TEXTO PÚBLICO DO SITE (`/admin/textos`). Não é acesso ao
 * código nem aos dados de outros alunos, mas é a página inicial do produto —
 * promova só quem responde por ela.
 */

const REMOVER = process.argv.includes("--remover");
const email = process.argv.find((a) => a.includes("@"))?.toLowerCase().trim();

async function main() {
  if (!email) {
    console.error("\nUso: npx tsx scripts/set-admin.ts email@exemplo.com [--remover]\n");
    process.exit(1);
  }

  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");

  const sql = postgres(url, { max: 1, prepare: false });

  try {
    const [conta] = await sql<Array<{ id: string; name: string; role: string; status: string }>>`
      select id, name, role, status from users where lower(email) = ${email}
    `;

    if (!conta) {
      console.error(`\n✗ Não existe conta com o e-mail ${email}.`);
      console.error("  Confira se ela já se cadastrou no site.\n");
      process.exit(1);
    }

    if (conta.status !== "active") {
      console.error(`\n✗ A conta de ${conta.name} está "${conta.status}", não ativa.\n`);
      process.exit(1);
    }

    const novo = REMOVER ? "student" : "admin";

    if (conta.role === novo) {
      console.log(`\n· ${conta.name} já é "${novo}". Nada a fazer.\n`);
      return;
    }

    await sql`update users set role = ${novo}, updated_at = now() where id = ${conta.id}`;

    console.log(`\n✓ ${conta.name} <${email}>: ${conta.role} → ${novo}`);
    console.log(
      novo === "admin"
        ? "  Ela já pode abrir /admin/textos e editar a página inicial.\n"
        : "  O acesso à área administrativa foi retirado.\n",
    );
  } finally {
    await sql.end();
  }
}

await main();
