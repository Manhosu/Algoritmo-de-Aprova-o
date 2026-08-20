import "server-only";

import { redirect } from "next/navigation";

import { AFTER_LOGIN_REDIRECT, LOGIN_ROUTE } from "@/config/routes";

import { getCurrentSession, type ActiveSession, type SessionUser } from "./session";

/**
 * GUARDS DE AUTORIZAÇÃO
 * ============================================================================
 *
 * ⚠️ ESTA É A AUTORIZAÇÃO DE VERDADE. O `proxy.ts` só redireciona quem não tem
 * cookie — ele não sabe se o cookie é válido, de quem é, nem se a pessoa é
 * administradora.
 *
 * A própria documentação do Next.js 16 avisa que Server Functions podem escapar
 * do matcher do proxy, e que a autorização precisa ser verificada dentro de
 * cada rota. Portanto:
 *
 *   TODA página protegida, TODA rota de API e TODA Server Action começa
 *   chamando um destes guards. Sem exceção.
 *
 * Confiar só no proxy é falsa sensação de proteção.
 */

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "Autenticação necessária.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "Você não tem permissão para acessar isto.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/* ========================================================================== *
 * PARA PÁGINAS (redirecionam)
 * ========================================================================== */

/**
 * Exige aluno autenticado numa página. Redireciona para o login se não houver.
 *
 * `nextPath` preserva o destino, para o aluno voltar onde estava tentando
 * entrar depois de logar.
 */
export async function requireUser(nextPath?: string): Promise<ActiveSession> {
  const session = await getCurrentSession();
  if (!session) {
    const target = nextPath
      ? `${LOGIN_ROUTE}?proximo=${encodeURIComponent(nextPath)}`
      : LOGIN_ROUTE;
    redirect(target);
  }
  return session;
}

/**
 * Exige administrador numa página.
 *
 * Quem não é admin recebe REDIRECIONAMENTO para a área do aluno, não um 403.
 * A área administrativa não deve nem confirmar que existe para quem não é da
 * equipe — um 403 confirma.
 */
export async function requireAdmin(): Promise<ActiveSession> {
  const session = await getCurrentSession();
  if (!session) redirect(LOGIN_ROUTE);
  if (session.user.role !== "admin") redirect(AFTER_LOGIN_REDIRECT);
  return session;
}

/** Para páginas de login e cadastro: quem já está logado não deve vê-las. */
export async function redirectIfAuthenticated(): Promise<void> {
  const session = await getCurrentSession();
  if (session) redirect(AFTER_LOGIN_REDIRECT);
}

/* ========================================================================== *
 * PARA ROTAS DE API E SERVER ACTIONS (lançam)
 * ========================================================================== */

/**
 * Exige autenticação numa rota de API.
 *
 * Lança em vez de redirecionar: um cliente de API não sabe o que fazer com um
 * 302 para uma página HTML de login. O handler converte em 401 JSON.
 */
export async function requireApiUser(): Promise<ActiveSession> {
  const session = await getCurrentSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

export async function requireApiAdmin(): Promise<ActiveSession> {
  const session = await requireApiUser();
  if (session.user.role !== "admin") throw new ForbiddenError();
  return session;
}

/* ========================================================================== *
 * PROPRIEDADE DE RECURSO
 * ========================================================================== */

/**
 * Confere se o recurso pertence a quem está pedindo.
 *
 * A CHECAGEM QUE MAIS SE ESQUECE. Autenticar responde "quem é você"; isto
 * responde "isto é seu". Sem ela, um aluno autenticado troca o id na URL e lê
 * a preparação de outro — e a falha é invisível em teste, porque em
 * desenvolvimento normalmente só existe um usuário.
 *
 * Administrador passa: o painel precisa acessar o edital de qualquer aluno
 * (README 2.6).
 */
export function assertOwnership(
  user: SessionUser,
  resourceOwnerId: string | null | undefined,
): void {
  if (user.role === "admin") return;
  if (!resourceOwnerId || resourceOwnerId !== user.id) {
    // Mensagem idêntica à de "não encontrado" de propósito: distinguir
    // "não é seu" de "não existe" confirma a existência do recurso.
    throw new ForbiddenError("Recurso não encontrado.");
  }
}

/** Versão que devolve booleano, para quando o chamador quer decidir. */
export function ownsResource(
  user: SessionUser,
  resourceOwnerId: string | null | undefined,
): boolean {
  if (user.role === "admin") return true;
  return Boolean(resourceOwnerId) && resourceOwnerId === user.id;
}

/* ========================================================================== *
 * CSRF PARA ROTAS PRÓPRIAS
 * ========================================================================== */

/**
 * Confere a origem de uma requisição que muda estado.
 *
 * `sameSite=lax` no cookie já barra o grosso do CSRF, e Server Actions do
 * Next.js checam origem por conta própria. Esta função é a segunda trava para
 * as rotas de API que escrevemos à mão — defesa em profundidade custa três
 * linhas aqui.
 *
 * Requisição sem `Origin` nem `Referer` é recusada: navegador moderno sempre
 * manda pelo menos um dos dois em POST.
 */
export function assertSameOrigin(request: Request, allowedOrigin: string): void {
  if (request.method === "GET" || request.method === "HEAD") return;

  const origin = request.headers.get("origin");
  if (origin) {
    if (origin !== allowedOrigin) {
      throw new ForbiddenError("Origem não permitida.");
    }
    return;
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      if (new URL(referer).origin !== allowedOrigin) {
        throw new ForbiddenError("Origem não permitida.");
      }
      return;
    } catch {
      throw new ForbiddenError("Origem não permitida.");
    }
  }

  throw new ForbiddenError("Origem não informada.");
}
