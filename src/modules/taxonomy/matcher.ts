import { MATCH_THRESHOLDS, taxonomyKey, trigramSimilarity } from "./normalize";

/**
 * A PONTE — casamento entre o edital do aluno e o catálogo canônico.
 *
 * O problema: o edital de cada aluno vem em texto livre extraído de um PDF
 * ("Emprego do sinal indicativo de crase"); as questões estão presas a um
 * catálogo ("Crase"). Se as duas taxonomias não se encontram, a Tarefa do Dia
 * oferece questões que não existem e a Cobertura do Edital calcula sobre um
 * denominador inventado. O produto parece funcionar e não funciona.
 *
 * TRÊS CAMADAS, DA MAIS BARATA PARA A MAIS CARA:
 *
 *   0. sinônimo exato    — texto já resolvido antes, por IA ou por um admin
 *   1. nome canônico exato
 *   2. similaridade por trigramas, ESCOPADA à disciplina já casada
 *
 * O escopo por disciplina na camada 2 não é otimização, é correção:
 * "Princípios" existe em Direito Administrativo E em Constitucional. Sem o
 * escopo, o casamento aproximado erra com confiança alta — que é o pior tipo
 * de erro, porque é silencioso.
 *
 * NA DÚVIDA, ERRAMOS PARA O LADO DA FILA. Um falso positivo entrega ao aluno
 * questões de outro assunto e ele estuda errado sem saber. Um falso negativo
 * manda o item para a fila do painel, que é visível e barato de corrigir.
 */

export type MatchStatus = "mapped" | "manually_mapped" | "ambiguous" | "unmapped";

export type CanonicalCandidate = {
  id: string;
  name: string;
  /** Chave já normalizada (coluna `normalized_name` do catálogo). */
  normalizedName: string;
  /** Disciplina canônica a que pertence. Nulo para candidatos de disciplina. */
  subjectId?: string | null;
};

export type AliasEntry = {
  /** Chave já normalizada (coluna `normalized_alias`). */
  normalizedAlias: string;
  targetId: string;
  origin: "ai" | "student" | "admin";
};

export type MatchInput = {
  /** Texto como veio do edital, sem normalizar. */
  rawName: string;
  /**
   * Disciplina canônica já casada para este item, quando houver.
   * Restringe a camada 2 e é o que evita o falso positivo entre disciplinas.
   */
  scopeSubjectId?: string | null;
  aliases: AliasEntry[];
  candidates: CanonicalCandidate[];
  thresholds?: { confident: number; ambiguous: number };
};

export type MatchAlternative = { topicId: string; name: string; confidence: number };

export type MatchResult = {
  status: MatchStatus;
  /** Nulo quando não casou. */
  canonicalId: string | null;
  confidence: number;
  /** Qual camada resolveu — entra no log e ajuda a depurar a extração. */
  matchedBy: "alias" | "exact" | "similarity" | null;
  /** Outros candidatos plausíveis, para a fila do painel oferecer escolha. */
  alternatives: MatchAlternative[];
  /** Chave normalizada usada — é ela que deduplica a fila. */
  key: string;
};

const MAX_ALTERNATIVES = 3;

export function matchToCanonical(input: MatchInput): MatchResult {
  const thresholds = input.thresholds ?? MATCH_THRESHOLDS;
  const key = taxonomyKey(input.rawName);

  const empty: MatchResult = {
    status: "unmapped",
    canonicalId: null,
    confidence: 0,
    matchedBy: null,
    alternatives: [],
    key,
  };

  if (key === "") return empty;

  /* --- camada 0: sinônimo exato ------------------------------------------- */
  // É o que faz o sistema melhorar sozinho: cada item que um admin resolve na
  // fila vira um sinônimo, e o próximo aluno com a mesma redação casa aqui,
  // de graça.
  const alias = input.aliases.find((entry) => entry.normalizedAlias === key);
  if (alias) {
    return {
      status: alias.origin === "admin" ? "manually_mapped" : "mapped",
      canonicalId: alias.targetId,
      confidence: 1,
      matchedBy: "alias",
      alternatives: [],
      key,
    };
  }

  /* --- escopo ------------------------------------------------------------- */
  const scoped =
    input.scopeSubjectId == null
      ? input.candidates
      : input.candidates.filter(
          (candidate) =>
            candidate.subjectId == null || candidate.subjectId === input.scopeSubjectId,
        );

  const pool = scoped.length > 0 ? scoped : input.candidates;

  /* --- camada 1: nome canônico exato -------------------------------------- */
  const exact = pool.filter((candidate) => candidate.normalizedName === key);
  if (exact.length === 1) {
    return {
      status: "mapped",
      canonicalId: exact[0].id,
      confidence: 1,
      matchedBy: "exact",
      alternatives: [],
      key,
    };
  }

  // Dois canônicos com o mesmo nome normalizado dentro do escopo: é ambiguidade
  // real do catálogo, e escolher um deles no par ou ímpar seria pior que
  // admitir a dúvida.
  if (exact.length > 1) {
    return {
      status: "ambiguous",
      canonicalId: null,
      confidence: 1,
      matchedBy: null,
      alternatives: exact.slice(0, MAX_ALTERNATIVES).map((candidate) => ({
        topicId: candidate.id,
        name: candidate.name,
        confidence: 1,
      })),
      key,
    };
  }

  /* --- camada 2: similaridade --------------------------------------------- */
  const ranked = pool
    .map((candidate) => ({
      candidate,
      confidence: trigramSimilarity(key, candidate.normalizedName),
    }))
    .filter((entry) => entry.confidence > 0)
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      // Desempate estável: sem isso, dois candidatos igualmente similares
      // alternariam entre execuções e o casamento pareceria aleatório.
      return a.candidate.id < b.candidate.id ? -1 : 1;
    });

  if (ranked.length === 0) return empty;

  const best = ranked[0];
  const alternatives = ranked.slice(0, MAX_ALTERNATIVES).map((entry) => ({
    topicId: entry.candidate.id,
    name: entry.candidate.name,
    confidence: round(entry.confidence),
  }));

  if (best.confidence >= thresholds.confident) {
    // Empate técnico no topo é ambiguidade, não acerto: dois candidatos
    // igualmente bons significam que o texto não distingue entre eles.
    const runnerUp = ranked[1];
    if (runnerUp && best.confidence - runnerUp.confidence < 0.05) {
      return {
        status: "ambiguous",
        canonicalId: null,
        confidence: round(best.confidence),
        matchedBy: null,
        alternatives,
        key,
      };
    }

    return {
      status: "mapped",
      canonicalId: best.candidate.id,
      confidence: round(best.confidence),
      matchedBy: "similarity",
      alternatives: [],
      key,
    };
  }

  if (best.confidence >= thresholds.ambiguous) {
    return {
      status: "ambiguous",
      canonicalId: null,
      confidence: round(best.confidence),
      matchedBy: null,
      alternatives,
      key,
    };
  }

  return { ...empty, confidence: round(best.confidence), alternatives };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/* ========================================================================== *
 * A FILA DO PAINEL
 * ========================================================================== */

export type QueueCandidate = {
  key: string;
  rawName: string;
  subjectHint: string | null;
  suggestedTopicId: string | null;
  suggestedConfidence: number;
  alternatives: MatchAlternative[];
  occurrences: number;
  affectedUsers: Set<string>;
};

export type QueueInput = {
  rawName: string;
  subjectHint?: string | null;
  userId: string;
  result: MatchResult;
};

/**
 * Agrupa o que não casou, DEDUPLICADO por chave normalizada.
 *
 * É o pedido explícito do Eduardo: "quando o casamento falhar, isso precisa ser
 * VISÍVEL — senão o problema fica invisível até o aluno reclamar que não
 * aparece questão."
 *
 * Cinquenta alunos travados no mesmo texto viram UMA linha com
 * `occurrences = 50`. O administrador resolve uma vez, a resolução vira um
 * sinônimo, e os cinquenta são consertados juntos.
 *
 * `affectedUsers` conta pessoas distintas, não ocorrências: um aluno com o
 * mesmo assunto repetido em três lugares do edital não deve parecer três vezes
 * mais urgente que três alunos diferentes.
 */
export function buildMappingQueue(entries: QueueInput[]): QueueCandidate[] {
  const queue = new Map<string, QueueCandidate>();

  for (const entry of entries) {
    const { result } = entry;
    if (result.status === "mapped" || result.status === "manually_mapped") continue;
    if (result.key === "") continue;

    const existing = queue.get(result.key);
    if (existing) {
      existing.occurrences += 1;
      existing.affectedUsers.add(entry.userId);
      // Mantém a melhor sugestão vista para esta chave.
      if (result.confidence > existing.suggestedConfidence) {
        existing.suggestedConfidence = result.confidence;
        existing.suggestedTopicId = result.alternatives[0]?.topicId ?? null;
        existing.alternatives = result.alternatives;
      }
      continue;
    }

    queue.set(result.key, {
      key: result.key,
      rawName: entry.rawName,
      subjectHint: entry.subjectHint ?? null,
      suggestedTopicId: result.alternatives[0]?.topicId ?? null,
      suggestedConfidence: result.confidence,
      alternatives: result.alternatives,
      occurrences: 1,
      affectedUsers: new Set([entry.userId]),
    });
  }

  // Ordem de trabalho do painel: resolve-se primeiro o que trava mais gente.
  return [...queue.values()].sort((a, b) => {
    if (b.affectedUsers.size !== a.affectedUsers.size) {
      return b.affectedUsers.size - a.affectedUsers.size;
    }
    return b.occurrences - a.occurrences;
  });
}

/* ========================================================================== *
 * SAÚDE DO CASAMENTO NUMA PREPARAÇÃO
 * ========================================================================== */

export type MappingHealth = {
  total: number;
  mapped: number;
  unmapped: number;
  ambiguous: number;
  mappedPercent: number;
  /** Verdadeiro quando a preparação inteira merece atenção do administrador. */
  needsAttention: boolean;
};

/** Abaixo disto, o edital tem um problema de área, não um caso isolado. */
const HEALTH_ATTENTION_THRESHOLD = 0.7;

/**
 * Mede quanto do edital de um aluno encontrou o catálogo.
 *
 * Um edital com 30% de casamento não é um item perdido: é sinal de que apareceu
 * uma área nova da taxonomia. O painel precisa saber a diferença entre "faltou
 * um assunto" e "faltou um edital inteiro" — a segunda exige trabalho de
 * catálogo, não de fila.
 */
export function assessMappingHealth(results: MatchResult[]): MappingHealth {
  const total = results.length;
  const mapped = results.filter(
    (r) => r.status === "mapped" || r.status === "manually_mapped",
  ).length;
  const ambiguous = results.filter((r) => r.status === "ambiguous").length;
  const unmapped = total - mapped - ambiguous;
  const mappedPercent = total === 0 ? 0 : mapped / total;

  return {
    total,
    mapped,
    unmapped,
    ambiguous,
    mappedPercent: Math.round(mappedPercent * 100),
    needsAttention: total > 0 && mappedPercent < HEALTH_ATTENTION_THRESHOLD,
  };
}

/* ========================================================================== *
 * RESOLUÇÃO NA FILA
 * ========================================================================== */

export type QueueResolution = {
  key: string;
  resolvedTopicId: string;
  /** Sinônimo a criar, para o próximo aluno casar na camada 0. */
  aliasToCreate: { normalizedAlias: string; targetId: string; origin: "admin" };
};

/**
 * O que acontece quando um administrador resolve um item da fila.
 *
 * Devolve a instrução, não executa — quem grava é a camada de serviço. Manter
 * isto puro é o que permite testar a regra de aprendizado sem banco.
 *
 * O sinônimo criado aqui é o mecanismo que faz a fila encolher com o tempo em
 * vez de receber o mesmo item para sempre.
 */
export function resolveQueueItem(key: string, resolvedTopicId: string): QueueResolution {
  return {
    key,
    resolvedTopicId,
    aliasToCreate: {
      normalizedAlias: key,
      targetId: resolvedTopicId,
      origin: "admin",
    },
  };
}
