import type { NextConfig } from "next";

/**
 * Cabeçalhos de segurança aplicados a toda resposta.
 *
 * O Content-Security-Policy NÃO está aqui: ele precisa de um nonce por
 * requisição e é montado em `src/proxy.ts`.
 */
const securityHeaders = [
  // Impede o navegador de "adivinhar" o tipo do conteúdo (defesa contra XSS
  // via upload de arquivo servido como HTML).
  { key: "X-Content-Type-Options", value: "nosniff" },

  // A aplicação nunca é legitimamente embutida em iframe de terceiros.
  { key: "X-Frame-Options", value: "DENY" },

  // Não vaza a URL completa (que pode conter ids) para sites externos.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // Desliga APIs sensíveis que o produto não usa.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },

  // Força HTTPS por 2 anos. Só tem efeito quando servido por HTTPS.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },

  // Bloqueia leitura entre origens de recursos da aplicação.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  // Módulos nativos / com binário não devem ser empacotados pelo bundler.
  serverExternalPackages: ["@node-rs/argon2", "postgres"],

  // Não expõe a versão do framework no header `X-Powered-By`.
  poweredByHeader: false,

  experimental: {
    serverActions: {
      // O upload do edital em PDF passa por aqui (README 1.4, passo 1).
      bodySizeLimit: "25mb",
    },
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Nenhuma resposta de API pode ser cacheada por CDN ou navegador:
        // toda ela é específica do aluno autenticado.
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          ...securityHeaders,
        ],
      },
    ];
  },
};

export default nextConfig;
