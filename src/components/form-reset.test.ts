import { readFileSync } from "node:fs";
import { join } from "node:path";

import { globSync } from "tinyglobby";
import { describe, expect, it } from "vitest";

/**
 * FORMULÁRIO COM `defaultValue` NÃO PODE USAR `action={}`.
 * ============================================================================
 *
 * ⚠️ ESTE TESTE EXISTE PORQUE O MESMO ERRO APARECEU DUAS VEZES, em telas sem
 * relação nenhuma entre si.
 *
 * O React 19 LIMPA um formulário que ele governa pelo `action` assim que a ação
 * termina — inclusive quando ela termina RECUSANDO. Os campos voltam ao
 * `defaultValue`, e há dois estragos, o segundo pior que o primeiro:
 *
 *   • num formulário de CRIAÇÃO, tudo o que a pessoa digitou some, e ela
 *     reescreve o formulário inteiro para corrigir uma escolha;
 *
 *   • num formulário de EDIÇÃO, os campos voltam ao valor ANTIGO. A pessoa
 *     corrige, o servidor recusa por outro motivo, e a tela mostra de volta
 *     exatamente o dado errado que ela estava consertando.
 *
 * A primeira vez foi o formulário de importação: "Conferir sem gravar" rodava,
 * mostrava o relatório e apagava o arquivo escolhido, então "Importar"
 * respondia "Escolha uma planilha .xlsx". A conferência ficava inútil
 * justamente por funcionar.
 *
 * Nada mais pega isto. O HTML está correto, os tipos fecham, e a falha só
 * existe depois de uma recusa do servidor — o caminho que ninguém testa à mão.
 *
 * DUAS SAÍDAS VÁLIDAS, e o teste aceita as duas:
 *
 *   1. chamar a ação de dentro do `onSubmit`, com `new FormData(form)`;
 *   2. devolver os valores enviados no estado e alimentar
 *      `defaultValue={state.values?.campo}` com eles — o que o cadastro e o
 *      login já fazem.
 */

const RAIZ = process.cwd();

describe("formulários que preservam o que foi digitado", () => {
  it("nenhum `<form action={…}>` com `defaultValue` fixo", () => {
    const arquivos = globSync("src/**/*.tsx", { cwd: RAIZ, ignore: ["**/*.test.tsx"] });

    const arriscados: string[] = [];

    for (const arquivo of arquivos) {
      const fonte = readFileSync(join(RAIZ, arquivo), "utf8");

      for (const [i, bloco] of fonte.split("<form").slice(1).entries()) {
        const abertura = bloco.slice(0, bloco.indexOf(">") + 1);
        if (!/\baction=\{/.test(abertura)) continue;

        const corpo = bloco.slice(0, bloco.indexOf("</form>") + 1 || bloco.length);

        /*
          `defaultValue={state.…}` é a saída 2: o valor volta do servidor, então
          o reset repõe o que a pessoa acabou de enviar, não o valor antigo.
        */
        const fixos = [...corpo.matchAll(/defaultValue=\{?([^}\s/>]*)/g)].filter(
          (achado) => !/^["'`]?\{?state\b/.test(achado[1]) && !achado[1].startsWith("state"),
        );

        if (fixos.length > 0) {
          arriscados.push(`${arquivo.replaceAll("\\", "/")} · form #${i + 1}`);
        }
      }
    }

    expect(
      arriscados,
      "use `onSubmit` com `new FormData(form)`, ou devolva os valores no estado — " +
        "senão uma recusa do servidor apaga o que a pessoa digitou",
    ).toEqual([]);
  });
});
