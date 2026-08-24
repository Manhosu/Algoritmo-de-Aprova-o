import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { APP_TIMEZONE } from "@/config/app";
import { env } from "@/config/env";
import { toCivilDate } from "@/modules/shared/dates";
import { db } from "@/server/db";
import {
  authThrottleCounters,
  dataDeletionRequests,
  users,
  verificationTokens,
} from "@/server/db/schema";
import {
  accountDeletionScheduledEmail,
  emailChangeEmail,
  emailChangeNoticeEmail,
  passwordChangedEmail,
  passwordResetEmail,
  sendEmail,
} from "@/server/email/send";

import { checkPasswordStrength, hashPassword, verifyPassword } from "./password";
import { revokeAllSessions } from "./session";
import { expiresAt, generateToken, hashToken, isExpired, TOKEN_LIFETIMES } from "./tokens";

/**
 * GESTÃO DA CONTA — item 12 do checklist de aceite do Marco 1.
 * ============================================================================
 *
 * Recuperação de senha, alteração de senha, alteração de e-mail e exclusão de
 * conta.
 *
 * TRÊS REGRAS ATRAVESSAM TUDO AQUI
 * ----------------------------------------------------------------------------
 * 1. NENHUMA RESPOSTA REVELA SE UM E-MAIL EXISTE. "Se houver conta, enviamos"
 *    é a mesma frase para quem tem e para quem não tem. Um formulário que
 *    responde "e-mail não encontrado" é uma lista de clientes aberta para
 *    qualquer um enumerar.
 *
 * 2. TOKEN NUNCA É GRAVADO EM CLARO. O banco guarda SHA-256; quem vazar o dump
 *    não consegue redefinir a senha de ninguém. Isso vale mesmo com validade
 *    curta — vazamento e uso não são simultâneos.
 *
 * 3. TODA MUDANÇA SENSÍVEL DERRUBA AS OUTRAS SESSÕES. Trocar a senha porque
 *    "achei que alguém entrou" não serve para nada se a sessão do invasor
 *    continuar ativa.
 */

const MAX_RESET_REQUESTS_PER_DAY = 5;

/* ========================================================================== *
 * 1. RECUPERAÇÃO DE SENHA
 * ========================================================================== */

/**
 * Sempre devolve o mesmo resultado, exista a conta ou não.
 *
 * A tela mostra "se houver uma conta com esse e-mail, enviamos o link" nos dois
 * casos. Sem isso, o formulário vira um verificador de cadastro: basta digitar
 * e-mails e ver quais respondem "enviado".
 */
export async function requestPasswordReset(input: {
  email: string;
  ipHash?: string | null;
  now?: Date;
}): Promise<{ ok: true }> {
  const now = input.now ?? new Date();
  const email = input.email.trim().toLowerCase();

  // Limite por e-mail: sem ele, o formulário é um canhão de spam apontado para
  // a caixa de entrada de terceiros — e queima a reputação do domínio de envio.
  const throttled = await consumeQuota(email, "password_reset", MAX_RESET_REQUESTS_PER_DAY, now);
  if (throttled) return { ok: true };

  const user = await db.query.users.findFirst({
    where: (t, { and: a, eq: e, isNull: n }) =>
      a(e(t.email, email), e(t.status, "active"), n(t.deletedAt)),
    columns: { id: true, email: true, name: true },
  });

  if (!user?.email) return { ok: true };

  const token = generateToken();

  /**
   * Invalida os pedidos anteriores.
   *
   * Quem clica três vezes em "esqueci a senha" tem três e-mails na caixa e vai
   * abrir qualquer um deles. Deixar os três válidos multiplica por três a
   * janela de um link vazado, sem nenhum ganho.
   */
  await db
    .update(verificationTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(verificationTokens.userId, user.id),
        eq(verificationTokens.type, "password_reset"),
        isNull(verificationTokens.usedAt),
      ),
    );

  await db.insert(verificationTokens).values({
    userId: user.id,
    type: "password_reset",
    tokenHash: token.tokenHash,
    expiresAt: expiresAt(TOKEN_LIFETIMES.passwordReset, now),
    requestedIpHash: input.ipHash ?? null,
  });

  const link = `${env.APP_URL}/redefinir-senha?token=${token.token}`;
  const message = passwordResetEmail(link, TOKEN_LIFETIMES.passwordReset / 60_000);

  await sendEmail({ to: user.email, subject: message.subject, text: message.text });

  return { ok: true };
}

export type ResetPasswordResult =
  | { ok: true }
  | { ok: false; reason: "invalid_token" | "weak_password"; problems?: string[] };

/**
 * Redefine a senha a partir do token do e-mail.
 *
 * O token é consumido na MESMA transação que grava a senha. Marcar como usado
 * depois deixaria uma janela em que dois cliques simultâneos redefinem duas
 * vezes — e o segundo venceria, possivelmente com a senha de outra pessoa.
 */
export async function resetPassword(input: {
  token: string;
  newPassword: string;
  now?: Date;
}): Promise<ResetPasswordResult> {
  const now = input.now ?? new Date();

  const record = await db.query.verificationTokens.findFirst({
    where: (t, { and: a, eq: e, isNull: n }) =>
      a(e(t.tokenHash, hashToken(input.token)), e(t.type, "password_reset"), n(t.usedAt)),
    columns: { id: true, userId: true, expiresAt: true },
  });

  if (!record || isExpired(record.expiresAt, now)) {
    return { ok: false, reason: "invalid_token" };
  }

  const user = await db.query.users.findFirst({
    where: (t, { eq: e }) => e(t.id, record.userId),
    columns: { email: true, name: true },
  });

  const strength = checkPasswordStrength(input.newPassword, {
    email: user?.email ?? undefined,
    name: user?.name ?? undefined,
  });

  if (!strength.ok) {
    return { ok: false, reason: "weak_password", problems: strength.problems };
  }

  const passwordHash = await hashPassword(input.newPassword);

  await db.transaction(async (tx) => {
    await tx
      .update(verificationTokens)
      .set({ usedAt: now })
      .where(eq(verificationTokens.id, record.id));

    await tx
      .update(users)
      .set({ passwordHash, updatedAt: now })
      .where(eq(users.id, record.userId));
  });

  /**
   * Todas as sessões caem, inclusive a de quem pediu.
   *
   * Quem redefine a senha costuma estar reagindo a uma suspeita. Manter as
   * sessões abertas anularia exatamente o que ele quis fazer — e a nossa
   * sessão é de banco justamente para que revogar seja imediato.
   */
  await revokeAllSessions(record.userId, "password_reset");

  if (user?.email) {
    const message = passwordChangedEmail();
    await sendEmail({ to: user.email, subject: message.subject, text: message.text });
  }

  return { ok: true };
}

/* ========================================================================== *
 * 2. ALTERAÇÃO DE SENHA (com o aluno logado)
 * ========================================================================== */

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; reason: "wrong_password" | "weak_password"; problems?: string[] };

/**
 * Troca a senha de quem está logado.
 *
 * Exige a senha ATUAL. Sem isso, um notebook aberto na padaria vira uma conta
 * roubada em dois cliques — e a sessão sozinha não prova que quem está ali é o
 * dono.
 */
export async function changePassword(input: {
  userId: string;
  currentSessionId: string;
  currentPassword: string;
  newPassword: string;
  now?: Date;
}): Promise<ChangePasswordResult> {
  const now = input.now ?? new Date();

  const user = await db.query.users.findFirst({
    where: (t, { eq: e }) => e(t.id, input.userId),
    columns: { id: true, email: true, name: true, passwordHash: true },
  });

  if (!user) return { ok: false, reason: "wrong_password" };

  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) return { ok: false, reason: "wrong_password" };

  const strength = checkPasswordStrength(input.newPassword, {
    email: user.email ?? undefined,
    name: user.name ?? undefined,
  });

  if (!strength.ok) {
    return { ok: false, reason: "weak_password", problems: strength.problems };
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(input.newPassword), updatedAt: now })
    .where(eq(users.id, input.userId));

  // Derruba as OUTRAS sessões e mantém esta: obrigar quem acabou de trocar a
  // senha a logar de novo é atrito sem ganho de segurança.
  await revokeAllSessions(input.userId, "password_changed", input.currentSessionId);

  if (user.email) {
    const message = passwordChangedEmail();
    await sendEmail({ to: user.email, subject: message.subject, text: message.text });
  }

  return { ok: true };
}

/* ========================================================================== *
 * 3. ALTERAÇÃO DE E-MAIL
 * ========================================================================== */

export type ChangeEmailResult =
  | { ok: true }
  | { ok: false; reason: "wrong_password" | "email_taken" | "same_email" };

/**
 * Pede a troca de e-mail. Nada muda até a confirmação no endereço NOVO.
 *
 * Dois e-mails saem daqui, e o segundo é o que importa:
 *
 *   • ao endereço NOVO, o link de confirmação — prova que ele existe e é do
 *     aluno;
 *   • ao endereço ANTIGO, um AVISO — porque quem invade uma conta troca o
 *     e-mail primeiro, e sem esse aviso o dono só descobre quando já não tem
 *     como recuperar.
 */
export async function requestEmailChange(input: {
  userId: string;
  newEmail: string;
  currentPassword: string;
  now?: Date;
}): Promise<ChangeEmailResult> {
  const now = input.now ?? new Date();
  const newEmail = input.newEmail.trim().toLowerCase();

  const user = await db.query.users.findFirst({
    where: (t, { eq: e }) => e(t.id, input.userId),
    columns: { id: true, email: true, passwordHash: true },
  });

  if (!user) return { ok: false, reason: "wrong_password" };
  if (user.email === newEmail) return { ok: false, reason: "same_email" };

  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) return { ok: false, reason: "wrong_password" };

  /**
   * O e-mail já pertence a outra conta.
   *
   * Aqui a resposta PODE ser específica, ao contrário do "esqueci minha senha":
   * quem chegou até aqui já provou a senha da própria conta, então não há
   * enumeração a proteger — e "e-mail indisponível" é a única informação que
   * permite ao aluno resolver o problema.
   */
  const taken = await db.query.users.findFirst({
    where: (t, { and: a, eq: e, isNull: n }) => a(e(t.email, newEmail), n(t.deletedAt)),
    columns: { id: true },
  });

  if (taken) return { ok: false, reason: "email_taken" };

  const token = generateToken();

  await db
    .update(verificationTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(verificationTokens.userId, user.id),
        eq(verificationTokens.type, "email_change"),
        isNull(verificationTokens.usedAt),
      ),
    );

  await db.insert(verificationTokens).values({
    userId: user.id,
    type: "email_change",
    tokenHash: token.tokenHash,
    newEmail,
    expiresAt: expiresAt(TOKEN_LIFETIMES.emailChange, now),
  });

  const link = `${env.APP_URL}/confirmar-email?token=${token.token}`;
  const confirmation = emailChangeEmail(link, TOKEN_LIFETIMES.emailChange / 3_600_000);
  await sendEmail({ to: newEmail, subject: confirmation.subject, text: confirmation.text });

  if (user.email) {
    const notice = emailChangeNoticeEmail(newEmail);
    await sendEmail({ to: user.email, subject: notice.subject, text: notice.text });
  }

  return { ok: true };
}

export type ConfirmEmailResult =
  | { ok: true; email: string }
  | { ok: false; reason: "invalid_token" | "email_taken" };

export async function confirmEmailChange(input: {
  token: string;
  now?: Date;
}): Promise<ConfirmEmailResult> {
  const now = input.now ?? new Date();

  const record = await db.query.verificationTokens.findFirst({
    where: (t, { and: a, eq: e, isNull: n }) =>
      a(e(t.tokenHash, hashToken(input.token)), e(t.type, "email_change"), n(t.usedAt)),
    columns: { id: true, userId: true, newEmail: true, expiresAt: true },
  });

  if (!record?.newEmail || isExpired(record.expiresAt, now)) {
    return { ok: false, reason: "invalid_token" };
  }

  // Confere de novo na hora de aplicar: entre o pedido e a confirmação alguém
  // pode ter cadastrado esse e-mail.
  const taken = await db.query.users.findFirst({
    where: (t, { and: a, eq: e, isNull: n }) =>
      a(e(t.email, record.newEmail!), n(t.deletedAt)),
    columns: { id: true },
  });

  if (taken) return { ok: false, reason: "email_taken" };

  await db.transaction(async (tx) => {
    await tx
      .update(verificationTokens)
      .set({ usedAt: now })
      .where(eq(verificationTokens.id, record.id));

    await tx
      .update(users)
      .set({
        email: record.newEmail,
        // O endereço novo acabou de provar que existe e é acessível: é
        // exatamente o que a verificação de e-mail comprova.
        emailVerifiedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, record.userId));
  });

  await revokeAllSessions(record.userId, "email_changed");

  return { ok: true, email: record.newEmail };
}

/* ========================================================================== *
 * 4. EXCLUSÃO DE CONTA
 * ========================================================================== */

/** Janela de arrependimento antes da execução. */
const DELETION_GRACE_DAYS = 7;

export type DeleteAccountResult =
  | { ok: true; scheduledFor: Date }
  | { ok: false; reason: "wrong_password" | "already_requested" };

/**
 * Agenda a exclusão da conta.
 *
 * NÃO APAGA NA HORA, e isso é decisão de produto, não preguiça: exclusão é
 * irreversível e frequentemente feita com raiva. Sete dias de janela salvam a
 * conta de quem se arrependeu no dia seguinte, e o simples ato de entrar na
 * plataforma cancela — sem formulário, sem suporte, sem pedir nada.
 *
 * A execução em si (`executeAccountDeletion`) faz PSEUDONIMIZAÇÃO, não DELETE:
 * apagar a linha levaria junto o histórico do funil e as métricas da turma, e
 * derrubaria o registro financeiro que tem prazo de guarda legal.
 */
export async function requestAccountDeletion(input: {
  userId: string;
  currentPassword: string;
  reason?: string | null;
  now?: Date;
}): Promise<DeleteAccountResult> {
  const now = input.now ?? new Date();

  const user = await db.query.users.findFirst({
    where: (t, { eq: e }) => e(t.id, input.userId),
    columns: { id: true, email: true, passwordHash: true },
  });

  if (!user) return { ok: false, reason: "wrong_password" };

  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) return { ok: false, reason: "wrong_password" };

  const pending = await db.query.dataDeletionRequests.findFirst({
    where: (t, { and: a, eq: e }) => a(e(t.userId, input.userId), e(t.status, "pending")),
    columns: { id: true },
  });

  if (pending) return { ok: false, reason: "already_requested" };

  const scheduledFor = new Date(now.getTime() + DELETION_GRACE_DAYS * 86_400_000);

  await db.insert(dataDeletionRequests).values({
    userId: input.userId,
    status: "pending",
    reason: input.reason ?? null,
    requestedAt: now,
    scheduledFor,
  });

  // Derruba tudo: o aluno pediu para sair, e continuar logado em cinco
  // aparelhos contradiz o pedido.
  await revokeAllSessions(input.userId, "deletion_requested");

  if (user.email) {
    const message = accountDeletionScheduledEmail(scheduledFor);
    await sendEmail({ to: user.email, subject: message.subject, text: message.text });
  }

  return { ok: true, scheduledFor };
}

/**
 * Cancela a exclusão pendente.
 *
 * Chamado no login: entrar na plataforma JÁ é o cancelamento. Exigir que a
 * pessoa encontre um botão escondido em Configurações para desistir seria
 * transformar arrependimento em labirinto.
 */
export async function cancelPendingDeletion(userId: string, now = new Date()): Promise<boolean> {
  const result = await db
    .update(dataDeletionRequests)
    .set({ status: "canceled", canceledAt: now, updatedAt: now })
    .where(
      and(
        eq(dataDeletionRequests.userId, userId),
        eq(dataDeletionRequests.status, "pending"),
      ),
    );

  return result.count > 0;
}

export type PendingDeletion = { scheduledFor: Date } | null;

export async function getPendingDeletion(userId: string): Promise<PendingDeletion> {
  const row = await db.query.dataDeletionRequests.findFirst({
    where: (t, { and: a, eq: e }) => a(e(t.userId, userId), e(t.status, "pending")),
    columns: { scheduledFor: true },
  });

  return row ? { scheduledFor: row.scheduledFor } : null;
}

/* ========================================================================== *
 * COTA
 * ========================================================================== */

/**
 * Limita pedidos por e-mail por dia. Devolve `true` quando estourou.
 *
 * Reaproveita `auth_throttle_counters`, a mesma tabela do login, com `scope`
 * diferente — a regra é a mesma ("quantas vezes este assunto tentou hoje") e
 * duplicar a estrutura só criaria duas implementações para divergirem.
 */
async function consumeQuota(
  subject: string,
  scope: string,
  max: number,
  now: Date,
): Promise<boolean> {
  const windowDate = toCivilDate(now, APP_TIMEZONE);

  const [row] = await db
    .insert(authThrottleCounters)
    .values({ subject, scope, windowDate, attempts: 1, lastAttemptAt: now })
    .onConflictDoUpdate({
      target: [
        authThrottleCounters.subject,
        authThrottleCounters.scope,
        authThrottleCounters.windowDate,
      ],
      set: {
        attempts: sql`${authThrottleCounters.attempts} + 1`,
        lastAttemptAt: now,
      },
    })
    .returning({ attempts: authThrottleCounters.attempts });

  return (row?.attempts ?? 0) > max;
}
