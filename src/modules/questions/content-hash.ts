import { createHash } from "node:crypto";

/**
 * A CHAVE DE DEDUPLICAÇÃO DE UMA QUESTÃO.
 * ============================================================================
 *
 * `questions.content_hash` tem índice único. É ele que impede a mesma questão
 * de entrar duas vezes quando uma planilha é reenviada.
 *
 * ⚠️ ESTA FUNÇÃO EXISTE PORQUE A FÓRMULA JÁ DIVERGIU UMA VEZ, e o efeito ficou
 * escondido por semanas.
 *
 * O cálculo estava escrito à mão dentro do script de importação. Quando a tela
 * de importação nasceu, a linha foi copiada — e os hashes das 1.046 questões
 * que já estavam no acervo tinham sido gerados por uma versão ANTERIOR da mesma
 * linha. Resultado: nenhum reenvio conflitava com nada. Importar de novo a
 * mesma planilha gravava tudo outra vez, sem erro, sem aviso, e o acervo
 * dobrava em silêncio. Foi assim que 94 questões duplicadas entraram numa
 * conferência.
 *
 * Um índice único só protege enquanto os dois lados calculam a MESMA coisa.
 * Com a fórmula num lugar só, testada, mudá-la vira uma decisão consciente que
 * obriga a recalcular o acervo — em vez de um acidente de cópia.
 *
 * A NORMALIZAÇÃO
 * ----------------------------------------------------------------------------
 * Espaço em volta, caixa e espaços internos repetidos não distinguem questões:
 * a mesma questão colada de novo no Excel costuma ganhar um espaço a mais ou
 * uma quebra de linha diferente. Acento e pontuação FICAM, porque aí já seriam
 * enunciados diferentes de verdade.
 */
export function questionContentHash(statement: string): string {
  const normalizado = statement.trim().toLowerCase().replace(/\s+/g, " ");

  return createHash("sha256").update(normalizado).digest("hex");
}
