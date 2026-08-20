import { readXlsx } from "./xlsx";

/** Marcas de acento separadas por normalize("NFD"). */
const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

/**
 * Importador do banco de questões.
 *
 * O CONTRATO DAS COLUNAS é o da planilha que a cliente já usa (§14 do padrão
 * editorial, em `docs/padrao-editorial-questoes.md`):
 *
 *   Nº | Banca | Disciplina | Assunto | Nível de Dificuldade | Enunciado |
 *   Alternativa A..E | Resposta Correta | Explicação Completa
 *
 * AS VALIDAÇÕES NÃO SÃO INVENÇÃO NOSSA — são a §12 do documento dela
 * ("Qualidade técnica — regra absoluta") transformada em código:
 *
 *   • existe exatamente uma resposta correta;
 *   • nenhuma alternativa duplicada;
 *   • a explicação existe e não é superficial;
 *   • a questão realmente traz enunciado e alternativas.
 *
 * O importador NÃO conserta linha ruim: ele rejeita a linha, diz o número dela e
 * o motivo, e importa o resto. Uma planilha de 500 questões com 3 problemas deve
 * render 497 questões e 3 mensagens claras — não um erro genérico no topo.
 */

export const QUESTION_SHEET_COLUMNS = [
  "Nº",
  "Banca",
  "Disciplina",
  "Assunto",
  "Nível de Dificuldade",
  "Enunciado",
  "Alternativa A",
  "Alternativa B",
  "Alternativa C",
  "Alternativa D",
  "Alternativa E",
  "Resposta Correta",
  "Explicação Completa",
] as const;

export type QuestionDifficulty = "easy" | "medium" | "hard";

export type ParsedQuestion = {
  /** Linha na planilha (1-based, contando o cabeçalho) — para a mensagem de erro. */
  sourceRow: number;
  examBoardName: string;
  subjectName: string;
  topicName: string;
  difficulty: QuestionDifficulty;
  statement: string;
  explanation: string;
  options: Array<{ label: string; content: string; isCorrect: boolean }>;
};

export type ImportIssue = { row: number; message: string };

export type ImportResult = {
  questions: ParsedQuestion[];
  issues: ImportIssue[];
  /** Distribuição do gabarito — ver §8 do padrão editorial. */
  answerDistribution: Record<string, number>;
  /** Alerta quando uma letra domina o gabarito (não bloqueia a importação). */
  answerBalanceWarning: string | null;
};

const OPTION_LABELS = ["A", "B", "C", "D", "E"] as const;

/**
 * A cliente escreve o nível com emoji ("🟢 Fácil"). Normalizamos aceitando o
 * emoji, o texto puro, com ou sem acento — o importador não deve reprovar uma
 * planilha por causa de um acento.
 */
export function parseDifficulty(raw: string): QuestionDifficulty | null {
  const clean = raw
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .replace(/[^a-zA-Z]/g, "")
    .toLowerCase();

  if (!clean) return null;
  if (clean.startsWith("facil") || clean === "easy") return "easy";
  if (clean.startsWith("medi") || clean.startsWith("moderad") || clean === "medium") {
    return "medium";
  }
  if (clean.startsWith("dificil") || clean === "hard") return "hard";
  return null;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Comparação FROUXA: ignora acento, caixa e pontuação.
 *
 * Usada só para casar os NOMES DAS COLUNAS do cabeçalho, onde "Explicação
 * Completa" e "Explicacao completa" são a mesma coisa e a diferença é ruído.
 */
function looseKey(value: string): string {
  return normalizeWhitespace(value)
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .replace(/[^a-z0-9 ]/gi, "")
    .toLowerCase();
}

/**
 * Comparação ESTRITA: normaliza apenas espaço em branco.
 *
 * ⚠️ NÃO remova acento daqui. Esta função decide se duas alternativas são
 * duplicadas, e num banco de questões de português a diferença ENTRE as
 * alternativas costuma ser exatamente o acento:
 *
 *     A) As encomendas poderão ser feitas à qualquer hora.
 *     B) As encomendas poderão ser feitas a qualquer hora.
 *     C) As encomendas poderão ser feitas às qualquer hora.
 *
 * Com normalização de acento, as três viram a mesma string e a questão inteira
 * é rejeitada como se tivesse alternativas repetidas. Foi o que aconteceu na
 * primeira execução do importador: 89 das 95 questões autorais da cliente —
 * todas de crase — foram descartadas por esse motivo.
 *
 * A diferença que o aluno precisa enxergar é a mesma que o validador precisa
 * enxergar.
 */
function strictKey(value: string): string {
  return normalizeWhitespace(value);
}

/** Menor explicação aceitável. Abaixo disso não é "mini aula", é rótulo. */
const MIN_EXPLANATION_LENGTH = 40;
const MIN_STATEMENT_LENGTH = 20;

export function parseQuestionSheet(
  data: Uint8Array,
  options: { sheetName?: string } = {},
): ImportResult {
  const sheet = readXlsx(data, { sheetName: options.sheetName });
  const [header, ...body] = sheet.rows;

  if (!header) throw new Error("A planilha está vazia.");

  /* --- confere o cabeçalho -------------------------------------------------- */
  const headerKeys = header.map(looseKey);
  const missing = QUESTION_SHEET_COLUMNS.filter(
    (column) => !headerKeys.includes(looseKey(column)),
  );
  if (missing.length > 0) {
    throw new Error(
      `A planilha não segue o template. Colunas ausentes: ${missing.join(", ")}. ` +
        `Esperado: ${QUESTION_SHEET_COLUMNS.join(" | ")}.`,
    );
  }

  const columnIndex = (name: string) => headerKeys.indexOf(looseKey(name));
  const col = {
    board: columnIndex("Banca"),
    subject: columnIndex("Disciplina"),
    topic: columnIndex("Assunto"),
    difficulty: columnIndex("Nível de Dificuldade"),
    statement: columnIndex("Enunciado"),
    answer: columnIndex("Resposta Correta"),
    explanation: columnIndex("Explicação Completa"),
    options: OPTION_LABELS.map((label) => columnIndex(`Alternativa ${label}`)),
  };

  const questions: ParsedQuestion[] = [];
  const issues: ImportIssue[] = [];
  const answerDistribution: Record<string, number> = {};
  const seenStatements = new Map<string, number>();

  body.forEach((cells, offset) => {
    const row = offset + 2; // +1 pelo cabeçalho, +1 porque a planilha é 1-based
    const get = (index: number) => normalizeWhitespace(cells[index] ?? "");

    // Linha totalmente vazia no fim da planilha: ignora em silêncio.
    if (cells.every((c) => !c || !c.trim())) return;

    const fail = (message: string) => issues.push({ row, message });

    const statement = get(col.statement);
    const explanation = get(col.explanation);
    const answerRaw = get(col.answer).toUpperCase().replace(/[^A-E]/g, "");
    const difficulty = parseDifficulty(get(col.difficulty));

    const optionContents = col.options.map((index) => get(index));

    /* --- validações da §12 -------------------------------------------------- */
    if (statement.length < MIN_STATEMENT_LENGTH) {
      fail("Enunciado ausente ou curto demais.");
      return;
    }

    const filled = optionContents.filter((c) => c.length > 0);
    if (filled.length < 2) {
      fail(`Questão tem apenas ${filled.length} alternativa(s) preenchida(s).`);
      return;
    }

    if (!difficulty) {
      fail(
        `Nível de dificuldade "${get(col.difficulty)}" não reconhecido. ` +
          `Use 🟢 Fácil, 🟡 Médio ou 🔴 Difícil.`,
      );
      return;
    }

    if (answerRaw.length !== 1) {
      fail(`Resposta correta "${get(col.answer)}" inválida. Use uma letra de A a E.`);
      return;
    }

    const answerIndex = OPTION_LABELS.indexOf(answerRaw as (typeof OPTION_LABELS)[number]);
    if (answerIndex === -1 || !optionContents[answerIndex]) {
      fail(`Resposta correta aponta para a alternativa ${answerRaw}, que está vazia.`);
      return;
    }

    // "Nunca permita alternativas duplicadas."
    const duplicates = new Map<string, string[]>();
    optionContents.forEach((content, index) => {
      if (!content) return;
      const key = strictKey(content);
      duplicates.set(key, [...(duplicates.get(key) ?? []), OPTION_LABELS[index]]);
    });
    const duplicated = [...duplicates.values()].filter((labels) => labels.length > 1);
    if (duplicated.length > 0) {
      fail(
        `Alternativas duplicadas: ${duplicated.map((l) => l.join(" e ")).join("; ")}.`,
      );
      return;
    }

    if (explanation.length < MIN_EXPLANATION_LENGTH) {
      fail(
        "Explicação ausente ou superficial. O padrão editorial exige que a " +
          "resolução funcione como uma mini aula.",
      );
      return;
    }

    // Duplicidade entre linhas do mesmo arquivo.
    const statementKey = strictKey(statement);
    const previous = seenStatements.get(statementKey);
    if (previous) {
      fail(`Enunciado idêntico ao da linha ${previous}.`);
      return;
    }
    seenStatements.set(statementKey, row);

    const board = get(col.board);
    const subject = get(col.subject);
    const topic = get(col.topic);
    if (!board || !subject || !topic) {
      fail("Banca, Disciplina e Assunto são obrigatórios.");
      return;
    }

    answerDistribution[answerRaw] = (answerDistribution[answerRaw] ?? 0) + 1;

    questions.push({
      sourceRow: row,
      examBoardName: board,
      subjectName: subject,
      topicName: topic,
      difficulty,
      statement,
      explanation,
      options: optionContents
        .map((content, index) => ({
          label: OPTION_LABELS[index],
          content,
          isCorrect: index === answerIndex,
        }))
        .filter((option) => option.content.length > 0),
    });
  });

  return {
    questions,
    issues,
    answerDistribution,
    answerBalanceWarning: buildAnswerBalanceWarning(answerDistribution, questions.length),
  };
}

/**
 * §8 do padrão editorial: "nenhuma letra deve dominar claramente o conjunto".
 *
 * Não bloqueia a importação — avisa. Um acervo com gabarito viciado ensina o
 * aluno a chutar em vez de estudar, e o algoritmo lê o chute como conhecimento.
 * O problema precisa aparecer na importação, não no comportamento do aluno.
 */
export function buildAnswerBalanceWarning(
  distribution: Record<string, number>,
  total: number,
): string | null {
  if (total < 20) return null;

  const expected = 1 / OPTION_LABELS.length; // 20%
  const entries = OPTION_LABELS.map((label) => ({
    label,
    count: distribution[label] ?? 0,
    share: (distribution[label] ?? 0) / total,
  }));

  const dominant = entries.find((e) => e.share >= expected * 1.6); // ≥ 32%
  const scarce = entries.filter((e) => e.share <= expected * 0.4); // ≤ 8%

  if (!dominant && scarce.length === 0) return null;

  const summary = entries
    .map((e) => `${e.label}: ${e.count} (${Math.round(e.share * 100)}%)`)
    .join(" · ");

  const parts: string[] = [];
  if (dominant) {
    parts.push(
      `a letra ${dominant.label} concentra ${Math.round(dominant.share * 100)}% do gabarito`,
    );
  }
  if (scarce.length > 0) {
    parts.push(`${scarce.map((e) => e.label).join(" e ")} quase não aparece(m)`);
  }

  return `Gabarito desequilibrado — ${parts.join(" e ")}. Distribuição: ${summary}.`;
}
