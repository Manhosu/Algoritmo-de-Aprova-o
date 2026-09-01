import { readFileSync } from "node:fs";
import { join } from "node:path";

import { globSync } from "tinyglobby";
import { describe, expect, it } from "vitest";

/**
 * O FUNIL PRECISA ESTAR LIGADO, NÃO SÓ DECLARADO.
 * ============================================================================
 *
 * ⚠️ ESTE TESTE EXISTE POR UM ERRO REAL, e caro.
 *
 * `user_funnel_progress` tinha as colunas, o schema estava correto, o painel
 * administrativo as lia e o TypeScript compilava. Só que TRÊS degraus nunca
 * eram gravados: `markFunnelStage` era chamado apenas nos quatro da ativação.
 * O painel mostrava "0 responderam a 1ª questão" com 1.046 questões
 * respondidas no banco — e não havia erro em lugar nenhum, porque não gravar
 * não é uma falha, é uma ausência.
 *
 * Nenhum teste de unidade pega isso: cada peça funcionava. O que faltava era a
 * ligação, e ligação que falta só aparece olhando o conjunto.
 *
 * O teste lê o código-fonte de propósito. É grosseiro e é o ponto: se alguém
 * acrescentar um degrau ao enum e esquecer de chamá-lo, o teste falha na hora,
 * em vez de a descoberta vir meses depois com o histórico já perdido.
 */

const RAIZ = join(process.cwd(), "src");

function fontes(): string {
  return globSync(["**/*.ts", "**/*.tsx"], { cwd: RAIZ, absolute: true })
    .filter((arquivo) => !arquivo.endsWith(".test.ts") && !arquivo.endsWith(".test.tsx"))
    .map((arquivo) => readFileSync(arquivo, "utf8"))
    .join("\n");
}

/** Os degraus declarados em `STAGE_FIELDS`, lidos do próprio arquivo. */
function degrausDeclarados(codigo: string): string[] {
  const bloco = codigo.match(/const STAGE_FIELDS = \{([\s\S]*?)\n\} as const/);
  expect(bloco, "STAGE_FIELDS mudou de forma; ajuste este teste").toBeTruthy();

  return [...bloco![1].matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
}

const SERVICO = readFileSync(join(RAIZ, "server", "preparations", "service.ts"), "utf8");

describe("instrumentação do funil", () => {
  const codigo = fontes();

  it("declara os oito degraus do funil", () => {
    expect(degrausDeclarados(SERVICO)).toHaveLength(8);
  });

  it.each(degrausDeclarados(SERVICO))(
    "o degrau %s é gravado em algum lugar do código",
    (degrau) => {
      /*
        Procura a chamada com o degrau como argumento literal. Aceita aspas
        simples ou duplas, e qualquer coisa antes — o que importa é que exista
        um `markFunnelStage(..., "<degrau>"` em produção.
      */
      const chamada = new RegExp(`markFunnelStage\\([^)]*["']${degrau}["']`, "s");

      expect(
        chamada.test(codigo),
        `Nenhuma chamada de markFunnelStage grava "${degrau}". ` +
          `A coluna existe e o painel a lê, mas ela ficaria sempre nula.`,
      ).toBe(true);
    },
  );

  it("a retenção e o limite do plano são gravados", () => {
    /*
      `recordFunnelActivity` cobre dia ativo, retorno D+1, segunda semana,
      tarefa concluída e limite do Free. Uma chamada só já basta para as
      colunas de data; as duas bandeiras precisam existir explicitamente,
      porque são o que diferencia "abriu a tela" de "concluiu" e "esbarrou".
    */
    expect(codigo).toMatch(/recordFunnelActivity\(/);
    expect(codigo).toMatch(/completedTask:/);
    expect(codigo).toMatch(/reachedFreeLimit:/);
  });
});
