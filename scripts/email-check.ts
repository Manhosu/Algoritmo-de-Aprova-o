import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Confere se o domínio de envio já está verificado no Resend.
 *
 * Enquanto não estiver, o e-mail de recuperação de senha só entrega para o
 * dono da conta Resend — e o item 12 do checklist de aceite do Marco 1 não pode
 * ser dado como pronto.
 *
 * Uso: npm run email:check
 */

const DOMAIN = "oalgoritmodaaprovacao.com.br";

type ResendRecord = {
  record: string;
  name: string;
  type: string;
  value: string;
  status: string;
  priority?: number;
};

type ResendDomain = {
  id: string;
  name: string;
  status: string;
  region: string;
  records?: ResendRecord[];
};

const STATUS_LABEL: Record<string, string> = {
  not_started: "não iniciado — os registros DNS ainda não foram adicionados",
  pending: "aguardando propagação do DNS",
  verified: "verificado",
  failure: "falhou — confira os valores dos registros",
  temporary_failure: "falha temporária — o Resend vai tentar de novo",
};

async function main() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log("RESEND_API_KEY não configurada.");
    console.log("Em desenvolvimento isso é esperado: os e-mails vão para o console.");
    return;
  }

  const response = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${key}` },
  });

  if (!response.ok) {
    console.error(`Resend respondeu ${response.status}: ${await response.text()}`);
    process.exit(1);
  }

  const body = (await response.json()) as { data: ResendDomain[] };
  const domain = body.data.find((d) => d.name === DOMAIN);

  if (!domain) {
    console.log(`O domínio ${DOMAIN} não está cadastrado no Resend.`);
    process.exit(1);
  }

  console.log(`Domínio: ${domain.name}  (região ${domain.region})`);
  console.log(`Status:  ${domain.status} — ${STATUS_LABEL[domain.status] ?? "?"}\n`);

  const detail = await fetch(`https://api.resend.com/domains/${domain.id}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const full = (await detail.json()) as ResendDomain;

  if (full.records?.length) {
    console.log("REGISTROS DNS");
    for (const record of full.records) {
      const ok = record.status === "verified";
      console.log(`  ${ok ? "✓" : "✗"} ${record.type.padEnd(4)} ${record.name.padEnd(22)} ${record.status}`);
    }
    console.log("");
  }

  if (domain.status === "verified") {
    console.log("Pronto. O e-mail de recuperação de senha entrega para qualquer aluno.");
    return;
  }

  console.log("Ainda não verificado.");
  console.log("Os 3 registros que precisam ser adicionados estão em docs/email.md.");
  console.log("");
  console.log("Até verificar, use no .env.local:");
  console.log('  EMAIL_FROM="O Algoritmo da Aprovação <onboarding@resend.dev>"');
  console.log("  (esse remetente só entrega para o e-mail dono da conta Resend)");
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
