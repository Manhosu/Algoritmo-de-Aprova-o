import { describe, expect, it } from "vitest";

import { spreadAcrossSubjects } from "./spread-subjects";

/**
 * ⚠️ ESTA REGRA É COMPARTILHADA POR DUAS TELAS, e é aí que mora o valor.
 *
 * O Cronograma e as Missões do Dia ordenam o mesmo conjunto de assuntos. Quando
 * cada um tinha a própria ordem, a cliente viu um assunto no cronograma de
 * 02/09 e sete outros nas Missões do mesmo dia. O teste garante que a regra
 * continua sendo uma só e que ela não distorce a prioridade.
 */

type Item = { id: string; disciplina: string };

const de = (item: Item) => item.disciplina;

describe("alternância de disciplinas", () => {
  it("não empilha a mesma disciplina em sequência", () => {
    const entrada: Item[] = [
      { id: "p1", disciplina: "port" },
      { id: "p2", disciplina: "port" },
      { id: "p3", disciplina: "port" },
      { id: "m1", disciplina: "mat" },
      { id: "d1", disciplina: "dir" },
    ];

    const saida = spreadAcrossSubjects(entrada, de).map(de);

    for (let i = 1; i < saida.length; i++) {
      /*
        A última posição pode repetir: quando só resta uma disciplina, repetir é
        melhor que descartar o assunto.
      */
      if (i < 3) expect(saida[i], `posição ${i}`).not.toBe(saida[i - 1]);
    }
  });

  it("mantém todos os itens, sem perder nem duplicar", () => {
    /*
      ⚠️ O BUG QUE ESTE TESTE PEGA É ESPECÍFICO.

      `findIndex` devolve -1 quando só resta uma disciplina. Sem tratar isso,
      `splice(-1, 1)` remove o ÚLTIMO da fila — o de MENOR prioridade — e a
      ordem final fica invertida no fim, além de a contagem parecer certa.
    */
    const entrada: Item[] = Array.from({ length: 9 }, (_, i) => ({
      id: `t${i}`,
      disciplina: i < 6 ? "port" : "mat",
    }));

    const saida = spreadAcrossSubjects(entrada, de);

    expect(saida).toHaveLength(entrada.length);
    expect(new Set(saida.map((i) => i.id)).size).toBe(entrada.length);
  });

  it("preserva a ordem relativa dentro de uma disciplina", () => {
    /*
      A alternância escolhe QUAL disciplina vem agora; dentro dela, quem chegou
      antes continua na frente. Sem isso, um assunto de prioridade baixa poderia
      passar na frente de um alto da mesma disciplina.
    */
    const entrada: Item[] = [
      { id: "p1", disciplina: "port" },
      { id: "p2", disciplina: "port" },
      { id: "p3", disciplina: "port" },
      { id: "m1", disciplina: "mat" },
      { id: "m2", disciplina: "mat" },
    ];

    const saida = spreadAcrossSubjects(entrada, de);
    const ports = saida.filter((i) => i.disciplina === "port").map((i) => i.id);
    const mats = saida.filter((i) => i.disciplina === "mat").map((i) => i.id);

    expect(ports).toEqual(["p1", "p2", "p3"]);
    expect(mats).toEqual(["m1", "m2"]);
  });

  it("uma disciplina só passa reto", () => {
    const entrada: Item[] = [
      { id: "a", disciplina: "port" },
      { id: "b", disciplina: "port" },
    ];

    expect(spreadAcrossSubjects(entrada, de).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("lista vazia não quebra", () => {
    expect(spreadAcrossSubjects([], de)).toEqual([]);
  });

  it("disciplina nula não agrupa tudo numa só", () => {
    /*
      Assunto sem disciplina existe: é o que não casou com o catálogo. Se `null`
      fosse tratado como uma disciplina qualquer, dois deles seguidos seriam
      considerados repetição — e o desempate ficaria pior que sem a regra.
    */
    const entrada: Item[] = [
      { id: "x", disciplina: null as unknown as string },
      { id: "y", disciplina: null as unknown as string },
      { id: "p", disciplina: "port" },
    ];

    const saida = spreadAcrossSubjects(entrada, de);
    expect(saida).toHaveLength(3);
    expect(new Set(saida.map((i) => i.id)).size).toBe(3);
  });
});
