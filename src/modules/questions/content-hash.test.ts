import { describe, expect, it } from "vitest";

import { questionContentHash } from "./content-hash";

/** sha256("teste"). Fixado à mão: é o cadeado da fórmula. */
const HASH_DE_TESTE = "46070d4bf934fb0d4b06d9e2c46e346944e322444900a435d7d9a95e6d7435f5";

describe("questionContentHash", () => {
  it("ignora espaço em volta, caixa e espaço interno repetido", () => {
    /*
      São as três diferenças que a mesma questão ganha ao ser colada de novo no
      Excel. Se cada uma gerasse um hash novo, o índice único não impediria
      reenvio nenhum — que foi exatamente o defeito que motivou este módulo.
    */
    const base = questionContentHash("Qual é a capital do Brasil?");

    expect(questionContentHash("  Qual é a capital do Brasil?  ")).toBe(base);
    expect(questionContentHash("QUAL É A CAPITAL DO BRASIL?")).toBe(base);
    expect(questionContentHash("Qual  é   a capital do Brasil?")).toBe(base);
    expect(questionContentHash("Qual é a capital\ndo Brasil?")).toBe(base);
    expect(questionContentHash("Qual é a capital\t do Brasil?")).toBe(base);
  });

  it("DISTINGUE enunciados que diferem em acento ou pontuação", () => {
    /*
      Aqui a normalização para: "e" e "é" são palavras diferentes, e tratar as
      duas como a mesma questão descartaria conteúdo real.
    */
    const comAcento = questionContentHash("Qual é a capital?");

    expect(questionContentHash("Qual e a capital?")).not.toBe(comAcento);
    expect(questionContentHash("Qual é a capital")).not.toBe(comAcento);
  });

  it("é estável — o valor não pode mudar sem recalcular o acervo", () => {
    /*
      ⚠️ ESTE TESTE É UM CADEADO, não uma verificação de correção.

      `content_hash` está gravado em 1.046 linhas. Mudar a fórmula sem recalcular
      todas faz o índice único parar de casar com o que existe, e o produto volta
      a aceitar duplicatas em silêncio — foi o defeito que criou este módulo.

      Se este teste falhar, a pergunta não é "como conserto o teste": é "eu
      pretendia mudar a chave de deduplicação e vou rodar o recálculo do acervo?"
    */
    expect(questionContentHash("teste")).toBe(HASH_DE_TESTE);
  });

  it("devolve sempre 64 caracteres hexadecimais", () => {
    // `questions.content_hash` é varchar(64); um hash maior estouraria a coluna.
    const hash = questionContentHash("qualquer enunciado");

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
