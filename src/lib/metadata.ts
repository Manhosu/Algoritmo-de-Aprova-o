import type { Metadata } from "next";

import { APP_DESCRIPTION, APP_NAME } from "@/config/app";

/**
 * Monta o bloco de compartilhamento de uma página.
 *
 * ⚠️ EXISTE POR CAUSA DE UMA ARMADILHA REAL DO NEXT.
 *
 * O arquivo `opengraph-image.tsx` na raiz injeta `og:image` em todas as rotas —
 * MAS só enquanto a página não declara `openGraph` por conta própria. Basta uma
 * página definir `openGraph: { title }` para o objeto inteiro ser substituído e
 * a imagem sumir.
 *
 * Foi o que aconteceu com a landing em 25/08/2026: ela ganhou um título de
 * compartilhamento melhor e perdeu a imagem. Justo a página mais compartilhada,
 * e justo no WhatsApp, onde link sem imagem vira uma linha de texto cinza.
 *
 * Com este helper a imagem vem sempre junto, e quem escrever uma página nova
 * não precisa saber da pegadinha.
 */

/** Caminho da imagem gerada por `src/app/opengraph-image.tsx`. */
const OG_IMAGE = "/opengraph-image";

export function socialMetadata(input: {
  /** Título do CARD. Costuma ser mais direto que o título da aba. */
  title: string;
  description?: string;
  /** Caminho da página, para a URL canônica. */
  path: string;
}): Pick<Metadata, "openGraph" | "twitter" | "alternates"> {
  const description = input.description ?? APP_DESCRIPTION;

  return {
    alternates: { canonical: input.path },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: APP_NAME,
      title: input.title,
      description,
      url: input.path,
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: APP_NAME }],
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description,
      images: [OG_IMAGE],
    },
  };
}
