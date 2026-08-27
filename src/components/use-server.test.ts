import { readFileSync } from "node:fs";
import { join } from "node:path";

import { globSync } from "tinyglobby";
import { describe, expect, it } from "vitest";

/**
 * O CONTRATO DO `"use server"`.
 * ============================================================================
 *
 * Um arquivo com a diretiva `"use server"` só pode exportar FUNÇÃO ASSÍNCRONA.
 * Tudo que ele exporta vira um endpoint que o navegador pode chamar; ao
 * encontrar qualquer outra coisa, o Next.js falha em RUNTIME com
 *
 *     A "use server" file can only export async functions, found object
 *
 * e derruba a PÁGINA INTEIRA que importa o módulo — não só a ação.
 *
 * POR QUE UM TESTE, SE O NEXT JÁ VALIDA
 * ----------------------------------------------------------------------------
 * Porque ele valida tarde demais. `npm run build` passa sem reclamar: o erro
 * só acontece quando alguém abre a página. Foi assim que um `export { IDLE }`
 * — de um objeto que nem era usado, porque o componente declara o próprio —
 * chegou à produção e deixou a tela de Configurações inteira respondendo erro
 * de servidor. Trocar senha, trocar e-mail e excluir conta pararam juntos, e
 * só apareceu quando a tela foi aberta no domínio da cliente.
 *
 * `export type` não conta: TypeScript apaga tipo na compilação, e o Next nunca
 * chega a vê-lo.
 */

const ARQUIVOS = globSync("src/**/*.{ts,tsx}", { absolute: false });

/** Exportações de valor que NÃO são `export async function`. */
function exportacoesInvalidas(conteudo: string): string[] {
  const problemas: string[] = [];

  for (const linha of conteudo.split("\n")) {
    const texto = linha.trim();

    // `export type` e `export interface` somem na compilação.
    if (/^export\s+(type|interface)\b/.test(texto)) continue;
    // A forma correta.
    if (/^export\s+async\s+function\b/.test(texto)) continue;
    // Reexportação de tipo, também apagada.
    if (/^export\s+type\s*\{/.test(texto)) continue;

    if (/^export\s+(const|let|var|class)\b/.test(texto)) problemas.push(texto);
    if (/^export\s+function\b/.test(texto)) problemas.push(`${texto}   (falta async)`);
    if (/^export\s*\{/.test(texto)) problemas.push(texto);
    if (/^export\s+default\b/.test(texto)) problemas.push(texto);
  }

  return problemas;
}

describe('arquivos "use server"', () => {
  const comDiretiva = ARQUIVOS.filter((caminho) => {
    const conteudo = readFileSync(join(process.cwd(), caminho), "utf8");
    return /^\s*["']use server["']/.test(conteudo);
  });

  it("existem arquivos de Server Action para verificar", () => {
    // Se esta lista esvaziar, o teste acima passa por vacuidade e ninguém nota.
    expect(comDiretiva.length).toBeGreaterThan(0);
  });

  it.each(comDiretiva)("%s exporta apenas função assíncrona", (caminho) => {
    const conteudo = readFileSync(join(process.cwd(), caminho), "utf8");
    const problemas = exportacoesInvalidas(conteudo);

    expect(
      problemas,
      `${caminho} exporta valor não-função de um arquivo "use server". ` +
        "Isso derruba em runtime a página que importa o módulo — o build não acusa.",
    ).toEqual([]);
  });
});
