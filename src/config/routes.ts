/**
 * Mapa de rotas e suas exigências de acesso.
 *
 * Fonte única para o `proxy.ts` e para os guards de servidor. Rota nova entra
 * AQUI: o padrão é ser privada, então esquecer de cadastrar uma rota pública a
 * torna protegida — que é o erro seguro. O contrário não é.
 */

/** Nome do cookie de sessão. `__Host-` exige HTTPS, path "/" e proíbe Domain. */
export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Host-aa_session" : "aa_session";

/** Rotas visíveis sem login. */
export const PUBLIC_ROUTES = [
  "/",
  "/como-funciona",
  "/planos",
  "/politica-de-privacidade",
  "/termos-de-uso",
] as const;

/** Rotas de autenticação — quem já está logado é mandado para a área do aluno. */
export const AUTH_ROUTES = [
  "/entrar",
  "/cadastrar",
  "/recuperar-senha",
  "/redefinir-senha",
  "/confirmar-email",
] as const;

/** Prefixo da área administrativa. Exige `role = "admin"`. */
export const ADMIN_ROUTE_PREFIX = "/admin";

/** Para onde cada perfil vai depois de entrar. */
export const AFTER_LOGIN_REDIRECT = "/inicio";
export const AFTER_ADMIN_LOGIN_REDIRECT = "/admin";
export const LOGIN_ROUTE = "/entrar";

export function isPublicRoute(pathname: string): boolean {
  return (
    PUBLIC_ROUTES.includes(pathname as (typeof PUBLIC_ROUTES)[number]) ||
    pathname.startsWith("/api/health")
  );
}

export function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function isAdminRoute(pathname: string): boolean {
  return pathname === ADMIN_ROUTE_PREFIX || pathname.startsWith(`${ADMIN_ROUTE_PREFIX}/`);
}
