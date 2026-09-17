import { taxonomyKey } from "@/modules/taxonomy/normalize";

/**
 * A BANCA DA PLANILHA, CASADA COM A DO CADASTRO.
 * ============================================================================
 *
 * ⚠️ NASCEU DE UMA IMPORTAÇÃO QUE ENTROU INTEIRA NA BANCA ERRADA.
 *
 * Em 17/09/2026 a cliente importou "CEBRASPE -2026 - MATEMÁTICA.xlsx", 109
 * questões, e o filtro por Cebraspe no Banco não achou nenhuma: o nome escrito
 * na coluna Banca não era igual ao do cadastro, então tudo caiu em Autoral.
 *
 * O casamento exato não serve para uma coluna digitada à mão. Ela escreve
 * "Cespe", "CESPE/UnB", "CEBRASPE 2026" e "Fundação Carlos Chagas" para as
 * mesmas três bancas.
 *
 * Aqui vão três tentativas, da mais segura para a mais tolerante:
 *
 *   1. o nome inteiro, normalizado (é o que já funcionava);
 *   2. um apelido conhecido ("cespe" é a Cebraspe desde 2018);
 *   3. o nome curto ou o apelido APARECENDO dentro do texto, como palavra.
 *
 * ⚠️ O PASSO 3 EXIGE PALAVRA INTEIRA. Com `includes` cru, "fcc" casaria dentro
 * de "fccx" e a planilha de uma banca desconhecida entraria como FCC — errar a
 * banca em silêncio é exatamente o defeito que este módulo existe para corrigir.
 */

export type BancaCadastrada = {
  id: string;
  slug: string;
  shortName: string;
  name: string;
};

/**
 * Apelidos que a cliente usa e que não são o nome cadastrado.
 *
 * A chave e o valor passam pela mesma normalização do casador, então "CESPE/UnB"
 * e "cespe unb" chegam aqui do mesmo jeito.
 */
const APELIDOS: Record<string, string> = {
  cespe: "cebraspe",
  "cespe unb": "cebraspe",
  "cespe cebraspe": "cebraspe",
  "cebraspe cespe": "cebraspe",
  cesgranrio: "cesgranrio",
  "fundacao carlos chagas": "fcc",
  "fundacao getulio vargas": "fgv",
  "instituto quadrix": "quadrix",
  "instituto aocp": "aocp",
  "consulplan": "consulplan",
  "fundacao vunesp": "vunesp",
  "instituto brasileiro de formacao e capacitacao": "ibfc",
};

function chavesDa(banca: BancaCadastrada): string[] {
  return [taxonomyKey(banca.shortName), taxonomyKey(banca.name), taxonomyKey(banca.slug)].filter(
    (chave) => chave.length > 0,
  );
}

/** Um termo aparece no texto como palavra inteira? */
function contemTermo(texto: string, termo: string): boolean {
  if (termo.length < 3) return false;
  const palavras = texto.split(/[^a-z0-9]+/);
  if (palavras.includes(termo)) return true;

  /* Nome com mais de uma palavra ("fundacao carlos chagas"). */
  return termo.includes(" ") && texto.includes(termo);
}

export function casarBanca(
  valorDaPlanilha: string | null | undefined,
  bancas: BancaCadastrada[],
): BancaCadastrada | null {
  const texto = taxonomyKey(valorDaPlanilha ?? "");
  if (!texto) return null;

  const porChave = new Map<string, BancaCadastrada>();
  for (const banca of bancas) {
    for (const chave of chavesDa(banca)) porChave.set(chave, banca);
  }

  const direto = porChave.get(texto);
  if (direto) return direto;

  const porApelido = APELIDOS[texto];
  if (porApelido) {
    const achada = porChave.get(porApelido);
    if (achada) return achada;
  }

  /*
    ⚠️ A BANCA MAIS ESPECÍFICA GANHA. "Cespe/Cebraspe" contém os dois termos, e
    os dois levam à mesma banca; mas num texto que cite duas bancas de verdade, a
    correspondência mais longa é a que descreve melhor o que está escrito.
  */
  let melhor: { banca: BancaCadastrada; tamanho: number } | null = null;

  for (const banca of bancas) {
    const termos = [...chavesDa(banca)];
    for (const [apelido, alvo] of Object.entries(APELIDOS)) {
      if (chavesDa(banca).includes(taxonomyKey(alvo))) termos.push(taxonomyKey(apelido));
    }

    for (const termo of termos) {
      if (contemTermo(texto, termo) && (!melhor || termo.length > melhor.tamanho)) {
        melhor = { banca, tamanho: termo.length };
      }
    }
  }

  return melhor?.banca ?? null;
}
