import { NextResponse, type NextRequest } from "next/server";

import {
  isAuthRoute,
  isPublicRoute,
  LOGIN_ROUTE,
  SESSION_COOKIE_NAME,
} from "@/config/routes";

/**
 * Proxy (o que até o Next.js 15 se chamava middleware).
 *
 * FAZ DUAS COISAS, E SÓ ESSAS DUAS:
 *   1. monta o Content-Security-Policy com um nonce por requisição;
 *   2. redireciona quem não tem cookie de sessão para o login.
 *
 * ⚠️ O QUE ELE **NÃO** FAZ: autorização.
 *
 * Aqui só se olha se EXISTE um cookie — não se ele é válido, de quem é, nem se
 * a pessoa é admin. Verificar isso exigiria ir ao banco a cada requisição, e a
 * própria documentação do Next.js 16 avisa que Server Functions podem escapar
 * do matcher e que a autorização precisa ser verificada dentro de cada rota.
 *
 * Este arquivo é experiência de navegação. A segurança de verdade está nos
 * guards de servidor (`src/server/auth/guards.ts`), que rodam em toda rota de
 * API, Server Action e página protegida. Um vale sem o outro dá falsa
 * sensação de proteção.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  /**
   * `strict-dynamic` faz o navegador confiar nos scripts que os scripts com
   * nonce carregarem, que é o que o Next.js precisa para hidratar sem liberar
   * 'unsafe-inline' geral.
   *
   * Em desenvolvimento o Turbopack usa `eval`, por isso 'unsafe-eval' entra só
   * ali. Em produção não entra.
   */
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // O Tailwind e o next/font injetam estilo inline; não há como evitar.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: https:`,
    `font-src 'self' data:`,
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);
  const needsAuth = !isPublicRoute(pathname) && !isAuthRoute(pathname);

  if (needsAuth && !hasSessionCookie) {
    const loginUrl = new URL(LOGIN_ROUTE, request.url);
    // Preserva o destino para devolver o aluno onde ele estava tentando entrar.
    loginUrl.searchParams.set("proximo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    /**
     * Roda em tudo, menos assets estáticos e arquivos de metadado.
     *
     * As rotas de API ficam DE FORA de propósito: elas devolvem 401 em JSON
     * pelos seus próprios guards, e não um redirecionamento para uma página
     * de login que um cliente de API não sabe interpretar.
     *
     * ⚠️ `manifest.webmanifest` também precisa ficar de fora. Ele é lido pelo
     * NAVEGADOR, não pelo usuário — e o navegador não tem cookie de sessão no
     * momento em que busca o manifesto. Com o proxy ativo ali, a requisição
     * era redirecionada para o login e voltava HTML no lugar do JSON, o que
     * quebra silenciosamente o "Adicionar à tela de início".
     */
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|webmanifest|woff2?)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
