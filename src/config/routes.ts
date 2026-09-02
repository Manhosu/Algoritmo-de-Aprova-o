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

/**
 * Prefixos da área do aluno.
 *
 * ⚠️ POR QUE ISTO EXISTE, E O QUE MUDOU EM 25/08/2026
 * ----------------------------------------------------------------------------
 * Antes o proxy tratava QUALQUER rota fora da lista pública como privada. A
 * intenção era boa — esquecer de cadastrar uma pública a tornava protegida, que
 * é o erro seguro. Mas tinha um efeito ruim e concreto: um endereço com erro de
 * digitação levava um visitante anônimo para a tela de login em vez de para uma
 * página de "não encontrada". Como a cliente divulga links por WhatsApp, um
 * caractere a mais transformava um curioso numa pessoa diante de um cadastro
 * que ela não pediu.
 *
 * Agora o proxy guarda estes prefixos, e o que não está em lista nenhuma segue
 * para o Next — que responde 404.
 *
 * A troca é segura porque o proxy NUNCA foi a proteção principal: o layout de
 * `(app)` e TODAS as páginas de lá chamam `requireUser`/`getStudentContext` por
 * conta própria. O proxy é defesa em profundidade, e continua sendo.
 */
export const PRIVATE_ROUTE_PREFIXES = [
  "/inicio",
  "/boas-vindas",
  "/preparacoes",
  "/questoes",
  "/revisoes",
  "/cronograma",
  "/configuracoes",
  "/perfil",
  "/suporte",
  "/ajuda",
  "/notificacoes",
  "/estudos",
  "/entenda-o-algoritmo",
  "/trilhas",
  "/ranking",
  "/loja",
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

/**
 * A rota pertence à área do aluno?
 *
 * ⚠️ Rota privada nova entra em `PRIVATE_ROUTE_PREFIXES`. Esquecer disso NÃO a
 * expõe — o layout de `(app)` e a própria página continuam exigindo sessão —,
 * mas faz o visitante deslogado ver a tela por um instante antes do
 * redirecionamento, em vez de ser levado ao login de imediato.
 */
export function isPrivateRoute(pathname: string): boolean {
  return PRIVATE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
