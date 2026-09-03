import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import sharp from "sharp";

/**
 * GERA OS ÍCONES A PARTIR DA ARTE DE ORIGEM.
 * ============================================================================
 *
 * ⚠️ EXISTE PORQUE O FAVICON SUMIA NA ABA (relato da cliente, 03/09/2026).
 *
 * A arte estava certa. O problema era margem: o desenho ocupava 67,6% de um
 * quadro de 512px, com 83px de vazio de cada lado. O navegador reduz o arquivo
 * inteiro para 16px, margem incluída, então sobravam 11px de desenho para uma
 * arte de traço fino. O resultado era uma mancha ciano.
 *
 * Cortar a margem sobe a ocupação para 93% e devolve uns 15px de desenho no
 * mesmo espaço. É o maior ganho disponível sem redesenhar a marca.
 *
 * ⚠️ O CORTE É MEDIDO, NÃO CHUTADO.
 *
 * O script acha o retângulo onde existe pixel ciano e recorta em volta dele. Se
 * a cliente trocar a arte amanhã, isto continua funcionando: nenhum número de
 * margem está escrito no código.
 *
 * ⚠️ O `apple-icon` MANTÉM MARGEM MAIOR, de propósito.
 *
 * O iOS arredonda os cantos e aplica a própria máscara. Um ícone cortado rente
 * perde as pontas da seta e do círculo na tela de início do iPhone.
 *
 *   npx tsx scripts/build-icons.ts
 */

/*
  ⚠️ FORA DE `src/app`, e o motivo é convenção do Next.

  Todo arquivo `icon*.png` dentro de `app/` vira um `<link rel="icon">` no HTML.
  A arte de origem, com a margem larga, entraria como um segundo ícone e o
  navegador poderia escolher justamente ela — desfazendo o corte na aba.
*/
const ORIGEM = "assets/icon-source.png";

/** Onde cada tamanho é gravado. Next.js lê os de `src/app`. */
const SAIDAS = [
  { arquivo: "src/app/icon.png", tamanho: 512, ocupacao: 0.93 },
  { arquivo: "public/icon.png", tamanho: 512, ocupacao: 0.93 },
  { arquivo: "src/app/apple-icon.png", tamanho: 180, ocupacao: 0.78 },
  { arquivo: "public/apple-icon.png", tamanho: 180, ocupacao: 0.78 },
];

/** O retângulo que contém a arte, medido pixel a pixel. */
async function caixaDaArte(caminho: string) {
  const img = sharp(caminho);
  const { width = 0, height = 0 } = await img.metadata();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * info.channels;
      const r = data[i];
      const g = data[i + 1];

      /*
        Ciano é verde alto com vermelho baixo. Testar só o brilho pegaria também
        um fundo cinza claro, e a marca ficaria com a margem de volta.
      */
      if (g > 90 && g - r > 40) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  return { width, height, minX, minY, maxX, maxY };
}

async function main() {
  const caixa = await caixaDaArte(ORIGEM);

  const larguraArte = caixa.maxX - caixa.minX + 1;
  const alturaArte = caixa.maxY - caixa.minY + 1;
  const lado = Math.max(larguraArte, alturaArte);

  const centroX = (caixa.minX + caixa.maxX) / 2;
  const centroY = (caixa.minY + caixa.maxY) / 2;

  console.log(
    `Arte: ${larguraArte}x${alturaArte} em ${caixa.width}x${caixa.height} ` +
      `(${((larguraArte / caixa.width) * 100).toFixed(1)}% de ocupação)`,
  );

  for (const saida of SAIDAS) {
    const recorte = Math.round(lado / saida.ocupacao);

    /*
      O recorte pode passar da borda quando a arte já está perto dela. `max` e
      `min` prendem dentro da imagem: cortar fora do arquivo faz o sharp falhar,
      e um ícone quebrado é pior que um com margem.
    */
    const left = Math.max(0, Math.min(caixa.width - recorte, Math.round(centroX - recorte / 2)));
    const top = Math.max(0, Math.min(caixa.height - recorte, Math.round(centroY - recorte / 2)));
    const size = Math.min(recorte, caixa.width - left, caixa.height - top);

    const bytes = await sharp(ORIGEM)
      .extract({ left, top, width: size, height: size })
      /* `lanczos3` preserva traço fino melhor que a redução padrão. */
      .resize(saida.tamanho, saida.tamanho, { kernel: "lanczos3" })
      .png({ compressionLevel: 9 })
      .toBuffer();

    mkdirSync(dirname(saida.arquivo), { recursive: true });
    writeFileSync(saida.arquivo, bytes);

    console.log(
      `  ${saida.arquivo}  ${saida.tamanho}px  ` +
        `(recorte ${size}px, ocupação ${(saida.ocupacao * 100).toFixed(0)}%)`,
    );
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
