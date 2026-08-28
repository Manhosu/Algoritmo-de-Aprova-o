import { readFileSync } from "node:fs";
import { join } from "node:path";

import { globSync } from "tinyglobby";
import { describe, expect, it } from "vitest";

/**
 * Todo literal comparado a uma coluna dentro de um template `sql` precisa
 * pertencer ao enum DAQUELA coluna.
 *
 * POR QUE ESTE TESTE EXISTE
 * ----------------------------------------------------------------------------
 * O template `sql` do Drizzle é texto: ele interpola a coluna com o tipo certo,
 * mas o que vem depois do `=` é string crua que o TypeScript nunca olha.
 *
 * A Home consultava `status in ('completed', 'missed')` em `review_occurrences`.
 * Aquele enum tem `scheduled`, `completed`, `skipped` e `canceled`; `missed` é
 * de `schedule_entry_status`, o conceito vizinho. O erro passou por `typecheck`,
 * `lint`, 340 testes, `build` e pelo smoke, e só apareceu no navegador — 500 na
 * Home de qualquer aluno com revisão vencida, `invalid input value for enum
 * review_occurrence_status`. A tela principal do produto caía inteira e o
 * portão de verificação inteiro dizia que estava tudo certo.
 *
 * ⚠️ CONFERIR CONTRA A UNIÃO DE TODOS OS ENUMS NÃO RESOLVE. Foi a primeira
 * tentativa e ela aprovou o bug: `missed` existe, só que em outro enum. E é
 * justamente assim que o erro nasce — a palavra vem do conceito ao lado, então
 * ela quase sempre existe em algum lugar do schema. Sem amarrar coluna a enum,
 * o teste dá falsa segurança, que é pior que não ter teste.
 */

const RAIZ = process.cwd();

/** `nomeDoEnumEmTS` → valores que ele declara. */
function enumsDeclarados(): Map<string, Set<string>> {
  const fonte = readFileSync(join(RAIZ, "src/server/db/schema/enums.ts"), "utf8");
  const mapa = new Map<string, Set<string>>();

  const declaracao = /export const (\w+) = pgEnum\(\s*"[^"]+"\s*,\s*\[([\s\S]*?)\]\s*\)/g;
  for (const bloco of fonte.matchAll(declaracao)) {
    const valores = new Set<string>();
    for (const literal of bloco[2].matchAll(/"([a-z][a-z0-9_]*)"/g)) valores.add(literal[1]);
    mapa.set(bloco[1], valores);
  }

  return mapa;
}

/** `tabela.coluna` → nome do enum que tipa a coluna. Só colunas de enum. */
function colunasDeEnum(): Map<string, string> {
  const mapa = new Map<string, string>();

  for (const arquivo of globSync("src/server/db/schema/*.ts", { cwd: RAIZ })) {
    const fonte = readFileSync(join(RAIZ, arquivo), "utf8");

    // Cada `export const` inicia um bloco; o seguinte o encerra. Basta para
    // isolar o corpo de um `pgTable` sem interpretar TypeScript de verdade.
    for (const parte of fonte.split(/^export const /m)) {
      const nome = parte.match(/^(\w+) = pgTable\(/)?.[1];
      if (!nome) continue;

      for (const coluna of parte.matchAll(/(\w+):\s*(\w+Enum)\(/g)) {
        mapa.set(`${nome}.${coluna[1]}`, coluna[2]);
      }
    }
  }

  return mapa;
}

/**
 * Pares (coluna interpolada, literal) comparados dentro do arquivo.
 *
 * Casa `${tabela.coluna} = 'x'`, `<> 'x'`, `!= 'x'` e `in ('x', 'y')`.
 */
function comparacoes(fonte: string): Array<{ coluna: string; literal: string }> {
  const achados: Array<{ coluna: string; literal: string }> = [];
  const padrao =
    /\$\{\s*(\w+\.\w+)\s*\}\s*(?:=|<>|!=|\bin\b)\s*(\(\s*(?:'[^']*'\s*,?\s*)+\)|'[^']*')/g;

  for (const par of fonte.matchAll(padrao)) {
    for (const literal of par[2].matchAll(/'([^']*)'/g)) {
      achados.push({ coluna: par[1], literal: literal[1] });
    }
  }

  return achados;
}

describe("literais de enum em SQL cru", () => {
  it("só compara coluna de enum com valor que aquele enum declara", () => {
    const enums = enumsDeclarados();
    const colunas = colunasDeEnum();

    // Se o schema mudar de forma e a extração parar de achar nada, o teste
    // passaria vazio para sempre. Estes dois pisos fazem isso virar falha.
    expect(enums.size, "não achei os pgEnum do schema").toBeGreaterThan(10);
    expect(colunas.size, "não achei as colunas tipadas por enum").toBeGreaterThan(20);
    expect(colunas.get("reviewOccurrences.status")).toBe("reviewOccurrenceStatusEnum");

    const arquivos = globSync("src/**/*.ts", {
      cwd: RAIZ,
      ignore: ["**/*.test.ts", "src/server/db/schema/**"],
    });

    const invalidos: string[] = [];

    for (const arquivo of arquivos) {
      const fonte = readFileSync(join(RAIZ, arquivo), "utf8");
      if (!fonte.includes("sql`")) continue;

      for (const { coluna, literal } of comparacoes(fonte)) {
        const nomeDoEnum = colunas.get(coluna);
        if (!nomeDoEnum) continue; // coluna que não é enum: nada a conferir

        const valores = enums.get(nomeDoEnum);
        if (!valores || valores.has(literal)) continue;

        invalidos.push(
          `${arquivo}: ${coluna} = '${literal}' — ${nomeDoEnum} aceita ${[...valores].join(", ")}`,
        );
      }
    }

    expect(invalidos, "valor fora do enum derruba a consulta em tempo de execução").toEqual(
      [],
    );
  });
});
