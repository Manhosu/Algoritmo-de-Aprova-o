import { readFileSync } from "node:fs";
import { join } from "node:path";

import { globSync } from "tinyglobby";
import { describe, expect, it } from "vitest";

/**
 * Todo `<select>` precisa pintar as próprias `option`.
 *
 * POR QUE ESTE TESTE EXISTE
 * ----------------------------------------------------------------------------
 * ⚠️ O NAVEGADOR NÃO HERDA A COR DO `select` PARA A LISTA ABERTA.
 *
 * No Windows e no Android, o Chrome desenha o menu suspenso com as cores do
 * sistema — fundo branco. Nosso texto é claro, então a lista fica branco sobre
 * branco: as opções existem, recebem clique e teclado, e ninguém as vê.
 *
 * A cliente relatou isso DUAS VEZES, em telas diferentes e com palavras
 * diferentes: "ficou difícil de enxergar a seleção da banca" no cadastro da
 * preparação, e "não estão aparecendo os assuntos para escolher" no filtro do
 * banco de questões. O primeiro foi corrigido; o segundo tinha ficado, porque a
 * correção morava na classe de um componente e não numa regra.
 *
 * Nada no portão vê isso: o HTML está correto, os testes passam, e a falha só
 * existe no navegador de quem abre a lista.
 */

const RAIZ = process.cwd();

describe("contraste da lista de um select", () => {
  it("todo `<select>` pinta as próprias `option`", () => {
    const arquivos = globSync("src/**/*.tsx", { cwd: RAIZ, ignore: ["**/*.test.tsx"] });

    const semCor: string[] = [];

    for (const arquivo of arquivos) {
      const fonte = readFileSync(join(RAIZ, arquivo), "utf8");
      if (!fonte.includes("<select")) continue;

      /*
        Cada `<select ...>` até o `>` de abertura, com o que vier depois até a
        primeira `<option`: é onde a classe mora, seja no atributo direto ou
        numa constante montada logo acima.
      */
      const blocos = fonte.split("<select").slice(1);

      for (const [i, bloco] of blocos.entries()) {
        const cabeca = bloco.slice(0, bloco.indexOf("<option") + 1 || 1200);
        if (!/\[&>option\]:bg-/.test(cabeca) && !/\[&>option\]:text-/.test(cabeca)) {
          semCor.push(`${arquivo} · select #${i + 1}`);
        }
      }
    }

    expect(
      semCor,
      "sem `[&>option]:bg-…` a lista abre branca sobre branco no Windows e no Android",
    ).toEqual([]);
  });
});
