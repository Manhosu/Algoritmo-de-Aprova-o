import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Duas invariantes da camada de movimento — as duas nasceram de bugs reais.
 *
 * POR QUE UM TESTE OLHA PARA UM ARQUIVO CSS
 * ----------------------------------------------------------------------------
 * `tsc` e `eslint` não compilam CSS, e o `build` só reprova erro de sintaxe.
 * Os dois defeitos abaixo passariam nos três e só apareceriam para o aluno,
 * como conteúdo invisível — o pior modo de falha possível, porque a página
 * carrega, responde 200 e parece funcionar.
 */

const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** O corpo do `@utility reveal`, do cabeçalho até a chave que o fecha. */
function revealBlock(): string {
  const start = CSS.indexOf("@utility reveal");
  expect(start, "@utility reveal sumiu de globals.css").toBeGreaterThan(-1);

  let depth = 0;
  for (let i = CSS.indexOf("{", start); i < CSS.length; i += 1) {
    if (CSS[i] === "{") depth += 1;
    if (CSS[i] === "}") {
      depth -= 1;
      if (depth === 0) return CSS.slice(start, i + 1);
    }
  }
  throw new Error("Bloco @utility reveal não fecha.");
}

describe("camada de movimento", () => {
  it("revela por `entry`, nunca por `cover`", () => {
    /**
     * `cover` mede a travessia inteira do bloco pela tela, então o progresso de
     * um bloco parado e inteiramente visível depende da altura dele: um bloco
     * de 252px numa tela de 949px fica em 21%. Com o gatilho em `cover 22%`, o
     * último bloco da landing — o botão de criar conta — ficava invisível por
     * um ponto percentual sempre que não sobrasse rolagem.
     *
     * `entry` chega a 100% assim que o bloco acaba de entrar, o que garante a
     * invariante que importa: bloco inteiramente visível é bloco visível.
     */
    const bloco = revealBlock();

    expect(bloco).toContain("animation-range: entry");
    expect(bloco, "`cover` faz bloco visível ficar em opacidade zero").not.toMatch(
      /animation-range:[^;]*cover/,
    );
  });

  it("não aplica revelação a quem pediu menos movimento", () => {
    /**
     * ⚠️ O bloco global de `prefers-reduced-motion: reduce` NÃO cobre este
     * caso, e é por isso que a guarda precisa estar aqui também.
     *
     * Aquele bloco neutraliza animação encurtando `animation-duration` para
     * 0.01ms. Isso funciona para animação movida a tempo — `rise`, `drift` —,
     * que pula direto para o estado final por causa do `both`. Mas `reveal` é
     * movida por `animation-timeline: view()`: o progresso vem da posição na
     * tela, e a duração é simplesmente ignorada. Sem esta guarda, quem pede
     * menos movimento receberia conteúdo preso em opacidade zero.
     */
    const bloco = revealBlock();

    expect(bloco).toContain("prefers-reduced-motion: no-preference");
    expect(bloco).toContain("@supports (animation-timeline: view())");
  });

  it("não escreve prefixos `-webkit-` que o compilador já acrescenta", () => {
    /**
     * ⚠️ ESCREVER O PREFIXO À MÃO APAGA A PROPRIEDADE PADRÃO.
     *
     * Com `backdrop-filter` e `-webkit-backdrop-filter` declarados juntos, o
     * Lightning CSS (compilador do Tailwind v4) manteve só a prefixada e
     * descartou a padrão. O Chrome moderno ignora a prefixada, então o
     * resultado foi `backdrop-filter: none` em TODO lugar: cabeçalho, mockup
     * da landing, cadastro e 404 ficaram com fundo translúcido e nenhum
     * desfoque — de vidro, só o nome.
     *
     * Falhou em silêncio por não quebrar nada: a página carrega, responde 200
     * e só parece lavada. O compilador acrescenta o prefixo onde for preciso;
     * a nossa parte é declarar a propriedade padrão e sair da frente.
     *
     * `-webkit-tap-highlight-color` fica de fora da regra: não tem equivalente
     * padrão, então escrevê-la à mão é a única opção.
     */
    const proibidos = CSS.match(/^\s*-webkit-[a-z-]+(?=\s*:)/gm) ?? [];
    const semAlternativa = proibidos.filter(
      (linha) => !linha.includes("-webkit-tap-highlight-color"),
    );

    expect(semAlternativa).toEqual([]);
  });

  it("mantém o bloco de movimento reduzido como última palavra do arquivo", () => {
    // Ele precisa vencer tudo que foi declarado antes; declarado no meio, a
    // camada de atmosfera passaria por cima em parte das regras.
    const posicao = CSS.lastIndexOf("prefers-reduced-motion: reduce");
    const resto = CSS.slice(posicao);

    expect(posicao).toBeGreaterThan(-1);
    expect(resto).not.toContain("@utility");
  });
});
