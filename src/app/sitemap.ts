import type { MetadataRoute } from "next";

import { env } from "@/config/env";

/**
 * sitemap.xml.
 *
 * Só as páginas que fazem sentido para quem ainda não é aluno. A área logada
 * fica de fora porque nenhuma URL de lá responde conteúdo sem sessão — listá-la
 * mandaria o buscador a uma fila de redirecionamentos.
 *
 * ⚠️ Rota nova aqui é decisão consciente, não automatismo. Um sitemap que se
 * preenche sozinho a partir do sistema de arquivos acabaria publicando a
 * primeira página privada que alguém esquecesse de proteger.
 */
const PUBLIC_PAGES = [
  { path: "/", priority: 1, changeFrequency: "weekly" as const },
  { path: "/planos", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/politica-de-privacidade", priority: 0.3, changeFrequency: "yearly" as const },
  { path: "/termos-de-uso", priority: 0.3, changeFrequency: "yearly" as const },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return PUBLIC_PAGES.map((page) => ({
    url: `${env.APP_URL}${page.path === "/" ? "" : page.path}`,
    lastModified,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
