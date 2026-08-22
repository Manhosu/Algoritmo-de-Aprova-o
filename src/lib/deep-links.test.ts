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
  it("não linka enquanto o banco de questões não existir", () => {
    expect(practiceLink("crase")).toBeNull();
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
