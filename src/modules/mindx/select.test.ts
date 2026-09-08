import { describe, expect, it } from "vitest";

import { selectMindXFeed, type MindXTopicSignal, type MindXVideo } from "./select";

/**
 * ⚠️ ESTA REGRA DECIDE O QUE O ALUNO VÊ, e o erro dela é silencioso.
 *
 * O player quebrado aparece na hora. A seleção errada entrega o vídeo errado
 * todo dia sem ninguém notar, porque não existe "certo" visível na tela para
 * comparar. É a razão de ela ser pura e de os casos abaixo serem os que a
 * cliente descreveu.
 */

const AGORA = new Date("2026-09-07T12:00:00Z");

function video(p: Partial<MindXVideo> & { contentItemId: string }): MindXVideo {
  return {
    title: p.contentItemId,
    canonicalTopicId: null,
    canonicalSubjectId: null,
    lastSeenAt: null,
    ...p,
  };
}

function sinal(p: Partial<MindXTopicSignal>): MindXTopicSignal {
  return {
    canonicalTopicId: null,
    canonicalSubjectId: null,
    errorPercent: null,
    weight: null,
    ...p,
  };
}

describe("seleção do Mind-X", () => {
  it("a maior lacuna vem primeiro", () => {
    /*
      O exemplo dela, com as palavras dela: "se o sistema identificar uma grande
      lacuna em Crase, o Mind-X deve priorizar vídeos sobre Crase".
    */
    const feed = selectMindXFeed({
      now: AGORA,
      videos: [
        video({ contentItemId: "regencia", canonicalTopicId: "t-regencia" }),
        video({ contentItemId: "crase", canonicalTopicId: "t-crase" }),
      ],
      signals: [
        sinal({ canonicalTopicId: "t-crase", errorPercent: 62 }),
        sinal({ canonicalTopicId: "t-regencia", errorPercent: 20 }),
      ],
    });

    expect(feed.map((v) => v.contentItemId)).toEqual(["crase", "regencia"]);
    expect(feed[0].reason).toBe("lacuna");
  });

  it("lacuna medida ganha de peso alto no edital", () => {
    /*
      ⚠️ O CASO QUE JUSTIFICA AS FAIXAS SEPARADAS.

      Um assunto de peso enorme no edital não pode passar na frente de um em que
      o aluno erra de verdade. Ela foi explícita: "considerar exclusivamente as
      lacunas". Numa escala só, o peso venceria.
    */
    const feed = selectMindXFeed({
      now: AGORA,
      videos: [
        video({ contentItemId: "peso-alto", canonicalTopicId: "t-pesado" }),
        video({ contentItemId: "erro-baixo", canonicalTopicId: "t-erro" }),
      ],
      signals: [
        sinal({ canonicalTopicId: "t-pesado", weight: 40 }),
        sinal({ canonicalTopicId: "t-erro", errorPercent: 5 }),
      ],
    });

    expect(feed[0].contentItemId).toBe("erro-baixo");
  });

  it("sem lacuna medida, o peso do edital ordena", () => {
    /*
      O aluno que acabou de entrar não respondeu questão nenhuma. Um feed vazio
      no dia em que ele está mais curioso é o pior momento possível para não ter
      o que mostrar.
    */
    const feed = selectMindXFeed({
      now: AGORA,
      videos: [
        video({ contentItemId: "leve", canonicalTopicId: "t-leve" }),
        video({ contentItemId: "pesado", canonicalTopicId: "t-pesado" }),
      ],
      signals: [
        sinal({ canonicalTopicId: "t-leve", weight: 4 }),
        sinal({ canonicalTopicId: "t-pesado", weight: 40 }),
      ],
    });

    expect(feed.map((v) => v.contentItemId)).toEqual(["pesado", "leve"]);
    expect(feed[0].reason).toBe("peso");
  });

  it("vídeo visto há menos de 24 horas vai para o FIM, não para fora", () => {
    const feed = selectMindXFeed({
      now: AGORA,
      videos: [
        video({
          contentItemId: "visto-agora",
          canonicalTopicId: "t-crase",
          lastSeenAt: new Date("2026-09-07T09:00:00Z"),
        }),
        video({ contentItemId: "inedito", canonicalTopicId: "t-crase" }),
      ],
      signals: [sinal({ canonicalTopicId: "t-crase", errorPercent: 60 })],
    });

    /*
      ⚠️ ESTE TESTE TROCOU DE LADO EM 08/09/2026, e o motivo está registrado.

      Antes o visto há pouco era removido da lista. Palavras da cliente: "queria
      que ao invés da mensagem avisando que não tem mais vídeos, pudesse voltar
      nos vídeos que já foram visualizados".

      O que a janela de 24 horas garante continua garantido, e é o que importa:
      o aluno percorre TODO o inédito antes de reencontrar qualquer repetido.
    */
    expect(feed.map((v) => v.contentItemId)).toEqual(["inedito", "visto-agora"]);
  });

  it("com o acervo todo visto, o feed continua cheio em vez de vazio", () => {
    /*
      É o caso que ela encontrou: acervo pequeno, tudo visto no mesmo dia, e a
      tela dizendo que não havia vídeo. O Mind-X abre no botão mais visível do
      aplicativo — um estado vazio ali é o oposto do que o botão promete.
    */
    const feed = selectMindXFeed({
      now: AGORA,
      videos: [
        video({
          contentItemId: "visto-cedo",
          canonicalTopicId: "t-crase",
          lastSeenAt: new Date("2026-09-07T06:00:00Z"),
        }),
        video({
          contentItemId: "visto-tarde",
          canonicalTopicId: "t-crase",
          lastSeenAt: new Date("2026-09-07T11:00:00Z"),
        }),
      ],
      signals: [sinal({ canonicalTopicId: "t-crase", errorPercent: 60 })],
    });

    /* Nada some, e o visto há mais tempo volta primeiro. */
    expect(feed.map((v) => v.contentItemId)).toEqual(["visto-cedo", "visto-tarde"]);
  });

  it("passadas as 24 horas o vídeo volta", () => {
    /*
      A janela é de saída, não de exclusão permanente. Com acervo pequeno, banir
      para sempre o que já foi visto esvaziaria o feed em uma semana.
    */
    const feed = selectMindXFeed({
      now: AGORA,
      videos: [
        video({
          contentItemId: "ontem",
          canonicalTopicId: "t-crase",
          lastSeenAt: new Date("2026-09-06T09:00:00Z"),
        }),
      ],
      signals: [sinal({ canonicalTopicId: "t-crase", errorPercent: 60 })],
    });

    expect(feed).toHaveLength(1);
  });

  it("empate coloca o inédito na frente do já visto", () => {
    const feed = selectMindXFeed({
      now: AGORA,
      videos: [
        video({
          contentItemId: "ja-visto",
          canonicalTopicId: "t-crase",
          lastSeenAt: new Date("2026-09-01T09:00:00Z"),
        }),
        video({ contentItemId: "inedito", canonicalTopicId: "t-crase" }),
      ],
      signals: [sinal({ canonicalTopicId: "t-crase", errorPercent: 60 })],
    });

    expect(feed.map((v) => v.contentItemId)).toEqual(["inedito", "ja-visto"]);
  });

  it("vídeo de disciplina herda a maior lacuna dela", () => {
    /*
      Os vídeos que a cliente mandou são micro-pontos, mas nem todo vídeo será
      marcado num assunto. Um que cobre a disciplina inteira serve melhor a quem
      está mal em algum pedaço dela.
    */
    const feed = selectMindXFeed({
      now: AGORA,
      videos: [
        video({ contentItemId: "geral-port", canonicalSubjectId: "d-port" }),
        video({ contentItemId: "geral-mat", canonicalSubjectId: "d-mat" }),
      ],
      signals: [
        sinal({ canonicalSubjectId: "d-port", canonicalTopicId: "t1", errorPercent: 70 }),
        sinal({ canonicalSubjectId: "d-port", canonicalTopicId: "t2", errorPercent: 10 }),
        sinal({ canonicalSubjectId: "d-mat", canonicalTopicId: "t3", errorPercent: 30 }),
      ],
    });

    expect(feed[0].contentItemId).toBe("geral-port");
  });

  it("a ordem é estável entre aberturas", () => {
    /*
      Sem desempate final, dois vídeos empatados alternariam de posição a cada
      abertura e o feed pareceria mudar sozinho.
    */
    const entrada = {
      now: AGORA,
      videos: [
        video({ contentItemId: "bbb", canonicalTopicId: "t" }),
        video({ contentItemId: "aaa", canonicalTopicId: "t" }),
      ],
      signals: [sinal({ canonicalTopicId: "t", errorPercent: 50 })],
    };

    const uma = selectMindXFeed(entrada).map((v) => v.contentItemId);
    const outra = selectMindXFeed(entrada).map((v) => v.contentItemId);

    expect(uma).toEqual(outra);
    expect(uma).toEqual(["aaa", "bbb"]);
  });

  it("acervo vazio devolve feed vazio, sem quebrar", () => {
    expect(selectMindXFeed({ now: AGORA, videos: [], signals: [] })).toEqual([]);
  });

  it("vídeo sem sinal nenhum entra por último, mas entra", () => {
    /*
      Assunto do edital que ainda não casou com o catálogo não tem sinal. O vídeo
      dele é melhor que nada quando não há mais nada.
    */
    const feed = selectMindXFeed({
      now: AGORA,
      videos: [
        video({ contentItemId: "orfao" }),
        video({ contentItemId: "com-lacuna", canonicalTopicId: "t" }),
      ],
      signals: [sinal({ canonicalTopicId: "t", errorPercent: 40 })],
    });

    expect(feed.map((v) => v.contentItemId)).toEqual(["com-lacuna", "orfao"]);
    expect(feed[1].reason).toBe("acervo");
  });
});
