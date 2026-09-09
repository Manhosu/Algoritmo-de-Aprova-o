import { describe, expect, it } from "vitest";

import { separarAssuntos } from "./questions";

/**
 * A CÉLULA "ASSUNTO" COM MAIS DE UM ASSUNTO.
 * ============================================================================
 *
 * Palavras da cliente em 09/09/2026: "ao subir questões da Vunesp notei que tem
 * questões que possuem mais de um assunto que são separados por ';'. Tem como o
 * sistema aceitar dessa forma e cadastrar a mesma questão em cada um dos
 * assuntos?".
 *
 * ⚠️ O DEFEITO NÃO ERA SÓ UMA FALTA DE RECURSO.
 *
 * Antes desta separação, "Crase; Concordância" era tratado como o nome de um
 * assunto só. Ele não casava com nada no catálogo, e o importador — que desde
 * 06/09/2026 cria assunto novo em vez de descartar a questão — cadastrava um
 * assunto canônico chamado "Crase; Concordância". A questão ia parar num
 * assunto que edital nenhum menciona, fora do alcance do cronograma e da
 * Tarefa do Dia.
 */

describe("separarAssuntos", () => {
  it("separa a célula da VUNESP no ponto e vírgula", () => {
    expect(separarAssuntos("Crase; Concordância")).toEqual(["Crase", "Concordância"]);
  });

  it("aceita o ';' sem espaço e com espaço sobrando", () => {
    expect(separarAssuntos("Crase;Concordância ;  Regência ")).toEqual([
      "Crase",
      "Concordância",
      "Regência",
    ]);
  });

  it("uma célula comum continua sendo um assunto só", () => {
    expect(separarAssuntos("Direito Administrativo")).toEqual(["Direito Administrativo"]);
  });

  it("⚠️ NÃO separa na vírgula", () => {
    /*
      O catálogo dela tem assunto com vírgula no nome, e é comum:
      "Elaboração, execução, monitoramento e avaliação" é UM assunto do edital.
      Separar por vírgula quebraria dezenas deles em pedaços que não casam com
      nada, e cada pedaço viraria um assunto canônico novo — trocando o defeito
      de lugar em vez de resolvê-lo.
    */
    expect(separarAssuntos("Planejamento estratégico, tático e operacional")).toEqual([
      "Planejamento estratégico, tático e operacional",
    ]);
  });

  it("descarta o repetido e o vazio entre dois ';'", () => {
    /*
      A chave primária de `question_topics` é (questão, assunto). Duas linhas
      iguais fariam a importação inteira estourar numa questão só.
    */
    expect(separarAssuntos("Crase; crase")).toEqual(["Crase"]);
    expect(separarAssuntos("Crase;; Concordância;")).toEqual(["Crase", "Concordância"]);
  });

  it("célula só com ';' não vira assunto nenhum", () => {
    /* Quem chama trata como linha sem assunto, e a linha é recusada com motivo. */
    expect(separarAssuntos(" ; ; ")).toEqual([]);
  });
});
