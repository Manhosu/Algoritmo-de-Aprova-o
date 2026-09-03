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

      const constantes = constantesDeTexto(fonte);

      /*
        Cada `<select ...>` até o `>` de abertura, com o que vier depois até a
        primeira `<option`: é onde a classe mora, seja no atributo direto ou
        numa constante montada logo acima.
      */
      const blocos = fonte.split("<select").slice(1);

      for (const [i, bloco] of blocos.entries()) {
        const cabeca = expandir(
          bloco.slice(0, bloco.indexOf("<option") + 1 || 1200),
          constantes,
        );

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

  /*
    ⚠️ O TESTE DO PRÓPRIO TESTE.

    A expansão de constantes foi acrescentada para parar de acusar código
    correto. Uma expansão frouxa demais faria tudo passar, e a regra viraria
    enfeite sem ninguém notar — o modo de falhar de um guarda é sempre este.
  */
  it("ainda acusa um select sem cor", () => {
    const fonte = `const CLASSE = "rounded-lg border";
      <select className={CLASSE}><option value="a">A</option></select>`;

    const constantes = constantesDeTexto(fonte);
    const cabeca = expandir(fonte.split("<select")[1].split("<option")[0], constantes);

    expect(/\[&>option\]:(bg|text)-/.test(cabeca)).toBe(false);
  });
});

/**
 * As constantes de texto do arquivo, por nome.
 *
 * ⚠️ SEM ISTO, A REGRA PUNIA O CÓDIGO MAIS LIMPO.
 *
 * Um formulário com cinco `<select>` iguais junta as classes numa constante em
 * vez de repetir a mesma linha cinco vezes. A varredura só via
 * `className={CLASSE_SELECT}` e acusava os cinco, embora a constante trouxesse
 * exatamente a classe exigida — um teste que reprova a versão correta ensina a
 * contorná-lo, e um teste contornado não protege mais nada.
 */
function constantesDeTexto(fonte: string): Map<string, string> {
  const mapa = new Map<string, string>();

  /*
    ⚠️ O `\s*` DEPOIS DO `=` NÃO É DETALHE.

    Sem ele, uma constante escrita como

        const CLASSE =
          "...";

    (que é o que o Prettier faz quando a linha passa de 80 colunas) não era
    capturada, e o select que a usava aparecia como se não tivesse cor nenhuma.
    O teste acusava código correto — de novo.
  */
  for (const achado of fonte.matchAll(/const (\w+)(?::\s*[^=]+)?\s*=\s*("[^"]*"|`[^`]*`)/g)) {
    mapa.set(achado[1], achado[2].slice(1, -1));
  }

  return mapa;
}

/**
 * Troca `NOME` e `${NOME}` pelo conteúdo da constante.
 *
 * Duas passadas resolvem o encadeamento que existe na prática
 * (`CLASSE_SELECT` montada sobre `CLASSE_CAMPO`) sem precisar de um grafo.
 */
function expandir(trecho: string, constantes: Map<string, string>): string {
  let texto = trecho;

  for (let passada = 0; passada < 2; passada++) {
    for (const [nome, valor] of constantes) {
      if (texto.includes(nome)) texto = texto.replaceAll(nome, valor);
    }
  }

  return texto;
}
