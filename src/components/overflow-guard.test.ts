import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * As colunas do painel precisam poder encolher.
 *
 * POR QUE ESTE TESTE EXISTE
 * ----------------------------------------------------------------------------
 * ⚠️ `min-width: auto` É O PADRÃO DE UM ITEM DE GRID, E ELE NÃO ENCOLHE.
 *
 * O item não fica menor que a largura mínima do conteúdo. Com texto normal isso
 * é a palavra mais longa, e ninguém percebe. Com um `truncate` dentro — que
 * impõe `white-space: nowrap` — o conteúdo deixa de ter largura mínima: a
 * coluna cresce até caber a frase inteira numa linha só.
 *
 * O card "Revisões para hoje" usa `truncate` no nome do assunto. Um assunto de
 * 190 caracteres esticou a Home de 390px para 1402px, e a cliente relatou isso
 * como QUATRO defeitos diferentes, em telas diferentes:
 *
 *   • "o conteúdo fica apertado à esquerda";
 *   • "o menu lateral não se sobrepõe ao conteúdo" (ele é `fixed`: cobre a
 *     viewport de 390 e não a página de 1402);
 *   • "o botão + nunca fica centralizado";
 *   • "sempre fica sobra de espaço na tela à esquerda".
 *
 * Nenhuma ferramenta do portão vê isso: compila, passa no lint, passa nos
 * testes, e só aparece no celular de quem tem um assunto de nome comprido.
 *
 * POR QUE ESTE TESTE É ESTREITO
 * ----------------------------------------------------------------------------
 * A primeira versão varria todos os `.tsx` procurando item de grid/flex sem
 * `min-w-0` em arquivo que usasse `truncate`. Deu dez falsos positivos —
 * `flex-1` numa pilha vertical não transborda, e bento card com parágrafo que
 * quebra também não. Teste que obriga a escrever `min-w-0` onde não precisa
 * vira ruído, e ruído é ignorado.
 *
 * Então ele guarda o lugar EXATO onde o defeito aconteceu: as duas colunas do
 * painel, que hospedam o card com `truncate`.
 */

const HOME = readFileSync(
  join(process.cwd(), "src/app/(app)/inicio/page.tsx"),
  "utf8",
);

describe("colunas do painel", () => {
  it("as duas colunas do grid declaram `min-w-0`", () => {
    const colunas = HOME.match(/className="[^"]*lg:col-span-\d+[^"]*"/g) ?? [];

    expect(colunas.length, "não achei as colunas do painel").toBe(2);

    for (const coluna of colunas) {
      expect(coluna, "coluna sem `min-w-0` estoura a largura da página").toContain(
        "min-w-0",
      );
    }
  });

  it("o card de revisões continua cortando o nome do assunto", () => {
    /**
     * O `truncate` é o que torna o `min-w-0` obrigatório. Se um dia ele sair do
     * card, o teste acima passa a guardar uma regra sem motivo — e este aqui
     * avisa, em vez de deixar a dupla envelhecer em silêncio.
     */
    const cards = readFileSync(
      join(process.cwd(), "src/components/home/dashboard-cards.tsx"),
      "utf8",
    );

    expect(cards).toMatch(/truncate/);
  });

  it("⚠️ os cards lado a lado dentro da coluna também encolhem", () => {
    /*
      O defeito voltou por aqui em 11/09/2026. As colunas tinham `min-w-0`, mas
      o card de desempenho mora numa grade DENTRO da coluna, e item de grade
      começa com `min-width: auto`. "RACIOCÍNIO LÓGICO APLICADO À MATEMÁTICA",
      cortado com `truncate`, esticou o card e a página. A cliente relatou como
      "espaço lateral, e barra de botões embaixo ficando escondida".
    */
    const grades = HOME.match(/className="[^"]*sm:grid-cols-2[^"]*"/g) ?? [];

    expect(grades.length, "não achei a grade dos cards").toBeGreaterThan(0);

    for (const grade of grades) {
      expect(grade, "grade sem `[&>*]:min-w-0` estoura a largura da página").toContain(
        "[&>*]:min-w-0",
      );
    }
  });

  it("o nome da disciplina no card de desempenho quebra linha, e não é cortado", () => {
    const surface = readFileSync(
      join(process.cwd(), "src/components/shared/surface.tsx"),
      "utf8",
    );

    const inicio = surface.indexOf("export function LabeledBar");
    expect(inicio, "LabeledBar não encontrada").toBeGreaterThan(-1);

    const corpo = surface.slice(inicio, surface.indexOf("\n}\n", inicio));
    /* A nota que explica a troca CITA o `truncate`; comentário não conta. */
    const semComentario = corpo.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "");

    expect(semComentario).not.toMatch(/\btruncate\b/);
  });
});
