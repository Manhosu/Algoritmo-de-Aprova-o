import "server-only";

import { readXlsx } from "./xlsx";

/**
 * IMPORTAÇÃO DE FLASHCARDS.
 * ============================================================================
 *
 * A cliente monta os cartões numa planilha e envia. O formato é o de
 * `docs/padrao-flashcards.md`, que ela seguiu na primeira remessa:
 *
 *   Disciplina | Assunto | Baralho | Frente | Verso | Dica | Ordem | Acesso
 *
 * ⚠️ ESTE ARQUIVO NÃO TOCA NO BANCO. Ele lê, valida e devolve o que entendeu,
 * junto com a lista de problemas. Quem grava é o script de importação, e a
 * separação existe para a validação ser testável sem banco — do mesmo jeito
 * que `import/questions.ts`.
 */

export type ParsedFlashcard = {
  subject: string;
  topic: string;
  deck: string;
  front: string;
  back: string;
  hint: string | null;
  sortOrder: number;
  /** `full` = só nos planos pagos. Qualquer outra coisa vira `limited`. */
  accessLevel: "limited" | "full";
};

export type FlashcardIssue = {
  /** Linha da planilha como a cliente a vê: 1 é o cabeçalho. */
  row: number;
  message: string;
};

export type FlashcardImportResult = {
  cards: ParsedFlashcard[];
  issues: FlashcardIssue[];
  /** Baralhos encontrados, na ordem em que aparecem. */
  decks: Array<{ subject: string; topic: string; deck: string; count: number }>;
};

/**
 * Os nomes de coluna que a tela do painel mostra a quem vai montar a planilha.
 *
 * ⚠️ SAI DAQUI, e não de uma lista repetida na tela. `COLUMNS` aceita
 * sinônimos ("baralho" ou "deck"); a tela mostra o primeiro de cada. Uma
 * segunda lista escrita à mão discordaria desta no dia em que uma coluna
 * mudasse, e a cliente montaria a planilha pelo texto errado.
 */
export const FLASHCARD_SHEET_COLUMNS = [
  "Disciplina",
  "Assunto",
  "Baralho",
  "Frente",
  "Verso",
  "Dica",
  "Ordem",
  "Acesso",
] as const;

/** Os cabeçalhos aceitos, normalizados. */
const COLUMNS = {
  subject: ["disciplina"],
  topic: ["assunto"],
  deck: ["baralho", "deck"],
  front: ["frente", "pergunta"],
  back: ["verso", "resposta"],
  hint: ["dica"],
  order: ["ordem"],
  access: ["acesso", "plano"],
} as const;

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * O Excel entrega o número da coluna "Ordem" como "1.0", não como "1".
 *
 * Já custou uma importação: `parseInt("1.0")` dá 1, mas `Number.isInteger` na
 * validação reprovava a planilha inteira por "ordem inválida".
 */
function parseOrder(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

export function parseFlashcards(
  data: Uint8Array,
  options: { sheetName?: string } = {},
): FlashcardImportResult {
  const sheet = readXlsx(data, { sheetName: options.sheetName });

  if (sheet.rows.length === 0) {
    throw new Error("A planilha está vazia.");
  }

  const header = sheet.rows[0].map(normalizeHeader);
  const indexOf = (names: readonly string[]): number =>
    header.findIndex((cell) => names.includes(cell));

  const col = {
    subject: indexOf(COLUMNS.subject),
    topic: indexOf(COLUMNS.topic),
    deck: indexOf(COLUMNS.deck),
    front: indexOf(COLUMNS.front),
    back: indexOf(COLUMNS.back),
    hint: indexOf(COLUMNS.hint),
    order: indexOf(COLUMNS.order),
    access: indexOf(COLUMNS.access),
  };

  const missing = (["subject", "topic", "deck", "front", "back"] as const).filter(
    (key) => col[key] === -1,
  );

  if (missing.length > 0) {
    throw new Error(
      `A planilha não tem as colunas obrigatórias: ${missing.join(", ")}. ` +
        "O formato esperado está em docs/padrao-flashcards.md.",
    );
  }

  const cards: ParsedFlashcard[] = [];
  const issues: FlashcardIssue[] = [];
  const deckIndex = new Map<string, { subject: string; topic: string; deck: string; count: number }>();

  for (let i = 1; i < sheet.rows.length; i += 1) {
    const row = sheet.rows[i];
    const at = (index: number): string => (index >= 0 ? (row[index] ?? "").trim() : "");
    const rowNumber = i + 1;

    const front = at(col.front);
    const back = at(col.back);

    /*
     * ⚠️ LINHA TOTALMENTE VAZIA É PULADA EM SILÊNCIO, NÃO REPORTADA.
     *
     * A primeira planilha da cliente tinha 150 cartões e 847 linhas em branco
     * depois deles — o Excel guarda as linhas que já foram tocadas alguma vez.
     * Reportar 847 "erros" transformaria uma planilha perfeita num relatório
     * assustador e faria ela procurar defeito onde não há.
     */
    if (row.every((cell) => !cell || !cell.trim())) continue;

    if (!front || !back) {
      issues.push({
        row: rowNumber,
        message: !front ? "Frente vazia." : "Verso vazio.",
      });
      continue;
    }

    const subject = at(col.subject);
    const topic = at(col.topic);
    const deck = at(col.deck);

    if (!subject || !topic || !deck) {
      issues.push({
        row: rowNumber,
        message: "Falta disciplina, assunto ou baralho — sem isso o cartão não tem onde morar.",
      });
      continue;
    }

    const access = at(col.access).toLowerCase();

    cards.push({
      subject,
      topic,
      deck,
      front,
      back,
      hint: at(col.hint) || null,
      sortOrder: parseOrder(at(col.order), cards.length + 1),
      // Só "premium"/"full" restringe. O padrão é aberto: um cartão que a
      // cliente esqueceu de marcar deve aparecer, não sumir.
      accessLevel: access === "premium" || access === "full" ? "full" : "limited",
    });

    const key = `${subject}||${topic}||${deck}`;
    const found = deckIndex.get(key);
    if (found) found.count += 1;
    else deckIndex.set(key, { subject, topic, deck, count: 1 });
  }

  return { cards, issues, decks: [...deckIndex.values()] };
}
