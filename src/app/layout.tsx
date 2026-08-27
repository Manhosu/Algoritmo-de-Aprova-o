import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { APP_NAME, APP_TAGLINE } from "@/config/app";
import { env } from "@/config/env";

import "./globals.css";

const sans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  /**
   * ⚠️ Sai de `env.APP_URL`, nunca de constante.
   *
   * `metadataBase` é o que transforma "/opengraph-image" em URL absoluta. Sem
   * ela o Next avisa e usa localhost; com ela fixa no código, o ambiente de
   * preview anunciaria a URL de produção — e o card compartilhado de um teste
   * apontaria para o site real.
   */
  metadataBase: new URL(env.APP_URL),
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_TAGLINE,
  applicationName: APP_NAME,
  formatDetection: { telephone: false },
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },

  /**
   * O canal principal desta cliente é o WhatsApp, e link sem card vira uma
   * linha de texto cinza que ninguém abre. `opengraph-image.tsx` na raiz é
   * herdado por todas as rotas, então cada página compartilhada já sai com
   * imagem — e as que têm `title`/`description` próprios entram no card com
   * o texto delas.
   */
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: APP_NAME,
    title: APP_NAME,
    description: APP_TAGLINE,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: APP_NAME,
    description: APP_TAGLINE,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // A barra de navegação inferior é fixa: precisamos da área segura do iOS.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f8fd" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0e17" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      // next-themes escreve a classe do tema antes da hidratação
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      {/*
          `atmosphere` no body vale para TODOS os endpoints de uma vez: landing,
          cadastro, área do aluno, 404. Dois focos de luz difusa presos à
          viewport, no ciano da marca — é o que tira o fundo chapado sem
          espalhar o efeito por cada página à mão.
        */}
        <body className="atmosphere flex min-h-full flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
