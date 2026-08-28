import { describe, expect, it } from "vitest";

import { practiceLink, studyLabel, studyLink } from "./deep-links";

/**
 * Estes testes travam duas regras que, se quebradas, produzem bugs silenciosos:
 * link para página inexistente e clique desperdiçado numa lista quando o
 * material específico já era conhecido.
 */

describe("studyLink", () => {
  it("NÃO LINKA para rota que ainda não existe", () => {
    // Link que leva a 404 é pior que ausência de link: o aluno conclui que a
    // plataforma está quebrada, e não que a página ainda não chegou.
    expect(studyLink({ technique: "flashcard", topicSlug: "crase" })).toBeNull();
    expect(studyLink({ technique: "mind_map", topicSlug: "crase" })).toBeNull();
    expect(studyLink({ technique: null })).toBeNull();
  });

  it("UM material leva direto; VÁRIOS levam para a lista filtrada", () => {
    // Pergunta da cliente: "e se tiver vários mapas mentais sobre crase, não
    // teria que ter uma lista?" — tinha. A versão anterior escondia os demais.
    // Enquanto as rotas não existem os dois devolvem null, mas a regra está
    // fixada e passa a valer sozinha quando as telas entrarem.
    const um = studyLink({ technique: "mind_map", contentItemId: "abc", materialCount: 1, topicSlug: "crase" });
    const varios = studyLink({ technique: "mind_map", contentItemId: "abc", materialCount: 4, topicSlug: "crase" });
    expect(um).toBeNull();
    expect(varios).toBeNull();
  });

  it("sem materialCount, um contentItemId sozinho ainda significa um material", () => {
    expect(studyLink({ technique: "mind_map", contentItemId: "abc" })).toBeNull();
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
