/**
 * QUANTO CUSTOU UMA CHAMADA À IA.
 * ============================================================================
 *
 * Motor puro: sem banco, sem rede, sem variável de ambiente. Fica aqui — e não
 * dentro do extrator — porque a cliente paga a conta da Anthropic e vai ter
 * volume: este é um número que precisa ser testável sozinho.
 *
 * ⚠️ O ERRO QUE ESTE MÓDULO EXISTE PARA IMPEDIR
 * ----------------------------------------------------------------------------
 * O bloco do edital é enviado com `cache_control: ephemeral`. Havendo cache, a
 * API NÃO conta esses tokens em `usage.input_tokens`: ela os move para
 * `cache_creation_input_tokens` (primeira chamada) ou
 * `cache_read_input_tokens` (repetição), deixando `input_tokens` apenas com o
 * resto do prompt.
 *
 * Somando só `input_tokens`, um edital de quase 8.000 tokens era registrado
 * como 309, e o custo gravado saía cerca de 40% abaixo do cobrado. Subestimar
 * custo é o pior dos erros aqui: ele some do radar de quem paga a conta.
 */

export type TokenUsage = {
  /** Entrada normal, fora do cache. */
  inputTokens: number;
  /** Tokens que CRIARAM o cache nesta chamada. */
  cacheCreationTokens: number;
  /** Tokens LIDOS de um cache já existente. */
  cacheReadTokens: number;
  outputTokens: number;
};

export type ModelPrice = {
  /** Dólares por milhão de tokens de entrada. */
  input: number;
  /** Dólares por milhão de tokens de saída. */
  output: number;
};

/**
 * Preços por milhão de tokens.
 *
 * ⚠️ Fixos no código de propósito: o custo gravado em `edital_extractions`
 * precisa refletir o que foi COBRADO na época, e um preço lido de configuração
 * mudaria o histórico retroativamente.
 */
export const PRICE_PER_MTOK: Record<string, ModelPrice> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

/** Escrever no cache custa mais que a entrada comum. */
export const CACHE_WRITE_MULTIPLIER = 1.25;

/** Ler do cache custa quase nada — é o que barateia a releitura do mesmo edital. */
export const CACHE_READ_MULTIPLIER = 0.1;

/** Preço do modelo; sem preço conhecido, assume o mais caro da tabela. */
export function priceFor(model: string): ModelPrice {
  return PRICE_PER_MTOK[model] ?? { input: 5, output: 25 };
}

/** Custo em dólares, com cada tipo de token cobrado pelo que ele vale. */
export function estimateCostDollars(usage: TokenUsage, model: string): number {
  const price = priceFor(model);

  return (
    (usage.inputTokens / 1_000_000) * price.input +
    (usage.cacheCreationTokens / 1_000_000) * price.input * CACHE_WRITE_MULTIPLIER +
    (usage.cacheReadTokens / 1_000_000) * price.input * CACHE_READ_MULTIPLIER +
    (usage.outputTokens / 1_000_000) * price.output
  );
}

/**
 * Custo em centavos de dólar, arredondado PARA CIMA.
 *
 * Para cima porque uma leitura barata arredondada a zero desaparece do
 * relatório de custo — e o que some do relatório não é gerenciado.
 */
export function estimateCostCents(usage: TokenUsage, model: string): number {
  return Math.ceil(estimateCostDollars(usage, model) * 100);
}

/** Total de tokens de entrada, somando os três lugares onde a API os reporta. */
export function totalInputTokens(usage: TokenUsage): number {
  return usage.inputTokens + usage.cacheCreationTokens + usage.cacheReadTokens;
}
