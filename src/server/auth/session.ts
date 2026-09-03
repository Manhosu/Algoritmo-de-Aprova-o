import "server-only";

import { and, eq, isNull, lt, or } from "drizzle-orm";
import { cookies } from "next/headers";

import { isProduction } from "@/config/env";
import { SESSION_COOKIE_NAME } from "@/config/routes";
import { db } from "@/server/db";
import { authSessions, users } from "@/server/db/schema";

import {
  expiresAt,
  generateToken,
  hashIp,
  hashToken,
  isExpired,
  TOKEN_LIFETIMES,
} from "./tokens";

/**
 * SESSÃO DE LOGIN
 * ============================================================================
 *
 * Sessão em BANCO, não em JWT. A decisão está registrada no PROGRESSO (33) e o
 * motivo é concreto: o Marco 1 exige "exclusão de conta com remoção efetiva" e
 * "sessões protegidas". Com JWT, o token continua valendo até expirar mesmo
 * depois de o titular pedir exclusão — não há o que revogar do lado do
 * servidor.
 *
 * O que isto entrega e o JWT não entregaria:
 *   • derrubar o acesso na hora do pedido de exclusão;
 *   • encerrar todas as sessões ao trocar a senha;
 *   • mostrar ao aluno onde ele está logado.
 *
 * O token nunca é gravado em claro — só o SHA-256 dele.
 *
 * ⚠️ NÃO confundir com `usage_sessions`, que mede permanência na plataforma
 * para o card "Horas Estudadas". Aquela dura minutos; esta dura semanas.
 */

export type SessionUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: "student" | "admin";
  status: "active" | "suspended" | "anonymized";
  timezone: string;
  avatarUrl: string | null;
  /** Mostra o primeiro nome dele no Ranking? Ver a nota em `engine/ranking`. */
  showNameInRanking: boolean;
};

export type ActiveSession = {
  sessionId: string;
  user: SessionUser;
  expiresAt: Date;
};

/**
 * Renova a sessão quando falta menos de um terço da validade.
 *
 * Escrever no banco a cada requisição seria caro e inútil; nunca renovar
 * deslogaria o aluno ativo no meio do estudo. O terço é o meio-termo: quem usa
 * a plataforma não é interrompido, e a linha é atualizada raramente.
 */
const RENEW_THRESHOLD_MS = TOKEN_LIFETIMES.session / 3;

export type CreateSessionInput = {
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
};

export async function createSession(input: CreateSessionInput): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const now = input.now ?? new Date();
  const { token, tokenHash } = generateToken();
  const expiry = expiresAt(TOKEN_LIFETIMES.session, now);

  await db.insert(authSessions).values({
    userId: input.userId,
    tokenHash,
    expiresAt: expiry,
    lastUsedAt: now,
    ipHash: input.ip ? hashIp(input.ip) : null,
    userAgent: input.userAgent?.slice(0, 500) ?? null,
  });

  return { token, expiresAt: expiry };
}

/**
 * Resolve a sessão a partir do token.
 *
 * Devolve `null` para qualquer motivo de invalidez — expirada, revogada, conta
 * suspensa ou anonimizada. Quem chama não precisa distinguir: em todos os casos
 * a resposta ao usuário é a mesma.
 */
export async function resolveSession(
  token: string,
  options: { now?: Date; touch?: boolean } = {},
): Promise<ActiveSession | null> {
  const now = options.now ?? new Date();
  const tokenHash = hashToken(token);

  const rows = await db
    .select({
      sessionId: authSessions.id,
      expiresAt: authSessions.expiresAt,
      revokedAt: authSessions.revokedAt,
      lastUsedAt: authSessions.lastUsedAt,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      timezone: users.timezone,
      avatarUrl: users.avatarUrl,
      showNameInRanking: users.showNameInRanking,
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(eq(authSessions.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.revokedAt !== null) return null;
  if (isExpired(row.expiresAt, now)) return null;

  // Conta suspensa ou anonimizada não tem sessão válida, mesmo com token bom.
  // É o que faz a exclusão de conta derrubar o acesso imediatamente.
  if (row.status !== "active") return null;

  let expiry = row.expiresAt;

  if (options.touch !== false) {
    const remaining = row.expiresAt.getTime() - now.getTime();
    if (remaining < RENEW_THRESHOLD_MS) {
      expiry = expiresAt(TOKEN_LIFETIMES.session, now);
      await db
        .update(authSessions)
        .set({ lastUsedAt: now, expiresAt: expiry })
        .where(eq(authSessions.id, row.sessionId));
    }
  }

  return {
    sessionId: row.sessionId,
    expiresAt: expiry,
    user: {
      id: row.userId,
      name: row.name,
      email: row.email,
      role: row.role,
      status: row.status,
      timezone: row.timezone,
      showNameInRanking: row.showNameInRanking,
      avatarUrl: row.avatarUrl,
    },
  };
}

/* ========================================================================== *
 * REVOGAÇÃO
 * ========================================================================== */

export async function revokeSession(sessionId: string, reason: string): Promise<void> {
  await db
    .update(authSessions)
    .set({ revokedAt: new Date(), revokedReason: reason.slice(0, 64) })
    .where(and(eq(authSessions.id, sessionId), isNull(authSessions.revokedAt)));
}

/**
 * Derruba todas as sessões de um usuário.
 *
 * Chamado na troca de senha, na exclusão de conta e quando um administrador
 * suspende alguém. `exceptSessionId` permite manter a sessão atual viva na
 * troca de senha — deslogar a pessoa do próprio dispositivo logo depois de ela
 * trocar a senha é hostil sem motivo.
 */
export async function revokeAllSessions(
  userId: string,
  reason: string,
  exceptSessionId?: string,
): Promise<number> {
  const conditions = [eq(authSessions.userId, userId), isNull(authSessions.revokedAt)];

  const revoked = await db
    .update(authSessions)
    .set({ revokedAt: new Date(), revokedReason: reason.slice(0, 64) })
    .where(and(...conditions))
    .returning({ id: authSessions.id });

  if (exceptSessionId) {
    const kept = revoked.find((session) => session.id === exceptSessionId);
    if (kept) {
      await db
        .update(authSessions)
        .set({ revokedAt: null, revokedReason: null })
        .where(eq(authSessions.id, exceptSessionId));
      return revoked.length - 1;
    }
  }

  return revoked.length;
}

/**
 * Limpeza de sessões mortas.
 *
 * Rodada pela rotina de manutenção. Sessão expirada não é risco de segurança —
 * `resolveSession` já a recusa —, mas acumular linhas inúteis engorda o índice
 * e o backup.
 */
export async function purgeDeadSessions(olderThan: Date): Promise<number> {
  const deleted = await db
    .delete(authSessions)
    .where(
      or(
        lt(authSessions.expiresAt, olderThan),
        and(isNull(authSessions.revokedAt), lt(authSessions.expiresAt, olderThan)),
      ),
    )
    .returning({ id: authSessions.id });

  return deleted.length;
}

/* ========================================================================== *
 * COOKIE
 * ========================================================================== */

/**
 * Atributos do cookie de sessão.
 *
 *   httpOnly  — JavaScript não lê. Um XSS não rouba a sessão.
 *   secure    — só trafega em HTTPS (desligado em dev, onde não há HTTPS).
 *   sameSite  — "lax" bloqueia CSRF em POST cross-site e ainda permite o
 *               retorno do OAuth do Google, que chega por navegação GET.
 *   path "/"  — exigido pelo prefixo __Host-.
 *
 * O nome ganha o prefixo `__Host-` em produção (ver `config/routes.ts`): o
 * navegador então recusa o cookie se não vier com secure, path "/" e sem
 * Domain — o que impede um subdomínio comprometido de fixar sessão.
 */
export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

export async function setSessionCookie(token: string, expires: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(expires));
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions(new Date(0)),
    maxAge: 0,
  });
}

export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value ?? null;
}

/** Sessão atual, ou `null`. Não redireciona — quem decide isso é o guard. */
export async function getCurrentSession(): Promise<ActiveSession | null> {
  const token = await readSessionToken();
  if (!token) return null;
  return resolveSession(token);
}
