import { readFile, writeFile } from "node:fs/promises";

import sharp from "sharp";

/**
 * Prepara o símbolo da marca a partir da arte que a cliente envia.
 *
 *   npx tsx scripts/prepare-symbol.ts "arte.png"
 *
 * O PROBLEMA: A ARTE VEM COM FUNDO PRETO CHAPADO
 * ----------------------------------------------------------------------------
 * A cliente exporta o símbolo em ciano sobre preto, sem transparência. Usado
 * assim, ele vira um QUADRADO PRETO no cabeçalho do app — o fundo do produto é
 * `#0a0e17`, quase preto mas não preto, e a diferença aparece como uma placa
 * atrás da logo.
 *
 * ⚠️ RECORTAR POR LIMIAR ESTRAGA AS BORDAS. "Todo pixel escuro vira
 * transparente" produz serrilhado nas curvas do cérebro e nos pontos do
 * circuito, porque a arte é anti-serrilhada: a borda é uma rampa de ciano para
 * preto, não um degrau.
 *
 * A SOLUÇÃO: A PRÓPRIA LUMINÂNCIA VIRA O ALFA. Onde a arte é preta, o alfa é 0;
 * onde é ciano puro, é 255; na rampa da borda, o valor intermediário exato. É o
 * mesmo resultado de quem exportou com transparência desde o começo.
 *
 * Depois disto, rode `build-icons.ts` para gerar os ícones da aba e do celular.
 */

const origem = process.argv[2];

if (!origem) {
  throw new Error('Uso: npx tsx scripts/prepare-symbol.ts "arte.png"');
}

const DESTINO = "public/brand/symbol.png";

/**
 * Teto de resolução.
 *
 * A arte chega em 2000×2000 e vira um PNG de 1,4 MB. O maior uso é o ícone de
 * 512 do PWA; o cabeçalho mostra o símbolo com algumas dezenas de pixels. 1024
 * cobre tela retina com folga e corta o arquivo para uma fração — e é peso que
 * todo visitante da landing baixa.
 */
const LADO_MAXIMO = 1024;

const entrada = sharp(await readFile(origem)).resize(LADO_MAXIMO, LADO_MAXIMO, {
  fit: "inside",
  withoutEnlargement: true,
});
/**
 * ⚠️ AS DIMENSÕES VÊM DO BUFFER, NÃO DE `metadata()`.
 *
 * Num pipeline com `resize`, `metadata()` ainda devolve o tamanho do ARQUIVO
 * de origem — 2000×2000 — enquanto o buffer já saiu com 1024. `joinChannel`
 * recebe os dois números à mão e falha com um erro de tamanho que não menciona
 * a causa.
 */
const { data: cores, info } = await entrada
  .clone()
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height } = info;

/**
 * A máscara. `greyscale` já pondera os canais pela percepção humana, então o
 * ciano — que é claro — vira alfa alto, e o preto vira zero.
 */
const mascara = await entrada.clone().greyscale().raw().toBuffer();

const recortado = await sharp(cores, { raw: { width, height, channels: 3 } })
  .joinChannel(mascara, { raw: { width, height, channels: 1 } })
  .png()
  .toBuffer();

await writeFile(DESTINO, recortado);

const antes = (await readFile(origem)).length;
const meta = await sharp(recortado).metadata();

console.log(`\n✓ ${DESTINO}`);
console.log(`  ${meta.width}×${meta.height} · alfa: ${meta.hasAlpha} · ${(recortado.length / 1024).toFixed(0)} KB (origem: ${(antes / 1024).toFixed(0)} KB)`);
console.log("\n  Agora rode:  npx tsx scripts/build-icons.ts\n");
