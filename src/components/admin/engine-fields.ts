/**
 * Os campos de um formulário de configuração de motor.
 *
 * ⚠️ ARQUIVO SEPARADO, SEM `"use client"` — e é por isso que ele existe.
 *
 * `camposDe` nasceu dentro de `engine-form.tsx`, que é um Client Component. Num
 * módulo `"use client"` o Next transforma TODA exportação numa referência de
 * cliente: a página, que roda no servidor, receberia um marcador em vez da
 * função e quebraria ao chamá-la. Tipo não sofre disso (TypeScript apaga tipo),
 * então o problema só apareceria em runtime.
 *
 * Aqui a função é simplesmente uma função, e os dois lados a importam.
 */

export type CampoConfig = {
  chave: string;
  rotulo: string;
  ajuda?: string;
  valor: number;
  sufixo?: string;
};

/**
 * Monta os campos a partir dos VALORES NO AR, com os rótulos de cada chave.
 *
 * ⚠️ A LISTA DE CAMPOS NÃO É ESCRITA À MÃO, e não é preciosismo.
 *
 * A ação de publicar lê exatamente as chaves que a configuração declara: um
 * campo esquecido no formulário vira "o campo X veio vazio" na cara de quem
 * tentou publicar. Derivando do próprio objeto, esquecer é impossível, e o
 * `Record<keyof T, …>` faz o TypeScript cobrar o rótulo de qualquer chave nova
 * no momento em que ela é acrescentada ao schema.
 */
export function camposDe<T extends Record<string, number>>(
  valores: T,
  rotulos: Record<keyof T, { rotulo: string; ajuda?: string }>,
  sufixo: string,
): CampoConfig[] {
  return Object.entries(valores).map(([chave, valor]) => ({
    chave,
    valor,
    sufixo,
    ...rotulos[chave as keyof T],
  }));
}
