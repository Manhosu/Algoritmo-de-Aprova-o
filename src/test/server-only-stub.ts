/**
 * Substituto de `server-only` durante os testes.
 *
 * O pacote real estoura ao ser importado fora do grafo de Server Components do
 * Next.js — o que é exatamente o que queremos no build, e exatamente o que
 * impediria testar qualquer módulo de servidor.
 *
 * A proteção não é enfraquecida: quem garante que código de servidor não vaza
 * para o cliente é o `next build`, e lá o pacote real continua valendo.
 * O apelido está em `vitest.config.ts`.
 */
export {};
