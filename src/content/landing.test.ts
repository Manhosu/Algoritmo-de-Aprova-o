import { describe, expect, it } from "vitest";

import { LANDING } from "./landing";

/**
 * A copy da página inicial é editada pela cliente, direto pelo GitHub.
 *
 * O QUE O TYPESCRIPT JÁ GARANTE — E O QUE ELE NÃO GARANTE
 * ----------------------------------------------------------------------------
 * Apagar uma vírgula, uma aspa ou um campo inteiro quebra o build, e a Vercel
 * recusa a publicação: a versão anterior continua no ar. Isso está conferido.
 *
 * O que ele NÃO pega é texto VAZIO. `titulo: ""` compila, publica, e a pessoa
 * que abrir o site encontra um título em branco — a falha mais cara possível
 * numa landing, porque a página carrega, responde 200 e parece funcionar.
 *
 * Daí este teste: ele varre a árvore inteira e reprova qualquer texto vazio ou
 * só com espaços, sem precisar listar campo por campo. Campo novo entra na
 * varredura sozinho.
 */

/** Todos os textos da árvore, com o caminho até eles. */
function textos(valor: unknown, caminho = "LANDING"): Array<[string, string]> {
  if (typeof valor === "string") return [[caminho, valor]];

  if (Array.isArray(valor)) {
    return valor.flatMap((item, i) => textos(item, `${caminho}[${i}]`));
  }

  if (valor && typeof valor === "object") {
    return Object.entries(valor).flatMap(([chave, item]) =>
      textos(item, `${caminho}.${chave}`),
    );
  }

  return [];
}

describe("copy da página inicial", () => {
  it("não tem nenhum texto vazio", () => {
    const vazios = textos(LANDING)
      .filter(([, texto]) => texto.trim() === "")
      .map(([caminho]) => caminho);

    expect(vazios, "texto em branco publica uma página com buraco").toEqual([]);
  });

  it("varre a árvore inteira, e não só a superfície", () => {
    // Piso de sanidade: se a estrutura mudar de forma e a varredura parar de
    // achar os textos, o teste acima passaria vazio para sempre.
    const encontrados = textos(LANDING);

    expect(encontrados.length).toBeGreaterThan(30);
    expect(encontrados.map(([c]) => c)).toContain("LANDING.hero.titleLine1");
    expect(encontrados.map(([c]) => c)).toContain(
      "LANDING.howItWorks.steps.upload.body",
    );
    expect(encontrados.map(([c]) => c)).toContain("LANDING.mockup.tasks[0].value");
  });

  it("mantém curtos os textos que a tela não deixa crescer", () => {
    /**
     * Alguns lugares têm largura fixa e o texto não quebra linha: ele é cortado
     * com reticências ou empurra o vizinho para fora. São os únicos campos com
     * limite, e o limite existe para a cliente descobrir isso AQUI, e não
     * depois de publicar.
     */
    const limites: Array<[string, number]> = [
      [LANDING.mockup.badge, 20],
      [LANDING.hero.titleLine2, 40],
      [LANDING.stickyCta.note, 40],
      ...LANDING.differential.engines.metrics.map(
        (m) => [m.value, 10] as [string, number],
      ),
    ];

    const estourados = limites
      .filter(([texto, max]) => texto.length > max)
      .map(([texto, max]) => `"${texto}" tem ${texto.length}, o limite é ${max}`);

    expect(estourados).toEqual([]);
  });
});
