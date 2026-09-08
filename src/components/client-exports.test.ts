import { readFileSync } from "node:fs";
import { join } from "node:path";

import { globSync } from "tinyglobby";
import { describe, expect, it } from "vitest";

/**
 * Componente de SERVIDOR não importa valor de arquivo `"use client"`.
 *
 * POR QUE ESTE TESTE EXISTE
 * ----------------------------------------------------------------------------
 * ⚠️ NUM ARQUIVO `"use client"`, TUDO QUE É EXPORTADO VIRA REFERÊNCIA DE
 * CLIENTE — inclusive uma constante.
 *
 * O servidor não recebe o array; recebe um marcador que o React usa para dizer
 * ao navegador "monte isto aí". Chamar `.map` nele lança, e a página inteira
 * responde 500.
 *
 * Aconteceu com a lista de formatos da Biblioteca: ela morava dentro do
 * componente dos filtros, a página do servidor a importava para montar os links,
 * e `/estudos` passou a dar 500 em produção. `npm run build` passa, o typecheck
 * passa, o lint passa — TypeScript não distingue as duas fronteiras. Só a
 * página servida quebra.
 *
 * O conserto é sempre o mesmo: a constante muda para um módulo comum, sem
 * diretiva, que os dois lados importam.
 *
 * O QUE ESTA REGRA OLHA
 * ----------------------------------------------------------------------------
 * Só `src/app/**` e `src/server/**` sem `"use client"` — que é onde não há
 * dúvida de que o código roda no servidor. Um módulo neutro em `src/lib` pode
 * legitimamente repassar algo de cliente para outro cliente.
 *
 * Componente (nome em PascalCase) é o caso NORMAL e continua liberado: importar
 * `<MindXPlayer>` de uma página é exatamente para isso que a fronteira serve.
 */

const RAIZ = process.cwd();

describe("fronteira cliente/servidor", () => {
  it("página de servidor não importa constante de arquivo `use client`", () => {
    const valoresDeCliente = mapearValoresDeCliente();
    const violacoes: string[] = [];

    const arquivosDeServidor = globSync(["src/app/**/*.{ts,tsx}", "src/server/**/*.{ts,tsx}"], {
      cwd: RAIZ,
      ignore: ["**/*.test.ts", "**/*.test.tsx"],
    });

    for (const arquivo of arquivosDeServidor) {
      const fonte = readFileSync(join(RAIZ, arquivo), "utf8");
      if (ehCliente(fonte)) continue;

      for (const achado of fonte.matchAll(/import\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
        const exportados = valoresDeCliente.get(normalizar(achado[2]));
        if (!exportados) continue;

        for (const bruto of achado[1].split(",")) {
          const nome = bruto.trim().split(/\s+as\s+/)[0].trim();
          /* `import type { X }` é apagado na compilação e não cruza fronteira. */
          if (!nome || nome.startsWith("type ")) continue;

          if (exportados.has(nome)) {
            violacoes.push(`${arquivo} importa \`${nome}\` de ${achado[2]}`);
          }
        }
      }
    }

    expect(
      violacoes,
      "constante exportada de arquivo `use client` chega ao servidor como referência, não como valor — mova para um módulo sem diretiva",
    ).toEqual([]);
  });

  /*
    ⚠️ O TESTE DO PRÓPRIO TESTE.

    Um guarda que não acusa nada vira enfeite sem ninguém notar, e o modo de
    falhar é sempre este. A primeira versão desta regra passava sem enxergar
    nada: eu tratava "componente" como "começa com maiúscula", e `FORMATOS`
    começa com maiúscula. O nome exato que causou o erro 500 era o único que a
    regra deixava passar.
  */
  it("acusa constante e libera componente", () => {
    const fonte = `"use client";
      export const FORMATOS = [];
      export const corDeFundo = "#000";
      export const MindXPlayer = () => null;
      export function OutroPlayer() {}`;

    const nomes = valoresExportados(fonte);

    expect([...nomes].sort()).toEqual(["FORMATOS", "corDeFundo"]);
  });

  it("ignora arquivo que não é de cliente", () => {
    expect(valoresExportados(`export const FORMATOS = [];`).size).toBe(0);
  });
});

/** Módulo (caminho `@/…` normalizado) → nomes de valor NÃO-componente exportados. */
function mapearValoresDeCliente(): Map<string, Set<string>> {
  const mapa = new Map<string, Set<string>>();

  for (const arquivo of globSync("src/**/*.{ts,tsx}", {
    cwd: RAIZ,
    ignore: ["**/*.test.ts", "**/*.test.tsx"],
  })) {
    const nomes = valoresExportados(readFileSync(join(RAIZ, arquivo), "utf8"));
    if (nomes.size > 0) mapa.set(normalizar(arquivo), nomes);
  }

  return mapa;
}

/**
 * Os nomes de VALOR exportados por um arquivo de cliente.
 *
 * Componente fica de fora: atravessar a fronteira é exatamente para isso que
 * ela existe, e importar `<MindXPlayer>` numa página é o uso normal.
 */
function valoresExportados(fonte: string): Set<string> {
  const nomes = new Set<string>();
  if (!ehCliente(fonte)) return nomes;

  for (const achado of fonte.matchAll(/export\s+(?:const|let)\s+([A-Za-z_$][\w$]*)/g)) {
    if (!ehComponente(achado[1])) nomes.add(achado[1]);
  }

  return nomes;
}

/**
 * PascalCase de verdade: começa com maiúscula E TEM minúscula.
 *
 * ⚠️ A SEGUNDA METADE É O CONSERTO DA PRIMEIRA VERSÃO DESTA REGRA.
 *
 * Eu testava só `/^[A-Z]/`, e `FORMATOS` começa com maiúscula. O guarda
 * classificava como componente e liberava — justamente o nome que tinha
 * derrubado a Biblioteca em produção. Um guarda escrito depois do erro que ele
 * deveria pegar, e que não pegava aquele erro.
 */
function ehComponente(nome: string): boolean {
  return /^[A-Z]/.test(nome) && /[a-z]/.test(nome);
}

function ehCliente(fonte: string): boolean {
  return /^\s*(?:\/\*[\s\S]*?\*\/\s*)?["']use client["']/.test(fonte);
}

/** "src/components/x/y.tsx" e "@/components/x/y" viram a mesma chave. */
function normalizar(caminho: string): string {
  return caminho
    .replace(/\\/g, "/")
    .replace(/^@\//, "src/")
    .replace(/\.tsx?$/, "");
}
