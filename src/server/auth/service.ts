import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";

import { APP_TIMEZONE } from "@/config/app";
import { toCivilDate } from "@/modules/shared/dates";
import { db } from "@/server/db";
import {
  authThrottleCounters,
  subscriptions,
  userConsents,
  userFunnelProgress,
  users,
} from "@/server/db/schema";

import { cancelPendingDeletion } from "./account";
import { checkPasswordStrength, hashPassword, verifyPassword } from "./password";
import { createSession, setSessionCookie } from "./session";
import { pseudonymKey } from "./tokens";

/**
 * Orquestração de cadastro e login.
 *
 * É a camada que junta as peças puras (senha, sessão, pseudonimização) com o
 * banco. As regras ficam nas peças; aqui fica a ordem em que elas acontecem e
 * o que precisa ser atômico.
 */

export type AuthFailure =
  | "invalid_credentials"
  | "email_taken"
  | "account_suspended"
  | "google_only_account"
  | "rate_limited"
  | "weak_password"
  | "invalid_whatsapp"
  | "unknown";

export type AuthResult =
  | { ok: true; user: { id: string; role: "student" | "admin" } }
  | { ok: false; reason: AuthFailure; fieldErrors?: Record<string, string> };

/* ========================================================================== *
 * CADASTRO
 * ========================================================================== */

export type RegisterInput = {
  name: string;
  email: string;
  whatsapp: string;
  password: string;
};

export async function registerUser(input: RegisterInput): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const whatsapp = normalizeWhatsapp(input.whatsapp);

  if (whatsapp === null) {
    return { ok: false, reason: "invalid_whatsapp", fieldErrors: { whatsapp: "WhatsApp inválido. Use DDD e número." } };
  }

  const strength = checkPasswordStrength(input.password, { email, name: input.name });
  if (!strength.ok) {
    return {
      ok: false,
      reason: "weak_password",
      fieldErrors: { password: strength.problems[0] },
    };
  }

  const existing = await db.query.users.findFirst({
    where: (t, { eq: e }) => e(t.email, email),
    columns: { id: true },
  });

  if (existing) {
    return { ok: false, reason: "email_taken", fieldErrors: { email: "Já existe uma conta com este e-mail." } };
  }

  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  try {
    const userId = await db.transaction(async (tx) => {
      /**
       * O id é gerado AQUI, e não pelo banco, porque a chave pseudônima é um
       * HMAC dele e precisa ser gravada na mesma linha, na mesma inserção.
       */
      const id = crypto.randomUUID();
      const pseudonym = pseudonymKey(id);

      await tx.insert(users).values({
        id,
        name: input.name.trim(),
        email,
        whatsapp,
        passwordHash,
        passwordChangedAt: now,
        pseudonymKey: pseudonym,
        role: "student",
        status: "active",
        timezone: APP_TIMEZONE,
      });

      /**
       * Consentimento da LGPD, apontando para a VERSÃO de cada documento aceita.
       *
       * Sem a versão, "o usuário consentiu" é afirmação sem prova: não há como
       * dizer com o quê ele consentiu se o texto mudou depois.
       *
       * ⚠️ São DOIS registros, não um. O checkbox do cadastro diz "Li e aceito
       * a Política de Privacidade E os Termos de Uso" — gravar só a política
       * deixava metade da frase sem lastro. Corrigido em 25/08/2026, junto com
       * a criação da página de Termos, que até então dava 404.
       */
      const documents = await tx.query.legalDocuments.findMany({
        where: (t, { and: a, eq: e, inArray: i }) =>
          a(i(t.type, ["privacy", "terms"]), e(t.isCurrent, true)),
        columns: { id: true, type: true },
      });

      const currentOf = (type: "privacy" | "terms") =>
        documents.find((document) => document.type === type)?.id ?? null;

      const ipHash = await currentIpHash();
      const userAgent = await currentUserAgent();

      await tx.insert(userConsents).values([
        {
          userId: id,
          type: "privacy",
          legalDocumentId: currentOf("privacy"),
          granted: true,
          purpose:
            "Tratamento dos dados pessoais para prestação do serviço de estudo: " +
            "identificação, autenticação, montagem do plano de estudo e contato de suporte.",
          ipHash,
          userAgent,
        },
        {
          userId: id,
          type: "terms",
          legalDocumentId: currentOf("terms"),
          granted: true,
          purpose:
            "Aceite das condições de uso da plataforma: regras de conta, limites " +
            "do plano contratado, uso do acervo e encerramento do serviço.",
          ipHash,
          userAgent,
        },
      ]);

      /**
       * Todo usuário nasce com assinatura Free ativa.
       *
       * É o que torna "qual o plano deste aluno?" uma consulta sem caso
       * especial, e faz a métrica de upgrade ser a transição de uma linha para
       * outra em vez de a ausência de linha virar presença.
       */
      const freePlan = await tx.query.plans.findFirst({
        where: (t, { eq: e }) => e(t.code, "free"),
        columns: { id: true },
      });

      if (freePlan) {
        await tx.insert(subscriptions).values({
          userId: id,
          planId: freePlan.id,
          status: "active",
          provider: "manual",
          startedAt: now,
          changeNote: "Assinatura Free criada automaticamente no cadastro.",
        });
      }

      /**
       * Primeiro degrau do funil.
       *
       * Gravado AGORA, na mesma transação, e não por um job depois: dado de
       * funil não coletado no momento não é recuperável, e o painel do Marco 2
       * depende dele para saber quem se cadastrou e onde parou.
       */
      await tx.insert(userFunnelProgress).values({
        pseudonymKey: pseudonym,
        userId: id,
        signedUpAt: now,
        lastStageReached: "signed_up",
        lastStageReachedAt: now,
        lastActiveDate: toCivilDate(now, APP_TIMEZONE),
      });

      return id;
    });

    await startSessionFor(userId);
    return { ok: true, user: { id: userId, role: "student" } };
  } catch (error) {
    // Corrida entre dois cadastros com o mesmo e-mail: o índice único do banco
    // é quem decide, e o perdedor cai aqui.
    if (isUniqueViolation(error)) {
      return { ok: false, reason: "email_taken", fieldErrors: { email: "Já existe uma conta com este e-mail." } };
    }
    throw error;
  }
}

/* ========================================================================== *
 * LOGIN
 * ========================================================================== */

/** Tentativas antes de bloquear, por e-mail, por dia. */
const MAX_LOGIN_ATTEMPTS = 10;
const LOCK_MINUTES = 15;

export async function signIn(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const now = new Date();

  const throttle = await registerAttempt(email, now);
  if (throttle.locked) return { ok: false, reason: "rate_limited" };

  const user = await db.query.users.findFirst({
    where: (t, { eq: e }) => e(t.email, email),
    columns: { id: true, passwordHash: true, role: true, status: true },
  });

  /**
   * `verifyPassword` roda mesmo com usuário inexistente — ele faz um verify
   * falso nesse caso. Sem isso, e-mail que não existe responderia rápido e
   * e-mail que existe responderia devagar, e a diferença de tempo diria quem
   * tem conta na plataforma.
   */
  const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? null);

  if (!user || !passwordOk) {
    // Conta só-Google: a senha nunca vai bater, e dizer "senha incorreta"
    // mandaria a pessoa tentar recuperar uma senha que não existe.
    if (user && user.passwordHash === null) {
      return { ok: false, reason: "google_only_account" };
    }
    return { ok: false, reason: "invalid_credentials" };
  }

  if (user.status !== "active") {
    return { ok: false, reason: "account_suspended" };
  }

  await clearAttempts(email);

  /**
   * ENTRAR JÁ CANCELA A EXCLUSÃO PENDENTE.
   *
   * Exclusão de conta é irreversível e quase sempre feita com raiva. Sete dias
   * de janela só salvam quem se arrependeu se desistir for fácil — e nada é
   * mais fácil do que simplesmente voltar. Exigir que a pessoa ache um botão
   * escondido em Configurações transformaria arrependimento em labirinto.
   */
  await cancelPendingDeletion(user.id, now);

  await startSessionFor(user.id);
  await markFirstLogin(user.id, now);

  return { ok: true, user: { id: user.id, role: user.role } };
}

/* ========================================================================== *
 * APOIO
 * ========================================================================== */

async function startSessionFor(userId: string): Promise<void> {
  const session = await createSession({
    userId,
    ip: await currentIp(),
    userAgent: await currentUserAgent(),
  });
  await setSessionCookie(session.token, session.expiresAt);
}

async function markFirstLogin(userId: string, now: Date): Promise<void> {
  await db
    .update(users)
    .set({ firstLoginAt: now, lastSeenAt: now })
    .where(and(eq(users.id, userId), sql`${users.firstLoginAt} is null`));

  await db
    .update(userFunnelProgress)
    .set({ firstLoginAt: now })
    .where(
      and(
        eq(userFunnelProgress.userId, userId),
        sql`${userFunnelProgress.firstLoginAt} is null`,
      ),
    );
}

/**
 * Conta tentativas de login por e-mail, por dia.
 *
 * Sem isso, o formulário de login é um oráculo de força bruta: dá para testar
 * milhares de senhas contra um e-mail conhecido sem nenhum atrito.
 *
 * A contagem é por E-MAIL e não por IP de propósito — atacante troca de IP com
 * facilidade, e bloquear por IP puniria uma escola inteira atrás do mesmo NAT.
 */
async function registerAttempt(
  email: string,
  now: Date,
): Promise<{ locked: boolean }> {
  const windowDate = toCivilDate(now, APP_TIMEZONE);

  const [row] = await db
    .insert(authThrottleCounters)
    .values({
      subject: email,
      scope: "login",
      windowDate,
      attempts: 1,
      lastAttemptAt: now,
    })
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
    .returning({
      attempts: authThrottleCounters.attempts,
      lockedUntil: authThrottleCounters.lockedUntil,
    });

  if (row.lockedUntil && row.lockedUntil > now) return { locked: true };

  if (row.attempts > MAX_LOGIN_ATTEMPTS) {
    const lockedUntil = new Date(now.getTime() + LOCK_MINUTES * 60_000);
    await db
      .update(authThrottleCounters)
      .set({ lockedUntil })
      .where(
        and(
          eq(authThrottleCounters.subject, email),
          eq(authThrottleCounters.scope, "login"),
          eq(authThrottleCounters.windowDate, windowDate),
        ),
      );
    return { locked: true };
  }

  return { locked: false };
}

async function clearAttempts(email: string): Promise<void> {
  await db
    .delete(authThrottleCounters)
    .where(
      and(
        eq(authThrottleCounters.subject, email),
        eq(authThrottleCounters.scope, "login"),
      ),
    );
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Normaliza o WhatsApp para E.164.
 *
 * O aluno digita "(11) 99999-9999" ou "11999999999"; o banco exige
 * "+5511999999999" (há um CHECK garantindo o formato). Aceitar o que a pessoa
 * digita e normalizar aqui é melhor que exigir que ela formate.
 */
export function normalizeWhatsapp(input: string): string | null {
  const digits = input.replace(/\D/g, "");

  // Já veio com código do país.
  if (digits.length >= 12 && digits.startsWith("55")) {
    return `+${digits}`;
  }

  // DDD + número, com 8 ou 9 dígitos.
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }

  return null;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

/**
 * IP e user-agent para a trilha de auditoria do consentimento.
 *
 * ⚠️ NUNCA DERRUBAM O CADASTRO.
 *
 * `headers()` lança fora de um escopo de requisição — num script, numa tarefa
 * agendada, num teste. Sem o `catch`, o cadastro inteiro falharia por causa de
 * um campo OPCIONAL: a pessoa não conseguiria criar a conta porque não deu para
 * registrar o user-agent dela. A prioridade é o inverso — a conta e o
 * consentimento importam, o metadado é reforço.
 *
 * Descoberto ao escrever a verificação do consentimento, que chama
 * `registerUser` direto e não tem requisição em volta.
 */
async function requestHeaders(): Promise<Headers | null> {
  try {
    return await headers();
  } catch {
    return null;
  }
}

async function currentIp(): Promise<string | null> {
  const store = await requestHeaders();
  if (!store) return null;

  const forwarded = store.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return store.get("x-real-ip");
}

async function currentIpHash(): Promise<string | null> {
  const ip = await currentIp();
  if (!ip) return null;
  const { hashIp } = await import("./tokens");
  return hashIp(ip);
}

async function currentUserAgent(): Promise<string | null> {
  const store = await requestHeaders();
  return store?.get("user-agent")?.slice(0, 500) ?? null;
}
