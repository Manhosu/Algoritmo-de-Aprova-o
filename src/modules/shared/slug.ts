/**
 * "Mentoria de 30 minutos" → "mentoria-de-30-minutos".
 *
 * ⚠️ `normalize("NFD")` SEPARA a letra do acento, e só depois o acento pode ser
 * removido.
 *
 * Sem o NFD, "ã" é um único code point que não é um diacrítico e sobrevive ao
 * filtro — aí `[^a-z0-9]` o transforma em hífen, e "Revisão" vira "revis-o"
 * enquanto "Revisao" vira "revisao". Como o código é a chave natural do item da
 * loja, dois códigos para o mesmo nome significam duas linhas iguais na
 * vitrine, e ninguém entende de onde saiu a segunda.
 *
 * `\p{Diacritic}` em vez da faixa U+0300–U+036F escrita à mão: a faixa literal
 * é composta por caracteres combinantes, que são INVISÍVEIS no editor e somem
 * numa cópia descuidada. A propriedade Unicode diz o que faz e sobrevive a
 * copiar e colar.
 */
export function toSlug(texto: string, maxLength = 60): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
}
