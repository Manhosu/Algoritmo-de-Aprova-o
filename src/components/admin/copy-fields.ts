import { rotular } from "./copy-labels";

/**
 * A ÁRVORE DE CAMPOS DO EDITOR DE TEXTOS, E O CAMINHO DE VOLTA.
 * ============================================================================
 *
 * ⚠️ O FORMULÁRIO DESENHA ESTA ÁRVORE, E O TESTE CONFERE ESTA ÁRVORE.
 *
 * Palavras da cliente em 10/09/2026: "não estou conseguindo salvar alterações
 * na Landing Page, aparece o erro abaixo".
 *
 * A copy de 04/09 trouxe listas de TEXTO PURO — as cinco dores, as sete
 * etiquetas, as nove etapas do ciclo. O formulário antigo só sabia desenhar
 * lista de objetos: item que era texto caía num `return null` e não virava
 * campo nenhum. Dez listas nunca eram enviadas, o schema recusava todas, e
 * publicar falhava até sem mudar uma vírgula.
 *
 * O teste daquela época conferia os RÓTULOS, não os campos. Agora a estrutura
 * mora aqui, pura: o formulário não tem como desenhar algo que a árvore não
 * tenha, e o teste remonta a árvore e passa pelo schema — exatamente o que a
 * publicação faz.
 */

export type No =
  | { tipo: "grupo"; id: string; titulo: string; filhos: No[]; nota?: string }
  | { tipo: "texto"; nome: string; rotulo: string; valor: string; longo: boolean }
  | { tipo: "marcador"; nome: string; rotulo: string; valor: boolean };

/** Campos que ganham `textarea` pelo nome; o resto ganha pelo tamanho do texto. */
const LONGOS = new Set(["subtitle", "body", "footnote", "intro"]);

const NOTA_DE_LISTA = "A quantidade de itens é fixa — o desenho da tela depende dela.";

export function montarArvore(copy: object): No[] {
  return Object.entries(copy).map(([chave, valor]) => no(chave, chave, valor, rotular(chave)));
}

function no(caminho: string, chave: string, valor: unknown, titulo: string): No {
  if (Array.isArray(valor)) {
    return {
      tipo: "grupo",
      id: caminho,
      titulo,
      nota: NOTA_DE_LISTA,
      filhos: valor.map((item, i) => {
        const nome = `${caminho}.${i}`;
        const rotulo = `Item ${i + 1}`;

        /*
          ⚠️ O ITEM QUE É TEXTO PURO VIRA CAMPO. Era esta linha que faltava: o
          formulário antigo só descia em objetos, e `["dor 1", "dor 2"]` sumia.
        */
        return ehObjeto(item) ? grupo(nome, rotulo, item) : folha(nome, rotulo, chave, item);
      }),
    };
  }

  if (ehObjeto(valor)) return grupo(caminho, titulo, valor);

  return folha(caminho, titulo, chave, valor);
}

function grupo(caminho: string, titulo: string, objeto: object): No {
  return {
    tipo: "grupo",
    id: caminho,
    titulo,
    filhos: Object.entries(objeto).map(([chave, valor]) => {
      const nome = `${caminho}.${chave}`;
      return no(nome, chave, valor, rotular(chave, nome));
    }),
  };
}

function folha(nome: string, rotulo: string, chave: string, valor: unknown): No {
  if (typeof valor === "boolean") return { tipo: "marcador", nome, rotulo, valor };

  const texto = typeof valor === "string" ? valor : String(valor ?? "");
  return { tipo: "texto", nome, rotulo, valor: texto, longo: LONGOS.has(chave) || texto.length > 100 };
}

function ehObjeto(valor: unknown): valor is object {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

/**
 * Remonta o objeto da copy a partir dos campos enviados.
 *
 * O formulário manda campos planos com o CAMINHO no nome — `hero.titleLine1`,
 * `pains.items.0`. Aqui eles voltam a ser o objeto que o schema espera.
 */
export function remontar(campos: Iterable<[string, FormDataEntryValue]>): Record<string, unknown> {
  const objeto: Record<string, unknown> = {};

  for (const [chave, valor] of campos) {
    /* `note` é a anotação da versão; `$ACTION_…` é o que o React acrescenta. */
    if (chave === "note" || chave.startsWith("$") || typeof valor !== "string") continue;
    atribuir(objeto, chave.split("."), valor);
  }

  return objeto;
}

/**
 * Escreve `valor` no caminho dado, criando o que faltar.
 *
 * Um segmento que é número vira índice de lista — é assim que
 * `mockup.tasks.0.value` volta a ser um array. `"true"`/`"false"` viram
 * booleano, porque o `done` do painel de exemplo é uma caixa de seleção e o
 * schema espera booleano de verdade.
 */
function atribuir(alvo: Record<string, unknown>, caminho: string[], valor: string): void {
  let atual: Record<string, unknown> | unknown[] = alvo;

  for (let i = 0; i < caminho.length - 1; i += 1) {
    const chave = caminho[i];
    const proximaEhIndice = /^\d+$/.test(caminho[i + 1]);
    const container = atual as Record<string, unknown>;

    container[chave] ??= proximaEhIndice ? [] : {};
    atual = container[chave] as Record<string, unknown> | unknown[];
  }

  const ultima = caminho[caminho.length - 1];
  const destino = atual as Record<string, unknown>;

  destino[ultima] = valor === "true" ? true : valor === "false" ? false : valor;
}
