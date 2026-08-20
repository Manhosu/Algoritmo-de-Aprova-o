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
 * Forma canônica de comparação: minúscula, sem acento, sem pontuação,
 * espaços colapsados.
 *
 * Mantém os números (importam: "Arts. 5º ao 17" não é "Arts. 20 ao 30").
 */
export function normalizeText(value: string): string {
  return value
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
