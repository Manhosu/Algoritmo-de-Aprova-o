import { readFileSync } from "node:fs";
import { join } from "node:path";

import { globSync } from "tinyglobby";
import { describe, expect, it } from "vitest";

/**
 * OS MAPAS DE RÓTULO DO PAINEL PRECISAM COBRIR O ENUM QUE TRADUZEM.
 * ============================================================================
 *
 * ⚠️ ESTE TESTE EXISTE POR UM ERRO REAL, e de um tipo que nada mais pega.
 *
 * A aba Planos traduzia o período de cobrança com
 *
 *     { monthly: "Mensal", yearly: "Anual" }
 *
 * O enum do banco é `["monthly", "annual"]`. `yearly` nunca existiu, e o
 * `?? valor` do fallback fez a tela mostrar a palavra crua "annual" ao lado de
 * "Mensal", em produção, na frente da cliente. Typecheck, lint, 431 testes,
 * build e o smoke passaram: `Record<string, string>` aceita qualquer chave, e o
 * fallback transformou o erro numa feiura silenciosa em vez de uma quebra.
 *
 * A conferência é feita contra o enum DAQUELA coluna, nunca contra a união de
 * todos — pela mesma razão que a nota em `db/enum-literals.test.ts` explica: a
 * palavra errada quase sempre existe em algum outro enum do schema.
 */

const RAIZ = process.cwd();

/** `nomeDoEnumEmTS` → valores declarados. */
function enumsDeclarados(): Map<string, string[]> {
  const fonte = readFileSync(join(RAIZ, "src/server/db/schema/enums.ts"), "utf8");
  const mapa = new Map<string, string[]>();

  const padrao = /export const (\w+) = pgEnum\(\s*"[a-z_]+",\s*\[([\s\S]*?)\]\s*\)/g;

  for (const achado of fonte.matchAll(padrao)) {
    const valores = [...achado[2].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    mapa.set(achado[1], valores);
  }

  return mapa;
}

/**
 * Lê um mapa `const NOME: Record<string, string> = { chave: "…" }` de um arquivo.
 */
function chavesDoMapa(codigo: string, nome: string): string[] | null {
  const bloco = codigo.match(
    new RegExp(`const ${nome}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`),
  );
  if (!bloco) return null;

  return [...bloco[1].matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1]);
}

/**
 * Os mapas do painel e o enum que cada um traduz.
 *
 * Acrescentar um mapa de rótulo sem acrescentar a linha aqui deixa ele
 * desprotegido — é o preço de conferir isto lendo o código-fonte.
 */
const MAPAS: Array<{
  arquivo: string;
  mapa: string;
  /**
   * O enum do banco que o mapa traduz.
   *
   * `null` quando não HÁ enum: o mapa traduz um tipo do TypeScript, e quem
   * garante a cobertura é o próprio `Record<...>`, que o typecheck recusa
   * incompleto. Continua listado aqui para não cair no teste do meio, que
   * existe para pegar mapa esquecido.
   */
  enumeracao: string | null;
}> = [
  {
    arquivo: "src/app/admin/planos/page.tsx",
    mapa: "ROTULO_PERIODO",
    enumeracao: "billingPeriodEnum",
  },
  {
    arquivo: "src/app/admin/planos/page.tsx",
    mapa: "ROTULO_ACESSO",
    enumeracao: "contentAccessLevelEnum",
  },
  {
    arquivo: "src/app/admin/planos/page.tsx",
    mapa: "ROTULO_TIPO",
    enumeracao: "contentTypeEnum",
  },
  {
    arquivo: "src/app/admin/materiais/page.tsx",
    mapa: "ROTULO_TIPO",
    enumeracao: "contentTypeEnum",
  },
  {
    arquivo: "src/app/admin/questoes/page.tsx",
    mapa: "ROTULO_STATUS",
    enumeracao: "importBatchStatusEnum",
  },
  {
    arquivo: "src/app/admin/editais/page.tsx",
    mapa: "ROTULO_STATUS",
    enumeracao: "extractionStatusEnum",
  },
  {
    arquivo: "src/app/admin/alunos/[id]/page.tsx",
    mapa: "ROTULO_STATUS",
    enumeracao: "userStatusEnum",
  },
  {
    arquivo: "src/app/admin/alunos/[id]/page.tsx",
    mapa: "TECNICA",
    enumeracao: "studyTechniqueEnum",
  },
  {
    arquivo: "src/app/admin/materiais/page.tsx",
    mapa: "ROTULO_ACESSO_MATERIAL",
    enumeracao: "contentAccessLevelEnum",
  },
  {
    arquivo: "src/app/admin/materiais/page.tsx",
    mapa: "ROTULO_SITUACAO_MATERIAL",
    enumeracao: "contentStatusEnum",
  },
  {
    arquivo: "src/app/admin/questoes/acervo/page.tsx",
    mapa: "ROTULO_DIFICULDADE",
    enumeracao: "questionDifficultyEnum",
  },
  {
    arquivo: "src/app/admin/questoes/acervo/page.tsx",
    mapa: "ROTULO_SITUACAO",
    enumeracao: "questionStatusEnum",
  },
  {
    /*
      ⚠️ SEM ENUM NO BANCO, de propósito.

      `ActivityArea` é união de literais do TypeScript, montada na própria
      consulta do log de atividades — as áreas não existem como coluna. Criar um
      `pgEnum` só para o teste conferir seria inventar schema para satisfazer
      teste.
    */
    arquivo: "src/app/admin/atividades/page.tsx",
    mapa: "ROTULO_AREA",
    enumeracao: null,
  },
];

describe("rótulos do painel administrativo", () => {
  const enums = enumsDeclarados();

  it("os arquivos com mapa de rótulo estão todos na lista", () => {
    /*
      Sem isto, criar uma aba nova com um mapa de rótulo passaria despercebido e
      o próximo "annual" apareceria cru na tela.
    */
    const naListagem = new Set(MAPAS.map((m) => `${m.arquivo}:${m.mapa}`));

    const encontrados = globSync("src/app/admin/**/page.tsx", { cwd: RAIZ })
      .flatMap((arquivo) => {
        const codigo = readFileSync(join(RAIZ, arquivo), "utf8");
        /*
          `ROTULO_` e `TECNICA`: os dois prefixos que mapas de rótulo usam hoje.
          Um nome fora desses dois passa despercebido — o teste do meio da lista
          existe justamente para o dia em que isso acontecer.
        */
        return [...codigo.matchAll(/const (ROTULO_\w+|TECNICA)\b/g)].map(
          (m) => `${arquivo.replaceAll("\\", "/")}:${m[1]}`,
        );
      });

    for (const achado of encontrados) {
      expect(naListagem.has(achado), `${achado} não está em MAPAS`).toBe(true);
    }
  });

  it.each(MAPAS.filter((m) => m.enumeracao !== null))(
    "$mapa cobre todo o $enumeracao",
    ({ arquivo, mapa, enumeracao }) => {
    const valores = enums.get(enumeracao!);
    expect(valores, `${enumeracao} não foi encontrado em enums.ts`).toBeTruthy();

    const codigo = readFileSync(join(RAIZ, arquivo), "utf8");
    const chaves = chavesDoMapa(codigo, mapa);
    expect(chaves, `${mapa} não foi encontrado em ${arquivo}`).toBeTruthy();

    /*
      Cobrir é traduzir TODO valor do enum. Sobrar chave no mapa é o erro do
      "yearly": uma tradução para algo que o banco nunca devolve, enquanto o
      valor real cai no fallback e aparece cru.
    */
    expect([...chaves!].sort()).toEqual([...valores!].sort());
    },
  );
});
