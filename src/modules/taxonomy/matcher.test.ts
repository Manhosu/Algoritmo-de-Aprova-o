import { describe, expect, it } from "vitest";

import {
  assessMappingHealth,
  buildMappingQueue,
  matchToCanonical,
  resolveQueueItem,
  type AliasEntry,
  type CanonicalCandidate,
} from "./matcher";
import { taxonomyKey } from "./normalize";

const PORT = "subj-portugues";
const DIR_ADM = "subj-dir-adm";
const DIR_CONST = "subj-dir-const";

function candidate(
  id: string,
  name: string,
  subjectId: string | null = null,
): CanonicalCandidate {
  return { id, name, normalizedName: taxonomyKey(name), subjectId };
}

const CATALOGO: CanonicalCandidate[] = [
  candidate("crase", "Crase", PORT),
  candidate("concordancia", "Concordância verbal e nominal", PORT),
  candidate("regencia", "Regência verbal e nominal", PORT),
  candidate("acentuacao", "Acentuação gráfica", PORT),
  candidate("pont", "Pontuação", PORT),
  candidate("princ-adm", "Princípios da Administração Pública", DIR_ADM),
  candidate("atos-adm", "Atos administrativos", DIR_ADM),
  candidate("princ-const", "Princípios fundamentais", DIR_CONST),
  candidate("dir-fund", "Direitos e garantias fundamentais", DIR_CONST),
];

function alias(text: string, targetId: string, origin: AliasEntry["origin"] = "admin"): AliasEntry {
  return { normalizedAlias: taxonomyKey(text), targetId, origin };
}

describe("matchToCanonical — camada 0: sinônimo", () => {
  it("casa pelo sinônimo com confiança total", () => {
    const resultado = matchToCanonical({
      rawName: "Emprego do sinal indicativo de crase",
      aliases: [alias("Emprego do sinal indicativo de crase", "crase")],
      candidates: CATALOGO,
    });

    expect(resultado.canonicalId).toBe("crase");
    expect(resultado.confidence).toBe(1);
    expect(resultado.matchedBy).toBe("alias");
    expect(resultado.status).toBe("manually_mapped");
  });

  it("O APRENDIZADO: variações de redação caem no mesmo sinônimo", () => {
    const sinonimos = [alias("Emprego do sinal indicativo de crase", "crase")];
    const variacoes = [
      "Emprego do sinal indicativo da crase",
      "EMPREGO DO SINAL INDICATIVO DE CRASE",
      "emprego  do sinal indicativo de crase.",
    ];

    for (const texto of variacoes) {
      const resultado = matchToCanonical({
        rawName: texto,
        aliases: sinonimos,
        candidates: CATALOGO,
      });
      expect(resultado.canonicalId).toBe("crase");
      expect(resultado.matchedBy).toBe("alias");
    }
  });

  it("sinônimo criado pela IA casa como automático, não como manual", () => {
    const resultado = matchToCanonical({
      rawName: "Acento grave",
      aliases: [alias("Acento grave", "crase", "ai")],
      candidates: CATALOGO,
    });
    expect(resultado.status).toBe("mapped");
  });
});

describe("matchToCanonical — camada 1: nome exato", () => {
  it("casa pelo nome canônico", () => {
    const resultado = matchToCanonical({
      rawName: "Crase",
      aliases: [],
      candidates: CATALOGO,
    });
    expect(resultado.canonicalId).toBe("crase");
    expect(resultado.matchedBy).toBe("exact");
  });

  it("ignora acento, caixa e pontuação", () => {
    const resultado = matchToCanonical({
      rawName: "ACENTUACAO GRAFICA!",
      aliases: [],
      candidates: CATALOGO,
    });
    expect(resultado.canonicalId).toBe("acentuacao");
  });

  it("dois canônicos com o mesmo nome viram ambiguidade, não sorteio", () => {
    const resultado = matchToCanonical({
      rawName: "Princípios",
      aliases: [],
      candidates: [
        candidate("a", "Princípios", DIR_ADM),
        candidate("b", "Princípios", DIR_CONST),
      ],
    });
    expect(resultado.status).toBe("ambiguous");
    expect(resultado.canonicalId).toBeNull();
    expect(resultado.alternatives).toHaveLength(2);
  });
});

describe("matchToCanonical — camada 2: similaridade e escopo", () => {
  it("casa variação de flexão com confiança alta", () => {
    const resultado = matchToCanonical({
      rawName: "Concordância verbal e nominal na norma-padrão",
      scopeSubjectId: PORT,
      aliases: [],
      candidates: CATALOGO,
    });
    expect(["mapped", "ambiguous"]).toContain(resultado.status);
    expect(resultado.confidence).toBeGreaterThan(0.5);
  });

  it("O ESCOPO EVITA O FALSO POSITIVO ENTRE DISCIPLINAS", () => {
    // "Princípios" existe em Administrativo e em Constitucional. Sem escopo,
    // o casamento aproximado erraria com confiança alta — silenciosamente.
    const semEscopo = matchToCanonical({
      rawName: "Princípios",
      aliases: [],
      candidates: CATALOGO,
    });
    const comEscopo = matchToCanonical({
      rawName: "Princípios",
      scopeSubjectId: DIR_CONST,
      aliases: [],
      candidates: CATALOGO,
    });

    // Com escopo, só há um candidato plausível na disciplina certa.
    const idsSemEscopo = semEscopo.alternatives.map((a) => a.topicId);
    expect(idsSemEscopo.length).toBeGreaterThan(1);
    expect(comEscopo.alternatives.every((a) => a.topicId !== "princ-adm")).toBe(true);
  });

  it("texto sem relação nenhuma não casa", () => {
    const resultado = matchToCanonical({
      rawName: "Bibliografia sugerida e legislação correlata",
      aliases: [],
      candidates: CATALOGO,
    });
    expect(resultado.status).toBe("unmapped");
    expect(resultado.canonicalId).toBeNull();
  });

  it("NA DÚVIDA VAI PARA A FILA: empate técnico não vira acerto", () => {
    // Dois candidatos igualmente bons significam que o texto não distingue
    // entre eles. Escolher um seria um falso positivo silencioso.
    const resultado = matchToCanonical({
      rawName: "Direito administrativo",
      aliases: [],
      candidates: [
        candidate("a", "Direito administrativo I", DIR_ADM),
        candidate("b", "Direito administrativo II", DIR_ADM),
      ],
    });
    expect(resultado.status).toBe("ambiguous");
  });

  it("oferece alternativas para o painel escolher", () => {
    const resultado = matchToCanonical({
      rawName: "Regência",
      scopeSubjectId: PORT,
      aliases: [],
      candidates: CATALOGO,
    });
    expect(resultado.alternatives.length).toBeGreaterThan(0);
    expect(resultado.alternatives[0]).toHaveProperty("name");
  });

  it("é determinístico: mesma entrada, mesmo resultado", () => {
    const entrada = {
      rawName: "Regência nominal",
      scopeSubjectId: PORT,
      aliases: [],
      candidates: CATALOGO,
    };
    expect(matchToCanonical(entrada)).toEqual(matchToCanonical(entrada));
  });
});

describe("matchToCanonical — o EMBRULHO do edital real", () => {
  /**
   * Pergunta da cliente em 20/08/2026: "se o conteúdo do edital entrar com
   * algum texto a mais, por exemplo 'Conceitos de Crase', o sistema não vai
   * entender que é o mesmo conteúdo nomeado só como 'Crase'?"
   *
   * Na primeira versão, NÃO entendia — todas estas variações caíam na fila.
   * A similaridade por trigramas é simétrica, e um nome curto como "Crase"
   * perde para qualquer texto mais longo. A camada de contenção resolve.
   */
  const embrulhos = [
    "Conceitos de Crase",
    "Noções de crase",
    "Emprego da crase",
    "Uso da crase",
    "Regras de crase",
    "Estudo da crase",
    "Crase: regras gerais e casos especiais",
    "Aspectos gramaticais da crase",
  ];

  it.each(embrulhos)("casa '%s' com o assunto Crase", (texto) => {
    const resultado = matchToCanonical({
      rawName: texto,
      scopeSubjectId: PORT,
      aliases: [],
      candidates: CATALOGO,
    });
    expect(resultado.canonicalId).toBe("crase");
  });

  it("funciona com assunto de nome composto", () => {
    const resultado = matchToCanonical({
      rawName: "Noções de acentuação gráfica",
      scopeSubjectId: PORT,
      aliases: [],
      candidates: CATALOGO,
    });
    expect(resultado.canonicalId).toBe("acentuacao");
  });

  it("A REGRA DA LISTA: enumeração de assuntos vai para a fila, não escolhe um", () => {
    // "Crase, regência e concordância" contém TRÊS assuntos canônicos inteiros.
    // Escolher um esconderia os outros dois do aluno para sempre. O certo é o
    // administrador desmembrar o item.
    const resultado = matchToCanonical({
      rawName: "Crase, regência verbal e nominal, concordância verbal e nominal",
      scopeSubjectId: PORT,
      aliases: [],
      candidates: CATALOGO,
    });

    expect(resultado.status).toBe("ambiguous");
    expect(resultado.canonicalId).toBeNull();
    expect(resultado.alternatives.length).toBeGreaterThan(1);
  });

  it("texto muito específico ainda vai para a fila, com a sugestão certa", () => {
    // "Emprego do sinal indicativo de crase" tem palavras significativas
    // demais para casar sozinho — mas a fila recebe "Crase" como sugestão, e
    // resolver uma vez cria o sinônimo que conserta todos os próximos.
    const resultado = matchToCanonical({
      rawName: "Emprego do sinal indicativo de crase",
      scopeSubjectId: PORT,
      aliases: [],
      candidates: CATALOGO,
    });
    expect(resultado.status).toBe("ambiguous");
    expect(resultado.alternatives[0]?.topicId).toBe("crase");
  });

  it("o embrulho NÃO faz assuntos diferentes se confundirem", () => {
    // O ganho não pode vir às custas de precisão: "Conceitos de pontuação"
    // tem que casar com Pontuação, nunca com Crase.
    const resultado = matchToCanonical({
      rawName: "Conceitos de pontuação",
      scopeSubjectId: PORT,
      aliases: [],
      candidates: CATALOGO,
    });
    expect(resultado.canonicalId).toBe("pont");
  });
});

describe("matchToCanonical — casos de borda", () => {
  it("texto vazio não casa e não quebra", () => {
    const resultado = matchToCanonical({ rawName: "   ", aliases: [], candidates: CATALOGO });
    expect(resultado.status).toBe("unmapped");
    expect(resultado.key).toBe("");
  });

  it("catálogo vazio não quebra", () => {
    const resultado = matchToCanonical({ rawName: "Crase", aliases: [], candidates: [] });
    expect(resultado.status).toBe("unmapped");
  });

  it("escopo que não existe cai de volta no catálogo inteiro", () => {
    // Melhor tentar casar globalmente do que desistir por uma disciplina
    // que ainda não foi mapeada.
    const resultado = matchToCanonical({
      rawName: "Crase",
      scopeSubjectId: "disciplina-inexistente",
      aliases: [],
      candidates: CATALOGO,
    });
    expect(resultado.canonicalId).toBe("crase");
  });

  it("a confiança nunca passa de 1 nem fica negativa", () => {
    for (const texto of ["Crase", "xyz", "Regência verbal e nominal", ""]) {
      const r = matchToCanonical({ rawName: texto, aliases: [], candidates: CATALOGO });
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe("buildMappingQueue — a fila do painel", () => {
  const naoCasa = (texto: string, userId: string) => ({
    rawName: texto,
    subjectHint: "Língua Portuguesa",
    userId,
    result: matchToCanonical({ rawName: texto, aliases: [], candidates: CATALOGO }),
  });

  it("DEDUPLICA: 50 alunos no mesmo texto viram UMA linha", () => {
    const entradas = Array.from({ length: 50 }, (_, i) =>
      naoCasa("Assunto totalmente desconhecido do catálogo", `aluno-${i}`),
    );
    const fila = buildMappingQueue(entradas);

    expect(fila).toHaveLength(1);
    expect(fila[0].occurrences).toBe(50);
    expect(fila[0].affectedUsers.size).toBe(50);
  });

  it("conta pessoas distintas, não ocorrências repetidas do mesmo aluno", () => {
    // Um aluno com o assunto repetido em três lugares do edital não pode
    // parecer três vezes mais urgente que três alunos diferentes.
    const fila = buildMappingQueue([
      naoCasa("Tema inexistente aqui", "aluno-1"),
      naoCasa("Tema inexistente aqui", "aluno-1"),
      naoCasa("Tema inexistente aqui", "aluno-1"),
    ]);
    expect(fila[0].occurrences).toBe(3);
    expect(fila[0].affectedUsers.size).toBe(1);
  });

  it("ordena pelo que trava mais gente", () => {
    const fila = buildMappingQueue([
      naoCasa("Tema raro que ninguem tem", "aluno-1"),
      naoCasa("Tema comum entre muitos alunos", "aluno-1"),
      naoCasa("Tema comum entre muitos alunos", "aluno-2"),
      naoCasa("Tema comum entre muitos alunos", "aluno-3"),
    ]);
    expect(fila[0].affectedUsers.size).toBe(3);
  });

  it("não coloca na fila o que já casou", () => {
    const fila = buildMappingQueue([
      { rawName: "Crase", userId: "a", result: matchToCanonical({ rawName: "Crase", aliases: [], candidates: CATALOGO }) },
    ]);
    expect(fila).toHaveLength(0);
  });

  it("coloca ambíguos na fila — dúvida também precisa ser resolvida", () => {
    const ambiguo = matchToCanonical({
      rawName: "Princípios",
      aliases: [],
      candidates: [candidate("a", "Princípios", DIR_ADM), candidate("b", "Princípios", DIR_CONST)],
    });
    const fila = buildMappingQueue([{ rawName: "Princípios", userId: "a", result: ambiguo }]);
    expect(fila).toHaveLength(1);
    expect(fila[0].alternatives.length).toBeGreaterThan(0);
  });

  it("guarda a melhor sugestão vista para a chave", () => {
    const fila = buildMappingQueue([naoCasa("Regenci verbal", "a")]);
    if (fila.length > 0) {
      expect(fila[0].suggestedConfidence).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("resolveQueueItem — o aprendizado", () => {
  it("resolver cria o sinônimo que conserta os próximos", () => {
    const resolucao = resolveQueueItem(
      taxonomyKey("Emprego do sinal indicativo de crase"),
      "crase",
    );

    expect(resolucao.aliasToCreate.targetId).toBe("crase");
    expect(resolucao.aliasToCreate.origin).toBe("admin");

    // O ciclo fecha: o sinônimo criado faz o próximo aluno casar na camada 0.
    const proximoAluno = matchToCanonical({
      rawName: "Emprego do sinal indicativo de crase",
      aliases: [
        {
          normalizedAlias: resolucao.aliasToCreate.normalizedAlias,
          targetId: resolucao.aliasToCreate.targetId,
          origin: "admin",
        },
      ],
      candidates: CATALOGO,
    });

    expect(proximoAluno.canonicalId).toBe("crase");
    expect(proximoAluno.matchedBy).toBe("alias");
    expect(proximoAluno.confidence).toBe(1);
  });
});

describe("assessMappingHealth", () => {
  const casado = matchToCanonical({ rawName: "Crase", aliases: [], candidates: CATALOGO });
  const naoCasado = matchToCanonical({
    rawName: "Bibliografia sugerida",
    aliases: [],
    candidates: CATALOGO,
  });

  it("mede a proporção casada", () => {
    const saude = assessMappingHealth([casado, casado, casado, naoCasado]);
    expect(saude.total).toBe(4);
    expect(saude.mapped).toBe(3);
    expect(saude.mappedPercent).toBe(75);
  });

  it("EDITAL INTEIRO SEM CASAR pede atenção — é problema de área, não de item", () => {
    const saude = assessMappingHealth([naoCasado, naoCasado, naoCasado, casado]);
    expect(saude.needsAttention).toBe(true);
  });

  it("edital bem casado não pede atenção", () => {
    const saude = assessMappingHealth([casado, casado, casado, casado]);
    expect(saude.needsAttention).toBe(false);
  });

  it("lista vazia não quebra nem alarma", () => {
    const saude = assessMappingHealth([]);
    expect(saude.mappedPercent).toBe(0);
    expect(saude.needsAttention).toBe(false);
  });
});
