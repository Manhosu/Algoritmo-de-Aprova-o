import { describe, expect, it } from "vitest";

import padrao from "@/content/landing.json";
import { landingSchema } from "@/content/landing-schema";

import { montarArvore, remontar, type No } from "./copy-fields";

/**
 * O EDITOR DE TEXTOS PUBLICA O QUE ELE MESMO MOSTRA.
 * ============================================================================
 *
 * ⚠️ ESTE TESTE EXISTE PORQUE PUBLICAR FALHAVA ATÉ SEM MUDAR NADA.
 *
 * Palavras da cliente em 10/09/2026: "não estou conseguindo salvar alterações
 * na Landing Page, aparece o erro abaixo". Dez listas de texto puro da copy de
 * 04/09 não viravam campo, nunca eram enviadas, e o schema recusava a
 * publicação inteira. O teste de rótulos passava — ele olhava os nomes, não os
 * campos.
 *
 * Aqui a conferência é de ponta a ponta: a árvore que o formulário desenha, o
 * que o navegador enviaria dela, a remontagem que a ação faz, e o schema.
 */

/** O que o navegador envia de cada campo que o formulário desenha. */
function enviados(nos: No[]): Array<[string, string]> {
  return nos.flatMap((no): Array<[string, string]> => {
    if (no.tipo === "grupo") return enviados(no.filhos);
    if (no.tipo === "texto") return [[no.nome, no.valor]];

    /* Caixa de seleção: o `hidden` com "false" vai sempre; o "true" só marcada. */
    return no.valor ? [[no.nome, "false"], [no.nome, "true"]] : [[no.nome, "false"]];
  });
}

const copy = landingSchema.parse(padrao);

describe("editor de textos do site", () => {
  it("publicar o texto que está no ar, sem mexer em nada, passa pelo schema", () => {
    const resultado = landingSchema.safeParse(remontar(enviados(montarArvore(copy))));

    expect(
      resultado.success ? [] : resultado.error.issues.map((p) => `${p.path.join(" › ")}: ${p.message}`),
    ).toEqual([]);
    expect(resultado.data).toEqual(copy);
  });

  it("⚠️ lista de texto puro vira um campo por item", () => {
    const nomes = new Set(enviados(montarArvore(copy)).map(([nome]) => nome));

    /* As dez listas que ficavam de fora. */
    for (const caminho of [
      "pains.items",
      "game.badges",
      "game.lines",
      "mission.items",
      "system.denials",
      "science.items",
      "cycle.steps",
      "time.items",
      "better.items",
      "worth.questions",
    ]) {
      expect(nomes.has(`${caminho}.0`), `${caminho} não virou campo`).toBe(true);
    }
  });

  it("uma edição num item de lista chega ao objeto publicado", () => {
    const campos = enviados(montarArvore(copy)).map(([nome, valor]): [string, string] =>
      nome === "pains.items.0" ? [nome, "Dor reescrita pela cliente"] : [nome, valor],
    );

    const resultado = landingSchema.parse(remontar(campos));
    expect(resultado.pains.items[0]).toBe("Dor reescrita pela cliente");
  });

  it("a anotação da versão e os campos internos do React ficam fora do texto", () => {
    const objeto = remontar([
      ["note", "teste"],
      ["$ACTION_REF_1", ""],
      ["hero.eyebrow", "Olá"],
    ]);

    expect(objeto).toEqual({ hero: { eyebrow: "Olá" } });
  });
});
