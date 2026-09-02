import { describe, expect, it } from "vitest";

import { practiceLink, studyLabel, studyLink } from "./deep-links";

/**
 * Estes testes travam duas regras que, se quebradas, produzem bugs silenciosos:
 * link para página inexistente e clique desperdiçado numa lista quando o
 * material específico já era conhecido.
 */

describe("studyLink", () => {
  /**
   * ⚠️ ESTES TESTES AFIRMAVAM `null` — e estavam certos até 01/09/2026.
   *
   * Cada técnica apontava para uma rota inventada (`/flashcards`,
   * `/mapas-mentais`, `/resumos`), nenhuma delas existia, e a guarda de rota
   * não implementada devolvia `null`. O efeito não foi um 404: foi a metade
   * "Estude" de TODA missão ficar sem link, em silêncio, por semanas. A cliente
   * reportou — "os itens da missão Estude precisam ser clicáveis".
   *
   * A biblioteca mora em `/estudos`, filtrada por tipo. Estes testes agora
   * travam o destino real.
   */
  it("UM material leva DIRETO a ele", () => {
    // Abrir uma lista de um item só é um clique jogado fora.
    expect(
      studyLink({
        technique: "mind_map",
        contentItemId: "abc",
        materialCount: 1,
        topicSlug: "crase",
      }),
    ).toBe("/estudos/abc");
  });

  it("VÁRIOS materiais levam à lista filtrada por tipo E assunto", () => {
    /*
      Pergunta da cliente: "e se tiver vários mapas mentais sobre crase, não
      teria que ter uma lista?" — tinha.

      Filtrar só por assunto misturaria mapa mental com flashcard quando a
      missão prescreveu um dos dois.
    */
    expect(
      studyLink({
        technique: "mind_map",
        contentItemId: "abc",
        materialCount: 4,
        topicSlug: "crase",
      }),
    ).toBe("/estudos?tipo=mind_map&assunto=crase");
  });

  it("sem materialCount, um contentItemId sozinho ainda significa um material", () => {
    expect(studyLink({ technique: "mind_map", contentItemId: "abc" })).toBe(
      "/estudos/abc",
    );
  });

  it("sem técnica prescrita, abre a biblioteca do assunto", () => {
    expect(studyLink({ technique: null, topicSlug: "crase" })).toBe(
      "/estudos?assunto=crase",
    );
  });

  it("sem técnica e sem assunto, abre a biblioteca inteira", () => {
    expect(studyLink({ technique: null })).toBe("/estudos");
  });

  it("cada técnica vira o tipo de conteúdo correspondente", () => {
    /*
      ⚠️ Os valores são do enum `content_type` no banco. Um valor que não exista
      lá vira um filtro que não casa com nada, e a tela mostra biblioteca vazia
      sem erro nenhum.
    */
    const esperado: Record<string, string> = {
      flashcard: "flashcard_deck",
      mind_map: "mind_map",
      summary: "study_text",
      reading: "study_text",
      video: "video",
      audio: "audio",
    };

    for (const [tecnica, tipo] of Object.entries(esperado)) {
      expect(
        studyLink({
          technique: tecnica as "flashcard",
          topicSlug: "crase",
          materialCount: 3,
        }),
        tecnica,
      ).toBe(`/estudos?tipo=${tipo}&assunto=crase`);
    }
  });

  it("escapa o assunto na URL", () => {
    expect(
      studyLink({ technique: null, topicSlug: "raciocinio logico" }),
    ).toBe("/estudos?assunto=raciocinio+logico");
  });
});

describe("practiceLink", () => {
  it("leva ao banco de questões já filtrado no assunto", () => {
    // A tela existe desde 23/08/2026. É o que torna clicável a metade
    // "Pratique" de cada missão — pedido da cliente em 21/08/2026.
    expect(practiceLink("crase")).toBe("/questoes?assunto=crase");
  });

  it("carrega o item da Tarefa do Dia, que é o que risca a linha", () => {
    /**
     * ⚠️ SEM O `?tarefa=`, O XP DO "PRATIQUE" NUNCA ENTRA.
     *
     * A linha mostrava "+10 XP", abria as questões e continuava aberta para
     * sempre: o id do item não chegava à resposta, então `advanceTaskItem`
     * jamais rodava. A cliente descreveu exatamente isso — "aparece clicável e
     * mostra os +10XP, porém não tem como validar".
     *
     * O parâmetro é o que liga a resposta de volta à tarefa. O servidor confere
     * que o item pertence ao aluno antes de fechá-lo.
     */
    expect(practiceLink("crase", "item-1")).toBe("/questoes?assunto=crase&tarefa=item-1");
  });

  it("usa `?` quando não há assunto, e `&` quando há", () => {
    // O separador errado gera "/questoes?tarefa=x?assunto=y", que o navegador
    // entrega como um parâmetro só, com o valor colado.
    expect(practiceLink(null, "item-1")).toBe("/questoes?tarefa=item-1");
    expect(practiceLink("crase", "item-1")).toContain("&tarefa=");
  });

  it("continua funcionando sem o item, para quem abre pelo menu", () => {
    expect(practiceLink("crase")).not.toContain("tarefa");
    expect(practiceLink()).toBe("/questoes");
  });

  it("sem assunto, abre o banco inteiro", () => {
    // Assunto que não casou com o catálogo não tem slug. Levar ao banco sem
    // filtro é melhor que não levar a lugar nenhum.
    expect(practiceLink(null)).toBe("/questoes");
  });

  it("escapa o assunto na URL", () => {
    // Slug vem do catálogo, mas montar URL por concatenação sem escapar é o
    // tipo de atalho que só falha no dia em que o dado muda.
    expect(practiceLink("raciocinio logico")).toBe(
      "/questoes?assunto=raciocinio%20logico",
    );
  });
});

describe("studyLabel", () => {
  it("nomeia a técnica quando ela foi prescrita", () => {
    expect(studyLabel("flashcard", "Crase")).toBe("Flash Cards — Crase");
    expect(studyLabel("mind_map", "Colocação Pronominal")).toBe(
      "Mapa Mental — Colocação Pronominal",
    );
    expect(studyLabel("summary", "Crase")).toBe("Resumo — Crase");
  });

  it("SEM TÉCNICA, mostra só o assunto", () => {
    // Nomear uma técnica cujo material não existe seria prometer o que não há —
    // e é o caso comum enquanto o acervo está sendo construído.
    expect(studyLabel(null, "Crase")).toBe("Crase");
  });

  it("cobre todas as técnicas sem devolver rótulo vazio", () => {
    const tecnicas = [
      "reading", "video", "flashcard", "mind_map",
      "summary", "audio", "questions", "other",
    ] as const;

    for (const tecnica of tecnicas) {
      expect(studyLabel(tecnica, "Assunto").length).toBeGreaterThan("Assunto".length);
    }
  });
});
