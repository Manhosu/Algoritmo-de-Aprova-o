import { NextResponse, type NextRequest } from "next/server";

import {
  isAdminRoute,
  isAuthRoute,
  isPrivateRoute,
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
/**
 * A origem do Supabase Storage, para entrar no CSP — ou vazio sem ele.
 *
 * ⚠️ SÓ A ORIGEM, sem caminho. Uma diretiva de CSP com caminho passa a casar
 * por prefixo e vira uma regra frágil; a origem é o que o navegador compara.
 *
 * Devolve string vazia quando não há Supabase configurado (desenvolvimento com
 * disco local), e aí `'self'` sozinho já cobre — os arquivos saem da rota
 * `/api/acervo`, que é a nossa própria origem.
 */
function origemDoArmazenamento(): string {
  const bruto = process.env.SUPABASE_URL;
  if (!bruto) return "";

  try {
    return ` ${new URL(bruto).origin}`;
  } catch {
    return "";
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isDev = process.env.NODE_ENV === "development";

  /**
   * ⚠️ SEM NONCE E SEM `strict-dynamic`. ELES DERRUBARAM O SITE INTEIRO.
   *
   * O QUE ACONTECEU (26/08/2026, encontrado no domínio de produção)
   * --------------------------------------------------------------------------
   * O CSP anterior era `script-src 'self' 'nonce-X' 'strict-dynamic'`, gerando
   * um nonce por requisição. Correto para páginas renderizadas a cada acesso —
   * e incompatível com as nossas.
   *
   * A landing, o cadastro, o login e a recuperação de senha são PRERENDERIZADAS
   * NO BUILD. O HTML delas nasce ali, sem nonce nenhum, e é servido do CDN.
   * O proxy então carimbava um nonce novo em cada resposta, que não
   * correspondia a script nenhum do HTML. Com `strict-dynamic`, o `'self'`
   * deixa de valer — então o navegador bloqueava TODOS os 15 scripts da página.
   *
   * O efeito em produção era o site sem JavaScript algum: o tema não aplicava
   * (a plataforma abria clara, não no painel neon da cliente), o cadastro não
   * enviava, o login não enviava, nada interativo respondia. A página abria,
   * parecia quase certa, e não funcionava.
   *
   * Nenhuma das nossas verificações pegou: o smoke test busca o HTML por HTTP e
   * confere o conteúdo, mas não EXECUTA script; e em desenvolvimento tudo é
   * dinâmico, então o nonce casava.
   *
   * POR QUE `'unsafe-inline'` É ACEITÁVEL AQUI
   * --------------------------------------------------------------------------
   * O Next.js injeta os dados de hidratação como script inline. Sem nonce, a
   * única forma de executá-los é liberar inline — e navegador nenhum aceita as
   * duas coisas juntas: havendo nonce, `'unsafe-inline'` é ignorado.
   *
   * O risco que `'unsafe-inline'` abre é o de um XSS conseguir executar script
   * injetado. Nós não temos por onde: não existe um único
   * `dangerouslySetInnerHTML` no projeto (o documento jurídico é montado por um
   * parser próprio justamente por isso), e o React escapa tudo por padrão.
   *
   * O resto do CSP continua fechado: `default-src 'self'`, `object-src 'none'`,
   * `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`. Script
   * de terceiro continua barrado — o que caiu foi só a exigência de nonce.
   */
  /*
   * ⚠️ O ARMAZENAMENTO PRECISA APARECER NO CSP, e ele faltava.
   *
   * `default-src 'self'` cobre `media-src` e `object-src` por herança. Enquanto
   * o acervo era só imagem, ninguém notou: `img-src` já liberava `https:`. Com
   * vídeo e áudio do Mind-X vindo do bucket, e com o PDF abrindo dentro da
   * página, os três passariam a ser BLOQUEADOS pelo navegador — sem erro na
   * tela, só um player que não começa e um retângulo em branco.
   *
   * A origem é lida do ambiente e não fica escrita aqui: preview e produção
   * apontam para projetos diferentes do Supabase, e um valor fixo funcionaria
   * num e falharia no outro.
   */
  const armazenamento = origemDoArmazenamento();

  /*
    ⚠️ O MERCADO PAGO SÓ ENTRA NO CSP DA PÁGINA DE PLANOS.

    O formulário de cartão carrega o SDK deles e desenha número, validade e
    código em iframes do domínio deles — é isso que mantém o cartão fora do
    nosso servidor. Liberar esses domínios no site inteiro abriria todas as
    outras telas a script de terceiro sem motivo nenhum.
  */
  const pagamento = pathname === "/planos" || pathname.startsWith("/planos/");
  const mercadoPago = pagamento
    ? " https://sdk.mercadopago.com https://*.mercadopago.com https://*.mercadolibre.com https://*.mlstatic.com"
    : "";

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${mercadoPago}`,
    // O Tailwind e o next/font injetam estilo inline; não há como evitar.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: https:`,
    `font-src 'self' data:`,
    /*
      ⚠️ O UPLOAD DO PAINEL É UM XHR PARA O ARMAZENAMENTO, e sem esta linha ele
      é bloqueado.

      Eu corrigi `media-src` e `object-src` e deixei este passar. O upload direto
      manda os bytes do navegador para o bucket, e requisição de rede é
      `connect-src` — não `media-src`. O resultado era "O envio falhou no meio",
      a mensagem de rede que o próprio controle mostra, apontando para a conexão
      da cliente quando o problema era nosso.
    */
    `connect-src 'self'${armazenamento}${mercadoPago}${isDev ? " ws: wss:" : ""}`,
    /* Vídeo e áudio do acervo — nossa origem em desenvolvimento, o bucket em produção. */
    `media-src 'self' blob:${armazenamento}`,
    /*
     * O `<object>` que embute PDF na tela do material.
     *
     * Sair de `'none'` afrouxa a diretiva que historicamente barrava plugin, e
     * por isso ela é limitada às DUAS origens que servem o nosso acervo — não a
     * `https:` inteiro, como `img-src`. Navegador atual só usa `<object>` para
     * PDF e imagem; Flash e Java não existem mais para relaxar aqui.
     */
    `object-src 'self'${armazenamento}`,
    `frame-src 'self'${mercadoPago}`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'self'`,
    `upgrade-insecure-requests`,
  ].join("; ");

  /*
   * O `x-nonce` some junto: ele existia para o Next.js carimbar os scripts, e
   * não há mais nonce para carimbar. Deixá-lo aqui sugeriria a quem lê depois
   * que o mecanismo continua em uso.
   */
  const requestHeaders = new Headers(request.headers);

  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);

  /**
   * Só as rotas da área do aluno são interceptadas.
   *
   * ⚠️ Antes era o inverso — tudo que não fosse público virava privado. O
   * efeito prático: um endereço com erro de digitação levava um visitante
   * anônimo ao login em vez de a uma página de "não encontrada". Como os links
   * circulam por WhatsApp, um caractere a mais colocava um curioso diante de um
   * cadastro que ele não pediu.
   *
   * A troca é segura porque o proxy nunca foi a proteção principal: o layout de
   * `(app)` e todas as páginas de lá exigem sessão por conta própria. Ver a nota
   * em `config/routes.ts`.
   */
  const needsAuth =
    (isPrivateRoute(pathname) || isAdminRoute(pathname)) && !isAuthRoute(pathname);

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
