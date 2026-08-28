import { describe, expect, it } from "vitest";

import { findContentRange } from "./pdf-text";

/**
 * O recorte do anexo de conteúdo programático.
 *
 * POR QUE ESTE TESTE EXISTE
 * ----------------------------------------------------------------------------
 * Dois editais da VUNESP que a cliente testou voltaram "sem conteúdo
 * programático". O PDF tinha o anexo inteiro; o recorte é que mandava à IA as
 * páginas erradas — ele começava na primeira MENÇÃO ao conteúdo programático,
 * que no corpo do edital é uma referência cruzada, e terminava no cabeçalho do
 * anexo verdadeiro. Parava uma página antes do que importava.
 *
 * Falhou em silêncio: a leitura rodava, era paga, e devolvia um plano vazio.
 *
 * As páginas abaixo são reproduções fiéis do que o extrator devolve para esses
 * dois editais, incluindo as quebras de linha que criam falsos cabeçalhos.
 */

/** Página de miolo, com a citação cruzada que enganava o recorte. */
const CITACAO_GUARAREMA = `PREFEITURA MUNICIPAL DE GUARAREMA
A prova objetiva será elaborada de acordo com o Anexo I
– CONTEÚDO PROGRAMÁTICO deste Edital.`;

/** Falso cabeçalho: o layout quebrou a linha antes de "Anexo II". */
const FALSO_CABECALHO = `A convocação será publicada conforme o
Anexo II. A relação será divulgada no site da Fundação VUNESP, não podendo
alegar desconhecimento.`;

const ANEXO_CONTEUDO_GUARAREMA = `ANEXO I – CONTEÚDO PROGRAMÁTICO
LÍNGUA PORTUGUESA: Interpretação de texto. Ortografia.`;

const ANEXO_CRONOGRAMA = `ANEXO II – CRONOGRAMA PREVISTO
Início do Período de Inscrições. 22/07/2026`;

function paginas(mapa: Record<number, string>, total: number): string[] {
  return Array.from({ length: total }, (_, i) => mapa[i + 1] ?? `pagina ${i + 1} de texto comum`);
}

describe("recorte do conteúdo programático", () => {
  it("ancora no cabeçalho do anexo, não na citação que vem antes", () => {
    /**
     * O caso do edital de Guararema, encurtado: citação na 13, falso cabeçalho
     * na 11, anexo de verdade na 29, próximo anexo na 61.
     *
     * O recorte antigo devolvia 12→28 (base 0), ou seja páginas 13 a 28: o
     * miolo administrativo, e nenhuma disciplina.
     */
    const doc = paginas(
      {
        11: FALSO_CABECALHO,
        13: CITACAO_GUARAREMA,
        29: ANEXO_CONTEUDO_GUARAREMA,
        61: ANEXO_CRONOGRAMA,
      },
      61,
    );

    expect(findContentRange(doc)).toEqual({ from: 28, to: 60 });
  });

  it("ignora citação capitalizada no meio de frase ao procurar o fim", () => {
    /**
     * O caso da Câmara de Assis: o anexo de conteúdo é o ANEXO II, e entre ele
     * e o ANEXO III existem páginas cujo texto quebra a linha antes de
     * "Anexo I." e "Anexo II.". Se essas contassem como cabeçalho, o recorte
     * terminaria cedo e perderia metade das disciplinas.
     */
    const doc = paginas(
      {
        8: FALSO_CABECALHO,
        17: `a prova será elaborada de acordo com o conteúdo programático constante do
Anexo II.`,
        37: "ANEXO I – DAS ATRIBUIÇÕES DOS CARGOS",
        41: "ANEXO II – DO CONTEÚDO PROGRAMÁTICO\nLÍNGUA PORTUGUESA: Crase.",
        45: "matéria continua aqui, e o texto cita o\nAnexo I. de novo",
        53: "ANEXO III – DO REQUERIMENTO DE INCLUSÃO E USO DO NOME SOCIAL",
        57: "ANEXO VII - DO CRONOGRAMA PREVISTO",
      },
      58,
    );

    expect(findContentRange(doc)).toEqual({ from: 40, to: 52 });
  });

  it("volta para a primeira menção quando não há cabeçalho de anexo", () => {
    // Edital pequeno, com o programa no corpo do texto e nenhum anexo nomeado.
    const doc = paginas({ 4: "CONTEÚDO PROGRAMÁTICO\nMatemática: razão e proporção." }, 6);

    expect(findContentRange(doc)).toEqual({ from: 3, to: 6 });
  });

  it("devolve nulo quando o edital não fala de conteúdo programático", () => {
    // Sem âncora, o chamador manda o edital inteiro — cortar no escuro perderia
    // conteúdo do aluno sem ninguém perceber.
    expect(findContentRange(paginas({}, 5))).toBeNull();
  });

  it("aceita as três redações que as bancas usam", () => {
    for (const titulo of [
      "ANEXO I – CONTEÚDO PROGRAMÁTICO",
      "ANEXO I – OBJETOS DE AVALIAÇÃO",
      "ANEXO I – PROGRAMA DAS PROVAS",
    ]) {
      const doc = paginas({ 3: titulo, 9: ANEXO_CRONOGRAMA }, 10);
      expect(findContentRange(doc), titulo).toEqual({ from: 2, to: 8 });
    }
  });
});
