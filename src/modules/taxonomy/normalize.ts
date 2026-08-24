/**
 * Normalização de texto para o casamento de taxonomia.
 *
 * É a primeira camada da ponte entre o edital do aluno (texto livre extraído de
 * um PDF) e o catálogo canônico. Tudo que é gravado em `normalized_name` /
 * `normalized_alias` passa por aqui — e é por isso que esta função precisa ser
 * DETERMINÍSTICA E ESTÁVEL.
 *
 * ⚠️ Mudar o comportamento desta função invalida os índices únicos de
 * `canonical_topic_aliases` e `topic_mapping_queue` e faz sinônimos já
 * resolvidos pararem de casar. Se um dia precisar mudar, é migration com
 * recálculo, não edição solta.
 */

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

/**
 * Palavras de ligação que não carregam significado no nome de um assunto.
 *
 * Removê-las é o que faz "Emprego do sinal indicativo de crase" e "emprego do
 * sinal indicativo da crase" caírem na mesma chave. Note que "não" NÃO está na
 * lista: "casos em que não ocorre crase" é o oposto de "casos de crase", e
 * apagar a negação juntaria dois assuntos contrários.
 */
const STOP_WORDS = new Set([
  "a", "as", "ao", "aos", "à", "às",
  "o", "os",
  "de", "do", "da", "dos", "das",
  "em", "no", "na", "nos", "nas",
  "e", "ou",
  "um", "uma", "uns", "umas",
  "para", "por", "pelo", "pela",
  "com", "sem", "sobre",
]);

/**
 * Marcador de enumeração no INÍCIO do item.
 *
 * ⚠️ ISTO SALVOU O CASAMENTO NUM EDITAL REAL.
 * ----------------------------------------------------------------------------
 * Descoberto em 23/08/2026, lendo um edital de verdade pela IA: quase todo
 * edital brasileiro numera os assuntos, e a extração preserva o texto como
 * está — que é o comportamento correto, o aluno precisa reconhecer o documento
 * dele. Só que "3 Emprego do sinal indicativo de crase" não casava com o
 * sinônimo "emprego sinal indicativo crase" por causa do "3".
 *
 * O efeito era brutal e silencioso: 21% de casamento num edital cujo conteúdo
 * o catálogo cobre. Na prática, o aluno subiria o edital e não receberia
 * questão quase nenhuma, e a fila do painel encheria de itens que já tinham
 * correspondência.
 *
 * O QUE É E O QUE NÃO É REMOVIDO
 * ----------------------------------------------------------------------------
 *   "1 Ortografia"        → "Ortografia"
 *   "1.1 Substantivo"     → "Substantivo"
 *   "2.3.1 Verbo"         → "Verbo"
 *   "a) Concordância"     → "Concordância"
 *   "IV - Licitações"     → "Licitações"
 *   "- Pontuação"         → "Pontuação"
 *
 * Números de até 3 dígitos, de propósito: "1988 Constituição" tem quatro e
 * NÃO é enumeração — é conteúdo. Algarismo romano e letra exigem separador
 * (`.`, `)` ou `-`), senão "a" e "I" sozinhos comeriam palavra de verdade.
 *
 * E o marcador precisa ser seguido de uma LETRA: "5 " sozinho, ou "1.2" sem
 * texto depois, não é enumeração de coisa nenhuma.
 */
const SEPARATOR = "[.)\\-–—:]";

const LEADING_ENUMERATION = new RegExp(
  "^\\s*(?:" +
    // Número (e sub-níveis): o separador é OPCIONAL — "1 Ortografia" e
    // "1.1 Substantivo" aparecem sem nenhum.
    `\\d{1,3}(?:\\.\\d{1,3})*\\s*${SEPARATOR}?` +
    "|" +
    // Romano e letra EXIGEM separador. Sem ele, "a crase antes de pronomes"
    // perderia o "a", e "I" ou "V" comeriam o começo de uma palavra.
    `[ivxlcdm]{1,7}\\s*${SEPARATOR}` +
    "|" +
    `[a-z]\\s*${SEPARATOR}` +
    "|" +
    // Marcador de lista puro.
    "[-–—•*]" +
    ")\\s+(?=[a-zà-ÿ])",
  "i",
);

export function stripEnumeration(value: string): string {
  // Aplica repetidamente: "1.1 a) Substantivo" tem dois marcadores.
  let text = value;
  for (let round = 0; round < 3; round += 1) {
    const next = text.replace(LEADING_ENUMERATION, "");
    if (next === text) break;
    text = next;
  }
  return text;
}

/**
 * Forma canônica de comparação: minúscula, sem acento, sem pontuação,
 * espaços colapsados, sem o marcador de enumeração do edital.
 *
 * Mantém os números do CONTEÚDO (importam: "Arts. 5º ao 17" não é
 * "Arts. 20 ao 30"). Só o marcador do começo sai — ver `stripEnumeration`.
 */
export function normalizeText(value: string): string {
  return stripEnumeration(value)
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Chave de casamento: a normalização acima, sem as palavras de ligação.
 *
 * É o que vai para `normalized_name` e `normalized_alias`. Se a remoção das
 * palavras de ligação esvaziar o texto (ex.: um item chamado "Das"), cai de
 * volta para a forma normalizada completa — chave vazia colidiria com tudo.
 */
export function taxonomyKey(value: string): string {
  const normalized = normalizeText(value);
  if (!normalized) return "";

  const words = normalized.split(" ").filter((word) => !STOP_WORDS.has(word));
  const key = words.join(" ");
  return key.length > 0 ? key : normalized;
}

/** Slug estável para URL e para a coluna `slug` do catálogo. */
export function slugify(value: string): string {
  return normalizeText(value).replace(/\s+/g, "-").slice(0, 180) || "item";
}

/**
 * Similaridade entre dois textos, de 0 a 1, por sobreposição de trigramas.
 *
 * Usada na camada 2 do casamento, quando nem o sinônimo exato nem o nome
 * canônico exato bateram. Trigramas (e não palavras) porque erros de digitação
 * e variações de flexão — "constitucional" vs "constitucionais" — precisam
 * continuar próximos.
 *
 * O índice de Jaccard é simétrico: nenhum dos dois lados é privilegiado, o que
 * evita que um nome muito curto case com qualquer coisa que o contenha.
 */
export function trigramSimilarity(a: string, b: string): number {
  const left = trigrams(a);
  const right = trigrams(b);

  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared++;

  return shared / (left.size + right.size - shared);
}

function trigrams(value: string): Set<string> {
  const padded = `  ${normalizeText(value)} `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) grams.add(padded.slice(i, i + 3));
  return grams;
}

/* ========================================================================== *
 * QUALIFICADORES GENÉRICOS
 * ========================================================================== */

/**
 * Palavras que embrulham um assunto sem mudar QUAL assunto é.
 *
 * Edital raramente escreve "Crase". Escreve "Conceitos de Crase", "Noções de
 * crase", "Emprego da crase", "Crase: regras gerais". O assunto é o mesmo; o
 * resto é andaime.
 *
 * ⚠️ NÃO acrescente aqui palavra que seja assunto de verdade em alguma
 * disciplina. "Princípios" parece genérico e é um assunto real em Direito
 * Administrativo e em Constitucional — colocá-lo nesta lista faria
 * "Princípios da Administração Pública" virar "administracao publica" e
 * quebrar o casamento onde ele hoje funciona.
 */
const GENERIC_QUALIFIERS = new Set([
  // "o que é"
  "conceito", "conceitos", "nocao", "nocoes", "definicao", "definicoes",
  "introducao", "fundamento", "fundamentos", "generalidades", "teoria",
  // "como se usa"
  "emprego", "uso", "utilizacao", "aplicacao", "aplicacoes",
  "regra", "regras", "estudo", "analise",
  // "de que tipo"
  "aspecto", "aspectos", "caracteristica", "caracteristicas",
  "tipo", "tipos", "forma", "formas", "classificacao", "elemento", "elementos",
  /*
   * "conceito, requisitos, atributos, classificação e espécies" é a fórmula
   * padrão dos editais de Direito para descrever ASPECTOS de um mesmo instituto.
   * Sem estas três, "Atos administrativos: conceito, requisitos, atributos" —
   * exatamente como aparece nos editais — ficava em 0,65 e caía na fila, apesar
   * de o catálogo ter "Atos administrativos".
   *
   * Nenhuma delas é assunto sozinha: não existe edital com "Requisitos" como
   * tema autônomo. "Espécies de atos administrativos" contém o nome do pai e
   * casa com ele, que é o comportamento desejado enquanto o acervo não tem essa
   * granularidade.
   */
  "requisito", "requisitos", "atributo", "atributos", "especie", "especies",
  "geral", "gerais", "especial", "especiais", "basico", "basicos",
  "principal", "principais", "diverso", "diversos", "demais", "outros",
  "caso", "casos", "gramatical", "gramaticais",
  // adjetivos de norma que aparecem em Português
  "norma", "padrao", "oficial", "vigente", "atual", "atualizada",
  "brasileira", "brasileiro", "portuguesa", "moderna", "contemporanea",
  "culta", "escrita",
]);

/** Palavras significativas de uma chave, já sem os qualificadores genéricos. */
export function meaningfulTokens(key: string): string[] {
  return key.split(" ").filter((token) => token.length > 0 && !GENERIC_QUALIFIERS.has(token));
}

/**
 * Similaridade ASSIMÉTRICA: o quanto o assunto canônico explica o texto do
 * edital.
 *
 * POR QUE ELA EXISTE, ALÉM DA SIMILARIDADE POR TRIGRAMAS
 * ----------------------------------------------------------------------------
 * A comparação por trigramas é simétrica (Jaccard), e isso é proposital: impede
 * que um nome curto como "Crase" case com qualquer texto que apenas o contenha.
 *
 * Só que essa mesma simetria derruba o caso mais comum de edital real:
 * "Conceitos de Crase" tem muitos trigramas que "Crase" não tem, e a
 * similaridade cai para 0,38 — abaixo de qualquer limiar razoável.
 *
 * Esta função resolve pelo outro lado: se TODAS as palavras do assunto canônico
 * aparecem no texto do edital, ele é candidato forte. O que decide a confiança
 * é o que SOBRA:
 *
 *   "Conceitos de Crase"     → sobra {conceitos}          → tudo genérico → 0,95
 *   "Casos proibidos de crase" → sobra {casos, proibidos} → 1 significativa → 0,80
 *   "Crase, regência, concordância" → sobra 2 assuntos    → baixo
 *
 * O último caso é uma LISTA de assuntos, não uma especialização de um. O
 * matcher detecta isso porque mais de um canônico fica contido no mesmo texto,
 * e nesse caso manda para a fila em vez de escolher um.
 */
export function containmentSimilarity(rawKey: string, canonicalKey: string): number {
  const canonicalTokens = meaningfulTokens(canonicalKey);
  if (canonicalTokens.length === 0) return 0;

  const rawTokens = new Set(rawKey.split(" ").filter(Boolean));
  if (rawTokens.size === 0) return 0;

  const allContained = canonicalTokens.every((token) => rawTokens.has(token));
  if (!allContained) return 0;

  const extras = [...rawTokens].filter((token) => !canonicalTokens.includes(token));
  const meaningfulExtras = extras.filter((token) => !GENERIC_QUALIFIERS.has(token));

  // Tudo que sobrou é andaime: é o mesmo assunto, só embrulhado.
  if (meaningfulExtras.length === 0) return 0.95;

  // Cada palavra significativa a mais é um indício de que o texto fala de
  // outra coisa também — pode ser especialização ou pode ser uma lista.
  return Math.max(0, 0.95 - 0.15 * meaningfulExtras.length);
}

/**
 * Limiares do casamento automático.
 *
 * Valores conservadores de propósito: um falso positivo entrega ao aluno
 * questões de outro assunto e é SILENCIOSO — ele estuda errado sem saber.
 * Um falso negativo manda o item para a fila do painel, que é visível e barato
 * de corrigir. Na dúvida, erramos para o lado da fila.
 */
export const MATCH_THRESHOLDS = {
  /** Acima disso, casa automaticamente. */
  confident: 0.82,
  /** Entre `ambiguous` e `confident`, vai para a fila marcado como ambíguo. */
  ambiguous: 0.55,
} as const;
