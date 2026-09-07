import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";

import { parseMaterialSheet } from "./materials";

/**
 * ⚠️ A PLANILHA É MONTADA AQUI, e não guardada como arquivo binário.
 *
 * Um `.xlsx` commitado no repositório é opaco: ninguém revisa o que mudou nele,
 * e ajustar um caso de teste exige abrir o Excel. Montando o zip no próprio
 * teste, cada cenário fica legível em texto e o leitor é exercitado de verdade
 * — inclusive o escape de XML, que é onde um acento quebraria.
 */
function planilha(linhas: string[][]): Uint8Array {
  const escapar = (v: string) =>
    v
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const linhasXml = linhas
    .map((celulas, i) => {
      const cols = celulas
        .map(
          (valor, j) =>
            `<c r="${String.fromCharCode(65 + j)}${i + 1}" t="inlineStr">` +
            `<is><t>${escapar(valor)}</t></is></c>`,
        )
        .join("");
      return `<row r="${i + 1}">${cols}</row>`;
    })
    .join("");

  const sheet =
    `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${linhasXml}</sheetData></worksheet>`;

  const workbook =
    `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="Materiais" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const rels =
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ` +
    `Target="worksheets/sheet1.xml"/></Relationships>`;

  return zipSync({
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(rels),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  });
}

const CABECALHO = [
  "Título",
  "Tipo",
  "Disciplina",
  "Assunto",
  "Endereço",
  "Descrição",
  "Quem pode ver",
];

describe("planilha de materiais", () => {
  it("lê uma linha completa", () => {
    const r = parseMaterialSheet(
      planilha([
        CABECALHO,
        [
          "Crase — mapa",
          "Mapa mental",
          "Língua Portuguesa",
          "Crase",
          "https://exemplo.com/a.png",
          "Um mapa",
          "Só no Completo",
        ],
      ]),
    );

    expect(r.issues).toEqual([]);
    expect(r.materials[0]).toEqual({
      title: "Crase — mapa",
      type: "mind_map",
      subjectName: "Língua Portuguesa",
      topicName: "Crase",
      externalUrl: "https://exemplo.com/a.png",
      description: "Um mapa",
      requiredAccessLevel: "full",
    });
  });

  it("aceita o tipo escrito de várias formas", () => {
    /*
      A cliente escreve "Mapa Mental", "mapa mental" e "Mapas mentais" na mesma
      planilha. Recusar por causa da caixa ou do acento faria ela caçar a linha
      errada num arquivo de duzentas.
    */
    const r = parseMaterialSheet(
      planilha([
        CABECALHO,
        ["Mapa de crase", "MAPA MENTAL", "Língua Portuguesa", "Crase", "", "", ""],
        ["Aula de crase", "videoaula", "Língua Portuguesa", "Crase", "", "", ""],
        ["Cartões de crase", "Flashcards", "Língua Portuguesa", "Crase", "", "", ""],
        ["Resumo de crase", "Resumo", "Língua Portuguesa", "Crase", "", "", ""],
      ]),
    );

    expect(r.issues).toEqual([]);
    expect(r.materials.map((m) => m.type)).toEqual([
      "mind_map",
      "video",
      "flashcard_deck",
      "study_text",
    ]);
  });

  it("acesso em branco vale o nível mais aberto", () => {
    /*
      ⚠️ O PADRÃO É O MAIS ABERTO, e a escolha tem consequência.

      Coluna em branco virando "Só no Completo" esconderia material do plano que
      deveria vê-lo, e ninguém reclamaria: o aluno não sabe o que não aparece.
      O erro para o lado aberto fica visível na lista do painel.
    */
    const r = parseMaterialSheet(
      planilha([CABECALHO, ["Resumo de crase", "Resumo", "Língua Portuguesa", "Crase", "", "", ""]]),
    );

    expect(r.materials[0].requiredAccessLevel).toBe("limited");
  });

  it("recusa linha e diz o número dela", () => {
    const r = parseMaterialSheet(
      planilha([
        CABECALHO,
        ["Material bom", "Resumo", "Língua Portuguesa", "Crase", "", "", ""],
        ["Podcast novo", "Podcast", "Língua Portuguesa", "Crase", "", "", ""],
        ["Link torto", "Resumo", "Língua Portuguesa", "Crase", "exemplo.com", "", ""],
        ["Sem disciplina", "Resumo", "", "Crase", "", "", ""],
      ]),
    );

    expect(r.materials).toHaveLength(1);
    expect(r.issues.map((i) => i.row)).toEqual([3, 4, 5]);
    expect(r.issues[0].message).toMatch(/Tipo "Podcast" não reconhecido/);
    expect(r.issues[1].message).toMatch(/precisa começar com http/);
    expect(r.issues[2].message).toMatch(/Disciplina em branco/);
  });

  it("título repetido aponta a linha anterior", () => {
    /*
      Sem o número da primeira ocorrência, "título repetido" manda a cliente
      procurar num arquivo de duzentas linhas o que ela repetiu.
    */
    const r = parseMaterialSheet(
      planilha([
        CABECALHO,
        ["Crase", "Resumo", "Língua Portuguesa", "Crase", "", "", ""],
        ["Outro material", "Resumo", "Língua Portuguesa", "Crase", "", "", ""],
        ["CRASE", "Resumo", "Língua Portuguesa", "Crase", "", "", ""],
      ]),
    );

    expect(r.materials).toHaveLength(2);
    expect(r.issues[0].message).toMatch(/já apareceu na linha 2/);
  });

  it("linha vazia no fim da planilha é ignorada em silêncio", () => {
    /*
      O Excel gera linhas vazias com frequência. Contá-las como erro faria um
      arquivo perfeito voltar com "12 linhas recusadas".
    */
    const r = parseMaterialSheet(
      planilha([
        CABECALHO,
        ["Material único", "Resumo", "Língua Portuguesa", "Crase", "", "", ""],
        ["", "", "", "", "", "", ""],
        ["", "", "", "", "", "", ""],
      ]),
    );

    expect(r.materials).toHaveLength(1);
    expect(r.issues).toEqual([]);
  });

  it("as três últimas colunas podem faltar no cabeçalho", () => {
    /*
      Material sem endereço entra como rascunho, descrição é opcional e o acesso
      tem padrão. Exigir as sete recusaria uma planilha boa por causa de uma
      coluna que ela não precisa preencher.
    */
    const r = parseMaterialSheet(
      planilha([
        ["Título", "Tipo", "Disciplina", "Assunto"],
        ["Resumo curto de crase", "Resumo", "Língua Portuguesa", "Crase"],
      ]),
    );

    expect(r.issues).toEqual([]);
    expect(r.materials[0].externalUrl).toBeNull();
  });

  it("cabeçalho fora do padrão falha alto, com o que falta", () => {
    expect(() =>
      parseMaterialSheet(planilha([["Nome", "Categoria"], ["a", "b"]])),
    ).toThrow(/Colunas ausentes/);
  });
});
