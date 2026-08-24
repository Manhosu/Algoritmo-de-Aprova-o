import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Executa os pedidos de exclusão de conta cujo prazo de 7 dias venceu.
 *
 * Roda por tarefa agendada (GitHub Actions, cron da hospedagem, o que for).
 * Uma vez por dia basta: a janela é de dias, não de minutos.
 *
 * ⚠️ Roda com `--conditions=react-server` pelo mesmo motivo do
 * `verify:engine` — ver a nota lá.
 *
 * Uso: npm run deletions:run
 */
async function main() {
  const { runDueDeletions } = await import("../src/server/auth/anonymize");

  console.log("Procurando pedidos de exclusão vencidos...\n");

  const reports = await runDueDeletions();

  if (reports.length === 0) {
    console.log("Nenhum pedido vencido. Nada a fazer.");
    process.exit(0);
  }

  for (const report of reports) {
    console.log(
      `  ✓ conta ${report.userId.slice(0, 8)} anonimizada — ` +
        `${report.sessionsRevoked} sessão(ões) revogada(s), ` +
        `${report.tokensRemoved} token(s) e ${report.identitiesRemoved} identidade(s) removidos`,
    );
  }

  console.log(`\n${reports.length} conta(s) processada(s).`);
  process.exit(0);
}

main().catch((error) => {
  console.error("\n", error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
