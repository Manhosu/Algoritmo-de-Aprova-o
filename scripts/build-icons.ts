import { readFile, writeFile } from "node:fs/promises";

import sharp from "sharp";

/**
 * Gera os ícones do app a partir do símbolo da marca.
 *
 *   npx tsx scripts/build-icons.ts
 *
 * POR QUE COMPOR EM VEZ DE USAR O PNG DIRETO
 * ----------------------------------------------------------------------------
 * O símbolo da cliente é ciano sobre fundo TRANSPARENTE. Na aba do navegador
 * isso vira um traço fino sobre o cinza claro do Chrome, e some. No celular,
 * o Android recorta o ícone num círculo e o que sobra é quase nada.
 *
 * A composição resolve os dois: fundo sólido na cor da marca (#0a0e17), o
 * símbolo centralizado com folga, e o contraste que faz a aba ser reconhecível
 * de relance.
 *
 * ⚠️ A FOLGA NÃO É ESTÉTICA. O Android aplica máscara circular e corta os
 * cantos; sem margem, as pontas do circuito do cérebro somem no recorte.
 */

const FUNDO = { r: 10, g: 14, b: 23, alpha: 1 };

/** Quanto do lado é ocupado pelo símbolo. O resto é a folga da máscara. */
const OCUPACAO = 0.72;

async function gerar(entrada: string, saida: string, lado: number) {
  const original = await readFile(entrada);
  const simbolo = Math.round(lado * OCUPACAO);

  const redimensionado = await sharp(original)
    .resize(simbolo, simbolo, { fit: "contain", background: { ...FUNDO, alpha: 0 } })
    .toBuffer();

  const composto = await sharp({
    create: { width: lado, height: lado, channels: 4, background: FUNDO },
  })
    .composite([{ input: redimensionado, gravity: "center" }])
    .png()
    .toBuffer();

  await writeFile(saida, composto);
  console.log(`  ✓ ${saida} · ${lado}×${lado} · ${(composto.length / 1024).toFixed(1)} KB`);
}

const SIMBOLO = "public/brand/symbol.png";

console.log("\nGerando ícones a partir de", SIMBOLO, "\n");

// Aba do navegador e PWA.
await gerar(SIMBOLO, "src/app/icon.png", 512);
// iOS, que não aplica máscara mas também não gosta de transparência.
await gerar(SIMBOLO, "src/app/apple-icon.png", 180);
// Referenciado pelo manifesto.
await gerar(SIMBOLO, "public/icon.png", 512);
await gerar(SIMBOLO, "public/apple-icon.png", 180);

console.log("");
