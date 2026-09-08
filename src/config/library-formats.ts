/**
 * Os formatos de material da biblioteca, do jeito que o aluno chama.
 *
 * ⚠️ FICA NUM MÓDULO SEM `"use client"`, e isso é o conserto de um erro 500.
 *
 * A lista morava dentro de `library-filters.tsx`, que é um componente de
 * cliente. Num arquivo `"use client"`, TUDO que é exportado vira referência de
 * cliente — inclusive um array. O componente de servidor importava `FORMATOS`,
 * recebia esse marcador no lugar do array e quebrava no `.map`. A biblioteca
 * inteira respondia 500 em produção; o build passa, porque o defeito só existe
 * quando a página é servida.
 *
 * Módulo comum, sem diretiva, é importável dos dois lados sem transformação
 * nenhuma.
 *
 * ⚠️ ÁUDIO E PDF ENTRARAM EM 08/09/2026. Os dois já existiam no cadastro e no
 * player; só a biblioteca não os listava, então material de áudio publicado era
 * alcançável apenas por "todos os formatos" — invisível para quem filtrasse.
 */
export const LIBRARY_FORMATS: Array<{ valor: string | null; rotulo: string }> = [
  { valor: null, rotulo: "Todos os formatos" },
  { valor: "mind_map", rotulo: "Mapas mentais" },
  { valor: "flashcard_deck", rotulo: "Flashcards" },
  { valor: "study_text", rotulo: "Resumos" },
  { valor: "video", rotulo: "Videoaulas" },
  { valor: "audio", rotulo: "Áudios" },
  { valor: "pdf", rotulo: "PDFs" },
];
