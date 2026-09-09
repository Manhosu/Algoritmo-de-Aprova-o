import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A CONFIRMAÇÃO DA REVISÃO PRECISA SOBREVIVER À AÇÃO QUE A CRIA.
 * ============================================================================
 *
 * ⚠️ ESTE TESTE EXISTE PORQUE ERREI O DIAGNÓSTICO DUAS VEZES.
 *
 * A cliente relatou três vezes que o aviso da tela de Revisões não aparecia
 * para ela — a última assim: "continua não aparecendo para mim, em nenhuma das
 * contas que criei". Eu tratei como pressa de leitura e mexi no tempo que a
 * mensagem ficava: primeiro instantâneo, depois seis segundos, depois até o
 * aluno fechar. Ela repetiu a reclamação as três vezes.
 *
 * A causa era outra. `revalidatePath` dentro de uma Server Action faz o Next
 * devolver uma versão nova da página junto da resposta, e o roteador aplica as
 * duas coisas na mesma transição. A revisão concluída já não está em
 * `reviews.due`, então o card DESMONTA no mesmo instante em que o `setDone`
 * pediria a confirmação. Ela nunca chegava a pintar.
 *
 * Nada mais pega isso: typecheck passa, lint passa, o componente está correto
 * lido sozinho, e o defeito só aparece com o navegador aberto na tela certa,
 * com uma revisão vencendo hoje. Por isso a checagem é do código-fonte.
 *
 * Se um dia a revalidação precisar voltar para `completeReviewAction`, o card
 * terá de guardar a confirmação FORA da lista que o servidor devolve — e este
 * teste é o lugar de registrar essa decisão, não de contorná-la.
 */

const RAIZ = process.cwd();

function ler(caminho: string): string {
  return readFileSync(join(RAIZ, caminho), "utf8");
}

/** O corpo de uma função exportada, do `export` até a chave que a fecha. */
function corpoDaFuncao(codigo: string, nome: string): string {
  const inicio = codigo.indexOf(`export async function ${nome}(`);
  expect(inicio, `${nome} não foi encontrada`).toBeGreaterThan(-1);

  const abre = codigo.indexOf("{", codigo.indexOf(")", inicio));
  let profundidade = 0;

  for (let i = abre; i < codigo.length; i++) {
    if (codigo[i] === "{") profundidade++;
    if (codigo[i] === "}") {
      profundidade--;
      if (profundidade === 0) return codigo.slice(abre, i + 1);
    }
  }

  throw new Error(`Não consegui fechar o corpo de ${nome}.`);
}

describe("a confirmação da revisão concluída", () => {
  const acoes = ler("src/components/reviews/actions.ts");

  it("⚠️ completeReviewAction NÃO revalida a rota", () => {
    /*
      É o defeito inteiro numa linha. Revalidar aqui derruba o card antes de o
      aluno ler a data da próxima revisão e o XP que ganhou.
    */
    expect(corpoDaFuncao(acoes, "completeReviewAction")).not.toContain("revalidatePath");
  });

  it("quem revalida é a ação que o botão Fechar chama", () => {
    /*
      A revalidação continua necessária: `router.refresh()` sozinho não trouxe
      dado novo, e a tela ficava mostrando a revisão já concluída. O que muda é
      QUANDO ela roda — quando o aluno pede, não no lugar da mensagem.
    */
    const dispensar = corpoDaFuncao(acoes, "dismissReviewAction");
    expect(dispensar).toContain('revalidatePath("/revisoes")');
    expect(dispensar).toContain('revalidatePath("/inicio")');
  });

  it("o botão Fechar chama essa ação, e não só o refresh do roteador", () => {
    const card = ler("src/components/reviews/review-card.tsx");
    expect(card).toContain("dismissReviewAction");

    /*
      ⚠️ COMENTÁRIO FORA ANTES DE PROCURAR CÓDIGO — a mesma lição de
      `src/app/admin/rotulos.test.ts`. A nota que explica por que o
      `router.refresh()` saiu daqui CITA o `router.refresh()`, e a varredura
      crua reprovava o arquivo justamente por ele estar bem documentado.
    */
    const semComentario = card
      .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
      .replace(/\/\/[^\n]*/g, "");

    expect(semComentario).not.toContain("router.refresh()");
  });

  it("a confirmação mostra a próxima revisão e o XP", () => {
    /*
      São as duas informações que o aluno quer nesse instante, e o motivo de a
      mensagem existir. Um card que só diz "revisado" não valeria a discussão.
    */
    const card = ler("src/components/reviews/review-card.tsx");
    expect(card).toContain("Próxima revisão em");
    expect(card).toContain("XP");
  });
});
