import type { MetadataRoute } from "next";

import { env } from "@/config/env";

/**
 * robots.txt.
 *
 * ⚠️ A área do aluno é bloqueada por SESSÃO, não por este arquivo — robots é
 * pedido, não fechadura. O que ele evita é diferente e concreto: buscador
 * indexando URLs que sempre respondem com redirecionamento para o login gasta
 * orçamento de rastreio e coloca páginas inúteis nos resultados de busca.
 *
 * As rotas de autenticação também saem do índice. "Entrar" e "Cadastrar" só
 * fazem sentido depois da landing; aparecer antes dela numa busca por marca é
 * uma porta lateral que confunde quem nunca ouviu falar do produto.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/inicio",
        "/preparacoes",
        "/questoes",
        "/revisoes",
        "/cronograma",
        "/configuracoes",
        "/boas-vindas",
        "/admin",
        "/entrar",
        "/cadastrar",
        "/recuperar-senha",
        "/redefinir-senha",
        "/confirmar-email",
        "/sair",
        "/api",
      ],
    },
    sitemap: `${env.APP_URL}/sitemap.xml`,
    host: env.APP_URL,
  };
}
