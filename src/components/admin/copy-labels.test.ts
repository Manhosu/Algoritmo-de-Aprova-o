import { describe, expect, it } from "vitest";

import padrao from "@/content/landing.json";

import { rotular, ROTULOS_POR_CAMINHO, ROTULOS_POR_CHAVE } from "./copy-labels";

/**
 * Todo campo do editor precisa aparecer em português para a cliente.
 *
 * POR QUE ESTE TESTE EXISTE
 * ----------------------------------------------------------------------------
 * O formulário é GERADO a partir da copy: quem escreve um campo novo no schema
 * ganha o input de graça e não é obrigado a lembrar do rótulo. Sem rótulo, o
 * campo aparece com a chave crua — `titleLine1`, `secondaryCta` — na tela de
 * quem não programa.
 *
 * Não quebra nada, não aparece em teste de comportamento, e faz a tela parecer
 * inacabada. É exatamente o tipo de coisa que só uma varredura pega.
 */

/** Todas as chaves e caminhos que o formulário vai desenhar. */
function caminhos(valor: unknown, caminho = ""): Array<{ chave: string; caminho: string }> {
  if (valor === null || typeof valor !== "object") return [];

  if (Array.isArray(valor)) {
    return valor.flatMap((item, i) => caminhos(item, `${caminho}.${i}`));
  }

  return Object.entries(valor).flatMap(([chave, item]) => {
    const atual = caminho ? `${caminho}.${chave}` : chave;
    // Índice de lista não vira rótulo — o formulário mostra "Item 1".
    const proprio = /^\d+$/.test(chave) ? [] : [{ chave, caminho: atual }];
    return [...proprio, ...caminhos(item, atual)];
  });
}

describe("rótulos do editor de textos", () => {
  it("nenhum campo aparece com a chave crua em inglês", () => {
    const semRotulo = caminhos(padrao)
      .filter(({ chave, caminho }) => rotular(chave, caminho) === chave)
      .map(({ caminho }) => caminho);

    expect(semRotulo, "campo sem rótulo mostra o nome técnico para a cliente").toEqual([]);
  });

  it("o mapa por caminho vence o mapa por chave", () => {
    /**
     * A regra que resolve as chaves ambíguas. `review` é o passo 2 e é o bloco
     * de revisões; `label` é a palavra do painel e é o texto do botão fixo.
     * Sem a precedência, os dois segundos herdam o nome do primeiro.
     */
    expect(rotular("review", "howItWorks.steps.review")).toBe("2 · Confere");
    expect(rotular("review", "differential.cards.review")).toBe("Bloco das revisões");

    expect(rotular("label", "mockup.tasks.0.label")).toBe("Palavra em maiúsculas");
    expect(rotular("label", "stickyCta.label")).toBe("Texto do botão");
  });

  it("não guarda rótulo por caminho que não existe mais na copy", () => {
    // Caminho órfão é rótulo que ninguém vê — e some do radar quando o campo
    // que ele deveria cobrir volta com outro nome.
    const existentes = new Set(caminhos(padrao).map((c) => c.caminho));
    const orfaos = Object.keys(ROTULOS_POR_CAMINHO).filter((c) => !existentes.has(c));

    expect(orfaos).toEqual([]);
  });

  it("mantém os dois mapas com conteúdo", () => {
    // Piso de sanidade: se a extração mudar de forma, o teste de cima passaria
    // vazio para sempre.
    expect(Object.keys(ROTULOS_POR_CHAVE).length).toBeGreaterThan(20);
    expect(Object.keys(ROTULOS_POR_CAMINHO).length).toBeGreaterThan(2);
  });
});
