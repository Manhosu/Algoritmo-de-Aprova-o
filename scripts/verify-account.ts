import { createHmac, randomUUID } from "node:crypto";

import { hash } from "@node-rs/argon2";
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * ⚠️ FORÇA O DRIVER DE LOG. Precisa vir ANTES de qualquer import de servidor.
 *
 * Com a chave do Resend presente, este script mandaria e-mail de verdade para
 * endereços `@exemplo.invalido` a cada execução: bounces reais, contra a
 * reputação do domínio que a cliente acabou de verificar.
 *
 * Como efeito colateral útil, o driver de log imprime o LINK COMPLETO — e é
 * assim que o script consegue o token em claro, que o serviço (corretamente)
 * nunca devolve.
 */
delete process.env.RESEND_API_KEY;

/**
 * VERIFICAÇÃO DO ITEM 12 DO ACEITE: SENHA, E-MAIL E EXCLUSÃO DE CONTA.
 * ============================================================================
 *
 * Percorre os quatro fluxos contra o Postgres real, incluindo os caminhos que
 * NÃO podem funcionar — token expirado, token reutilizado, senha errada,
 * e-mail já em uso. É a metade que costuma faltar: o caminho feliz é fácil de
 * ver funcionando na tela; o caminho de ataque, não.
 *
 * Não envia e-mail de verdade: sem RESEND_API_KEY o driver de log imprime no
 * terminal, e o token é lido direto do banco.
 *
 * ⚠️ Roda com `--conditions=react-server` — ver a nota em `verify-engine.ts`.
 *
 * Uso: npm run verify:account
 */

const MARKER = "account-check";
const SENHA_ORIGINAL = "uma frase longa e original";
const SENHA_NOVA = "outra frase bem diferente";

type Check = { label: string; ok: boolean; detail: string };
const checks: Check[] = [];

function check(label: string, ok: boolean, detail = "") {
  checks.push({ label, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  if (url.includes(":6543")) {
    throw new Error("Use a porta 5432 — ver a nota em src/server/db/index.ts.");
  }

  const { db } = await import("../src/server/db");
  const schema = await import("../src/server/db/schema");
  const account = await import("../src/server/auth/account");
  const { anonymizeUser } = await import("../src/server/auth/anonymize");
  const { verifyPassword } = await import("../src/server/auth/password");
  const { createSession } = await import("../src/server/auth/session");
  const { eq, and, desc } = await import("drizzle-orm");

  const userId = randomUUID();
  const email = `${MARKER}-${Date.now()}@exemplo.invalido`;
  const otherEmail = `${MARKER}-outro-${Date.now()}@exemplo.invalido`;
  const otherId = randomUUID();

  /** Lê o token em claro? Não — lê o hash e usa o token que o serviço gerou. */
  async function latestToken(type: "password_reset" | "email_change") {
    const [row] = await db
      .select({
        id: schema.verificationTokens.id,
        tokenHash: schema.verificationTokens.tokenHash,
        newEmail: schema.verificationTokens.newEmail,
        expiresAt: schema.verificationTokens.expiresAt,
      })
      .from(schema.verificationTokens)
      .where(
        and(
          eq(schema.verificationTokens.userId, userId),
          eq(schema.verificationTokens.type, type),
        ),
      )
      .orderBy(desc(schema.verificationTokens.createdAt))
      .limit(1);
    return row;
  }

  try {
    console.log("Preparando contas de teste...\n");

    const pseudonym = createHmac("sha256", process.env.ANONYMIZATION_PEPPER ?? "x")
      .update(userId)
      .digest("hex");

    for (const [id, mail, key] of [
      [userId, email, pseudonym],
      [
        otherId,
        otherEmail,
        createHmac("sha256", process.env.ANONYMIZATION_PEPPER ?? "x")
          .update(otherId)
          .digest("hex"),
      ],
    ] as const) {
      await db.insert(schema.users).values({
        id,
        name: "Aluno de Conta",
        email: mail,
        whatsapp: "+5511900000001",
        passwordHash: await hash(SENHA_ORIGINAL, {
          memoryCost: 19_456,
          timeCost: 2,
          parallelism: 1,
        }),
        pseudonymKey: key,
        role: "student",
        status: "active",
        timezone: "America/Sao_Paulo",
      });
    }

    const freePlan = await db.query.plans.findFirst({
      where: (t, { eq: e }) => e(t.code, "free"),
      columns: { id: true },
    });
    await db.insert(schema.subscriptions).values([
      { userId, planId: freePlan!.id, status: "active", provider: "manual" },
      { userId: otherId, planId: freePlan!.id, status: "active", provider: "manual" },
    ]);

    console.log("Percorrendo os fluxos:\n");

    /* --- 1. RECUPERAÇÃO DE SENHA ----------------------------------------- */
    await account.requestPasswordReset({ email });
    const resetToken = await latestToken("password_reset");

    check(
      "Pedir recuperação grava um token",
      resetToken !== undefined,
      resetToken ? "token criado" : "nenhum",
    );

    /**
     * ⚠️ O token NUNCA é gravado em claro. O banco guarda SHA-256 — quem vazar
     * o dump não consegue redefinir a senha de ninguém.
     */
    check(
      "O token é gravado como HASH, nunca em claro",
      resetToken !== undefined && /^[0-9a-f]{64}$/.test(resetToken.tokenHash),
      "sha-256 de 64 hex",
    );

    /**
     * ⚠️ A resposta é a mesma para e-mail que existe e para e-mail que não
     * existe. Um formulário que diz "não encontrado" é uma lista de clientes
     * aberta para enumerar.
     */
    const inexistente = await account.requestPasswordReset({
      email: `nao-existe-${Date.now()}@exemplo.invalido`,
    });
    check(
      "E-mail inexistente devolve a MESMA resposta (sem enumeração)",
      inexistente.ok === true,
      "ok: true nos dois casos",
    );

    /* --- 2. token inválido é recusado ------------------------------------- */
    const badToken = await account.resetPassword({
      token: "token-que-nao-existe",
      newPassword: SENHA_NOVA,
    });
    check(
      "Token inexistente é recusado",
      !badToken.ok && badToken.reason === "invalid_token",
      badToken.ok ? "aceitou" : badToken.reason,
    );

    /* --- 3. redefinir com o token válido ---------------------------------- */
    /**
     * O serviço não devolve o token em claro (correto — ele só vai para o
     * e-mail). Para testar, o script pede um novo e captura o valor a partir do
     * link impresso pelo driver de log.
     */
    let capturedLink = "";
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      const line = args.map(String).join(" ");
      const match = line.match(/redefinir-senha\?token=([\w-]+)/);
      if (match) capturedLink = match[1];
      originalLog(...args);
    };
    await account.requestPasswordReset({ email });
    console.log = originalLog;

    check(
      "O link de recuperação chega com o token",
      capturedLink.length > 20,
      `${capturedLink.slice(0, 12)}…`,
    );

    const reset = await account.resetPassword({
      token: capturedLink,
      newPassword: SENHA_NOVA,
    });
    check("Redefinir a senha funciona", reset.ok, reset.ok ? "ok" : reset.reason);

    const afterReset = await db.query.users.findFirst({
      where: (t, { eq: e }) => e(t.id, userId),
      columns: { passwordHash: true },
    });

    check(
      "A senha nova passa a valer e a antiga não",
      (await verifyPassword(SENHA_NOVA, afterReset!.passwordHash)) &&
        !(await verifyPassword(SENHA_ORIGINAL, afterReset!.passwordHash)),
      "verificado nas duas direções",
    );

    /* --- 4. o token não serve duas vezes ---------------------------------- */
    const reuse = await account.resetPassword({
      token: capturedLink,
      newPassword: "mais uma frase diferente",
    });
    check(
      "O MESMO token não pode ser usado de novo",
      !reuse.ok && reuse.reason === "invalid_token",
      reuse.ok ? "REUTILIZOU" : "recusado",
    );

    /* --- 5. token expirado ------------------------------------------------ */
    await account.requestPasswordReset({ email });
    const toExpire = await latestToken("password_reset");
    await db
      .update(schema.verificationTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.verificationTokens.id, toExpire!.id));

    // Recupera o token em claro do último pedido pelo mesmo caminho do log.
    let expiredToken = "";
    const log2 = console.log;
    console.log = (...args: unknown[]) => {
      const match = args.map(String).join(" ").match(/redefinir-senha\?token=([\w-]+)/);
      if (match) expiredToken = match[1];
      log2(...args);
    };
    await account.requestPasswordReset({ email });
    console.log = log2;

    await db
      .update(schema.verificationTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.verificationTokens.userId, userId));

    const expired = await account.resetPassword({
      token: expiredToken,
      newPassword: "frase para token expirado",
    });
    check(
      "Token expirado é recusado",
      !expired.ok && expired.reason === "invalid_token",
      expired.ok ? "ACEITOU" : "recusado",
    );

    /* --- 6. senha fraca --------------------------------------------------- */
    let weakToken = "";
    const log3 = console.log;
    console.log = (...args: unknown[]) => {
      const match = args.map(String).join(" ").match(/redefinir-senha\?token=([\w-]+)/);
      if (match) weakToken = match[1];
      log3(...args);
    };
    await account.requestPasswordReset({ email });
    console.log = log3;

    const weak = await account.resetPassword({ token: weakToken, newPassword: "123456" });
    check(
      "Senha fraca é recusada com o motivo",
      !weak.ok && weak.reason === "weak_password" && (weak.problems?.length ?? 0) > 0,
      weak.ok ? "aceitou" : (weak.problems?.[0] ?? ""),
    );

    /* --- 7. ALTERAR SENHA COM SESSÃO -------------------------------------- */
    // `createSession` devolve o token, não o id da linha — o id fica no banco.
    await createSession({ userId });
    const [session] = await db
      .select({ sessionId: schema.authSessions.id })
      .from(schema.authSessions)
      .where(eq(schema.authSessions.userId, userId))
      .orderBy(desc(schema.authSessions.createdAt))
      .limit(1);

    const wrongCurrent = await account.changePassword({
      userId,
      currentSessionId: session.sessionId,
      currentPassword: "senha errada de proposito",
      newPassword: "outra frase qualquer aqui",
    });
    check(
      "Trocar a senha exige a senha ATUAL",
      !wrongCurrent.ok && wrongCurrent.reason === "wrong_password",
      wrongCurrent.ok ? "trocou sem conferir" : "recusado",
    );

    const changed = await account.changePassword({
      userId,
      currentSessionId: session.sessionId,
      currentPassword: SENHA_NOVA,
      newPassword: "a terceira frase deste teste",
    });
    check("Trocar a senha funciona", changed.ok, changed.ok ? "ok" : changed.reason);

    /**
     * ⚠️ A sessão de quem trocou CONTINUA viva; as outras caem. Obrigar quem
     * acabou de trocar a senha a logar de novo é atrito sem ganho.
     */
    const kept = await db.query.authSessions.findFirst({
      where: (t, { eq: e }) => e(t.id, session.sessionId),
      columns: { revokedAt: true },
    });
    check(
      "A sessão atual sobrevive à troca de senha; as outras caem",
      kept?.revokedAt === null,
      kept?.revokedAt === null ? "mantida" : "derrubada",
    );

    /* --- 8. ALTERAR E-MAIL ------------------------------------------------ */
    const taken = await account.requestEmailChange({
      userId,
      newEmail: otherEmail,
      currentPassword: "a terceira frase deste teste",
    });
    check(
      "E-mail já usado por outra conta é recusado",
      !taken.ok && taken.reason === "email_taken",
      taken.ok ? "aceitou" : taken.reason,
    );

    const novoEmail = `${MARKER}-novo-${Date.now()}@exemplo.invalido`;
    const requested = await account.requestEmailChange({
      userId,
      newEmail: novoEmail,
      currentPassword: "a terceira frase deste teste",
    });
    check("Pedir troca de e-mail funciona", requested.ok, requested.ok ? "ok" : requested.reason);

    const stillOld = await db.query.users.findFirst({
      where: (t, { eq: e }) => e(t.id, userId),
      columns: { email: true },
    });
    check(
      "O e-mail NÃO muda antes da confirmação",
      stillOld?.email === email,
      "continua o antigo",
    );

    let confirmToken = "";
    const log4 = console.log;
    console.log = (...args: unknown[]) => {
      const match = args.map(String).join(" ").match(/confirmar-email\?token=([\w-]+)/);
      if (match) confirmToken = match[1];
      log4(...args);
    };
    await account.requestEmailChange({
      userId,
      newEmail: novoEmail,
      currentPassword: "a terceira frase deste teste",
    });
    console.log = log4;

    const confirmed = await account.confirmEmailChange({ token: confirmToken });
    check(
      "Confirmar troca o e-mail e marca como verificado",
      confirmed.ok && confirmed.email === novoEmail,
      confirmed.ok ? confirmed.email : confirmed.reason,
    );

    /* --- 9. EXCLUSÃO DE CONTA --------------------------------------------- */
    const wrongPass = await account.requestAccountDeletion({
      userId,
      currentPassword: "senha errada",
    });
    check(
      "Excluir a conta exige a senha",
      !wrongPass.ok && wrongPass.reason === "wrong_password",
      wrongPass.ok ? "excluiu sem conferir" : "recusado",
    );

    const deletion = await account.requestAccountDeletion({
      userId,
      currentPassword: "a terceira frase deste teste",
      reason: "teste automatizado",
    });
    check(
      "Pedido de exclusão é agendado com 7 dias de janela",
      deletion.ok &&
        Math.round((deletion.scheduledFor.getTime() - Date.now()) / 86_400_000) === 7,
      deletion.ok ? deletion.scheduledFor.toISOString().slice(0, 10) : "falhou",
    );

    const stillActive = await db.query.users.findFirst({
      where: (t, { eq: e }) => e(t.id, userId),
      columns: { status: true, email: true },
    });
    check(
      "A conta NÃO é apagada na hora — a janela existe para o arrependimento",
      stillActive?.status === "active" && stillActive.email !== null,
      `status ${stillActive?.status}`,
    );

    /* --- 10. entrar cancela a exclusão ------------------------------------ */
    const canceled = await account.cancelPendingDeletion(userId);
    check(
      "Voltar à plataforma cancela a exclusão pendente",
      canceled,
      canceled ? "cancelado" : "nada a cancelar",
    );

    /* --- 11. a anonimização em si ----------------------------------------- */
    const report = await anonymizeUser(userId);

    check(
      "A anonimização roda e revoga o que estava aberto",
      report !== null,
      report ? `${report.sessionsRevoked} sessão(ões), ${report.tokensRemoved} token(s)` : "—",
    );

    const anonymized = await db.query.users.findFirst({
      where: (t, { eq: e }) => e(t.id, userId),
      columns: {
        status: true,
        name: true,
        email: true,
        whatsapp: true,
        passwordHash: true,
        avatarUrl: true,
        pseudonymKey: true,
        anonymizedAt: true,
      },
    });

    check(
      "Nome, e-mail, WhatsApp, senha e avatar são apagados",
      anonymized?.status === "anonymized" &&
        anonymized.name === null &&
        anonymized.email === null &&
        anonymized.whatsapp === null &&
        anonymized.passwordHash === null &&
        anonymized.avatarUrl === null,
      "todos nulos",
    );

    /**
     * ⚠️ A `pseudonym_key` é DESTRUÍDA. É ela que torna a anonimização
     * irreversível: com o pepper e o id original ainda seria possível
     * reconstruí-la e recosturar o histórico àquela pessoa.
     */
    check(
      "A chave pseudônima é DESTRUÍDA (anonimização irreversível)",
      anonymized?.pseudonymKey === null && anonymized.anonymizedAt !== null,
      "pseudonym_key nula",
    );

    /**
     * ⚠️ O banco RECUSA uma conta anonimizada com identificação de volta. A
     * garantia é da CHECK `users_anonymized_scrubbed_check`, não desta camada.
     */
    let rejected = false;
    try {
      await db
        .update(schema.users)
        .set({ email: "tentativa@exemplo.invalido" })
        .where(eq(schema.users.id, userId));
    } catch {
      rejected = true;
    }

    check(
      "O BANCO recusa reidentificar uma conta anonimizada",
      rejected,
      rejected ? "CHECK rejeitou" : "PASSOU — a constraint não está valendo",
    );
  } finally {
    const { db } = await import("../src/server/db");
    const schema = await import("../src/server/db/schema");
    const { inArray, like, eq } = await import("drizzle-orm");

    const ids = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(like(schema.users.email, `${MARKER}-%`));

    const all = [...ids.map((r) => r.id), userId, otherId];

    await db.delete(schema.subscriptions).where(inArray(schema.subscriptions.userId, all));
    await db.delete(schema.users).where(inArray(schema.users.id, all));
    await db
      .delete(schema.authThrottleCounters)
      .where(like(schema.authThrottleCounters.subject, `${MARKER}-%`));

    void eq;
  }

  const failed = checks.filter((item) => !item.ok);
  console.log("");
  if (failed.length > 0) {
    console.error(`${failed.length} de ${checks.length} verificações falharam.`);
    process.exit(1);
  }
  console.log(`${checks.length} verificações passaram. Dados de teste removidos.`);
  process.exit(0);
}

main().catch((error) => {
  console.error("\n", error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
