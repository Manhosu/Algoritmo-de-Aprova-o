import { readFileSync } from "node:fs";
import { join } from "node:path";

import { globSync } from "tinyglobby";
import { describe, expect, it } from "vitest";

import { PASSWORD_HINT, PASSWORD_MIN_LENGTH } from "./app";

/**
 * A regra de senha na tela precisa vir da mesma constante que o servidor usa.
 *
 * POR QUE ESTE TESTE EXISTE
 * ----------------------------------------------------------------------------
 * O mínimo vivia em `server/auth/password.ts`, que é `server-only` — as telas
 * não conseguem importar de lá. Então a frase "Pelo menos 10 caracteres" estava
 * escrita à mão em TRÊS componentes: cadastro, troca de senha e troca por
 * token.
 *
 * Quando a cliente pediu para baixar o mínimo, mudar o servidor e esquecer um
 * dos três textos daria o pior tipo de erro de produto: a tela promete um
 * mínimo, o servidor recusa por outro, e a mensagem de erro contradiz o texto
 * que o aluno acabou de ler. Ele não tem como saber quem está certo.
 *
 * O teste procura qualquer número de caracteres escrito à mão perto da palavra
 * "caracteres" nos componentes. Achou, reprova — o texto tem que sair de
 * `PASSWORD_HINT`.
 */

const RAIZ = process.cwd();

describe("regra de senha na tela", () => {
  it("nenhum componente escreve o mínimo à mão", () => {
    const arquivos = globSync("src/{components,app}/**/*.{ts,tsx}", {
      cwd: RAIZ,
      ignore: ["**/*.test.ts", "**/*.test.tsx"],
    });

    const escritosAMao: string[] = [];

    for (const arquivo of arquivos) {
      const fonte = readFileSync(join(RAIZ, arquivo), "utf8");

      // "Pelo menos 10 caracteres", "mínimo de 8 caracteres", "12 caracteres"…
      for (const achado of fonte.matchAll(/[^\w](\d{1,2})\s+caracteres/g)) {
        escritosAMao.push(`${arquivo}: "${achado[1]} caracteres"`);
      }
    }

    expect(
      escritosAMao,
      "use PASSWORD_HINT — número na tela não pode discordar do servidor",
    ).toEqual([]);
  });

  it("a dica cita o mínimo que o servidor aplica", () => {
    expect(PASSWORD_HINT).toContain(`${PASSWORD_MIN_LENGTH} caracteres`);
  });

  it("mantém o mínimo dentro da faixa que o NIST recomenda", () => {
    // A cliente propôs 6. Abaixo de 8 sai da recomendação para senha escolhida
    // por pessoa, e este piso existe para essa conversa não se repetir sem
    // alguém notar.
    expect(PASSWORD_MIN_LENGTH).toBeGreaterThanOrEqual(8);
  });
});
