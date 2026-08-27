import { describe, expect, it } from "vitest";

import { estimateCostCents, totalInputTokens } from "./index";

const MODELO = "claude-opus-5";

/**
 * A CLIENTE PAGA ESTA CONTA.
 *
 * O número gravado em `edital_extractions.estimated_cost_cents` é o que diz
 * quanto o produto custa por aluno. Subestimar é o pior erro possível: some do
 * radar de quem paga.
 */
describe("custo da leitura de edital", () => {
  it("NÃO ignora os tokens que foram para o cache", () => {
    /*
     * ⚠️ A FORMA EXATA DO BUG QUE ISTO IMPEDE DE VOLTAR.
     *
     * O edital vai com `cache_control: ephemeral`, então a API tira esses
     * tokens de `input_tokens` e os põe em `cache_creation_input_tokens`.
     * Contando só o primeiro, um edital de quase 8.000 tokens era registrado
     * como 309 — e o custo saía cerca de 40% abaixo do cobrado.
     */
    const soOResto = estimateCostCents(
      { inputTokens: 309, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 3_003 },
      MODELO,
    );
    const contaCompleta = estimateCostCents(
      { inputTokens: 309, cacheCreationTokens: 7_900, cacheReadTokens: 0, outputTokens: 3_003 },
      MODELO,
    );

    expect(contaCompleta).toBeGreaterThan(soOResto);
    // Não é arredondamento: é a maior parte da entrada.
    expect(contaCompleta - soOResto).toBeGreaterThanOrEqual(4);
  });

  it("cobra a criação de cache mais caro que a entrada comum", () => {
    const comum = estimateCostCents(
      { inputTokens: 1_000_000, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0 },
      MODELO,
    );
    const escrita = estimateCostCents(
      { inputTokens: 0, cacheCreationTokens: 1_000_000, cacheReadTokens: 0, outputTokens: 0 },
      MODELO,
    );

    expect(escrita).toBeGreaterThan(comum);
  });

  it("cobra a leitura de cache muito mais barato — é o que barateia a releitura", () => {
    const comum = estimateCostCents(
      { inputTokens: 1_000_000, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0 },
      MODELO,
    );
    const leitura = estimateCostCents(
      { inputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 1_000_000, outputTokens: 0 },
      MODELO,
    );

    expect(leitura).toBeLessThan(comum / 5);
  });

  it("soma os três lugares onde a API reporta entrada", () => {
    expect(
      totalInputTokens({
        inputTokens: 309,
        cacheCreationTokens: 7_900,
        cacheReadTokens: 100,
        outputTokens: 3_003,
      }),
    ).toBe(8_309);
  });

  it("nunca devolve zero quando houve consumo", () => {
    // Zero arredondado esconde a leitura do relatório de custo.
    expect(
      estimateCostCents(
        { inputTokens: 1, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 1 },
        MODELO,
      ),
    ).toBeGreaterThan(0);
  });

  it("modelo desconhecido assume o preço mais caro", () => {
    const conhecido = estimateCostCents(
      { inputTokens: 1_000_000, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0 },
      "claude-haiku-4-5-20251001",
    );
    const desconhecido = estimateCostCents(
      { inputTokens: 1_000_000, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0 },
      "modelo-que-ainda-nao-existe",
    );

    expect(desconhecido).toBeGreaterThan(conhecido);
  });
});
