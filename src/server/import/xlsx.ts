import { unzipSync, strFromU8 } from "fflate";

/**
 * Leitor mínimo de planilha .xlsx.
 *
 * POR QUE NÃO USAR UMA BIBLIOTECA PRONTA
 * ----------------------------------------------------------------------------
 * As opções populares trazem 90+ pacotes transitivos, vários deles sem
 * manutenção. Este leitor vai rodar num endpoint onde um administrador FAZ
 * UPLOAD de arquivo (README 2.6) — o lugar do sistema onde menos superfície de
 * terceiro é melhor.
 *
 * E o problema aqui é estreito: a planilha é um TEMPLATE que nós definimos, com
 * colunas fixas e só texto. Não precisamos de fórmulas, datas, estilos, gráficos
 * nem tabelas dinâmicas. Precisamos de células como string.
 *
 * O que existe de dependência é `fflate` (descompactar o zip), que é pequena,
 * sem dependências próprias e mantida. O resto é leitura de dois XMLs.
 *
 * Limites conhecidos e aceitos: não avalia fórmulas (lê o último valor
 * calculado), não converte números de série de data e ignora formatação.
 */

const XML_ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeXml(value: string): string {
  return value
    .replace(/&(lt|gt|amp|quot|apos);/g, (m) => XML_ENTITIES[m])
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

/** "A" → 0, "B" → 1, … "AA" → 26. */
function columnToIndex(ref: string): number {
  let index = 0;
  for (const char of ref) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

/** Concatena todos os `<t>` de um bloco (texto rico vira uma string só). */
function collectText(xml: string): string {
  let out = "";
  for (const match of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += match[1];
  return decodeXml(out);
}

export type XlsxSheet = {
  name: string;
  /** Matriz de células como string. Célula vazia vira "". */
  rows: string[][];
};

export type ReadXlsxOptions = {
  /** Nome da aba. Quando omitido, lê a primeira. */
  sheetName?: string;
  /** Teto de linhas, para um arquivo gigante não derrubar o processo. */
  maxRows?: number;
};

export function readXlsx(data: Uint8Array, options: ReadXlsxOptions = {}): XlsxSheet {
  const { maxRows = 20_000 } = options;

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data);
  } catch {
    throw new Error(
      "Arquivo inválido: não é uma planilha .xlsx (não foi possível descompactar).",
    );
  }

  const read = (path: string): string | null => {
    const file = files[path];
    return file ? strFromU8(file) : null;
  };

  const workbook = read("xl/workbook.xml");
  if (!workbook) {
    throw new Error("Arquivo inválido: não contém xl/workbook.xml.");
  }

  /* --- abas e seus alvos ---------------------------------------------------- */
  const rels = read("xl/_rels/workbook.xml.rels") ?? "";
  const relTargets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    relTargets.set(m[1], m[2].replace(/^\/?xl\//, "").replace(/^\.\//, ""));
  }

  const sheets: Array<{ name: string; path: string }> = [];
  for (const m of workbook.matchAll(/<sheet\s[^>]*\/?>/g)) {
    const name = m[0].match(/name="([^"]*)"/)?.[1];
    const rid = m[0].match(/r:id="([^"]*)"/)?.[1];
    if (!name) continue;
    const target = rid ? relTargets.get(rid) : undefined;
    sheets.push({
      name: decodeXml(name),
      path: `xl/${target ?? `worksheets/sheet${sheets.length + 1}.xml`}`,
    });
  }

  if (sheets.length === 0) throw new Error("A planilha não tem nenhuma aba.");

  const target = options.sheetName
    ? sheets.find((s) => s.name.trim().toLowerCase() === options.sheetName!.trim().toLowerCase())
    : sheets[0];

  if (!target) {
    throw new Error(
      `Aba "${options.sheetName}" não encontrada. Abas disponíveis: ${sheets
        .map((s) => s.name)
        .join(", ")}.`,
    );
  }

  const sheetXml = read(target.path);
  if (!sheetXml) throw new Error(`Não foi possível ler a aba "${target.name}".`);

  /* --- strings compartilhadas ---------------------------------------------- */
  const sharedXml = read("xl/sharedStrings.xml");
  const shared: string[] = [];
  if (sharedXml) {
    for (const m of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(collectText(m[1]));
  }

  /* --- células -------------------------------------------------------------- */
  const rowsByNumber = new Map<number, string[]>();
  let widest = 0;

  for (const rowMatch of sheetXml.matchAll(/<row[^>]*\sr="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(rowMatch[1]);
    if (rowsByNumber.size >= maxRows) {
      throw new Error(
        `A planilha excede o limite de ${maxRows.toLocaleString("pt-BR")} linhas.`,
      );
    }

    const cells: string[] = [];
    for (const cellMatch of rowMatch[2].matchAll(
      /<c\s[^>]*r="([A-Z]+)\d+"([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const index = columnToIndex(cellMatch[1]);
      const attrs = cellMatch[2] ?? "";
      const inner = cellMatch[3] ?? "";
      const type = attrs.match(/\st="([^"]+)"/)?.[1];

      let value = "";
      if (type === "s") {
        const raw = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        if (raw !== undefined) value = shared[Number(raw)] ?? "";
      } else if (type === "inlineStr") {
        value = collectText(inner);
      } else if (type === "b") {
        value = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] === "1" ? "TRUE" : "FALSE";
      } else {
        const raw = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        if (raw !== undefined) value = decodeXml(raw);
      }

      cells[index] = value;
      if (index + 1 > widest) widest = index + 1;
    }

    rowsByNumber.set(rowNumber, cells);
  }

  const maxRowNumber = Math.max(0, ...rowsByNumber.keys());
  const rows: string[][] = [];
  for (let n = 1; n <= maxRowNumber; n++) {
    const cells = rowsByNumber.get(n) ?? [];
    const normalized: string[] = [];
    for (let c = 0; c < widest; c++) normalized[c] = cells[c] ?? "";
    rows.push(normalized);
  }

  return { name: target.name, rows };
}

/** Lista os nomes das abas sem carregar o conteúdo — útil para a UI de upload. */
export function listXlsxSheets(data: Uint8Array): string[] {
  const files = unzipSync(data);
  const workbook = files["xl/workbook.xml"];
  if (!workbook) return [];
  return [...strFromU8(workbook).matchAll(/<sheet[^>]*name="([^"]*)"/g)].map((m) =>
    decodeXml(m[1]),
  );
}

/**
 * O arquivo é uma planilha .xlsx de verdade?
 *
 * ⚠️ CONFERE OS BYTES, e não o nome. A cliente esbarrou nisso em 09/09/2026:
 * "eu coloco pra selecionar no drive, e o sistema não permite selecionar o
 * excel".
 *
 * Arquivo escolhido pelo Google Drive chega ao navegador sem extensão e com
 * tipo genérico, então `nome.endsWith(".xlsx")` recusava a planilha certa. É a
 * mesma lição dos mapas mentais dela, que vieram do Drive sem extensão: o nome
 * de arquivo descreve, os bytes provam.
 *
 * Um .xlsx é um ZIP, e todo ZIP começa com "PK" seguido de 03 04. Não prova que
 * a planilha é válida — `readXlsx` continua sendo quem diz isso —, mas separa
 * "mandou o arquivo errado" de "mandou um .xlsx que eu não consegui ler", e as
 * duas mensagens precisam ser diferentes para a pessoa saber o que corrigir.
 */
export function ehArquivoXlsx(bytes: Uint8Array): boolean {
  return (
    bytes.length > 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

/**
 * A instrução que a cliente precisa quando o arquivo não é .xlsx.
 *
 * ⚠️ O CASO MAIS PROVÁVEL É PLANILHA GOOGLE, e não arquivo errado.
 *
 * Ela guarda os flashcards no Drive. Uma Planilha Google não é um arquivo:
 * é um documento que vive no servidor deles, e o Drive só entrega um .xlsx
 * depois de exportar. Dizer "precisa ser .xlsx" sem dizer isso deixa a pessoa
 * tentando de novo com o mesmo arquivo.
 */
export const COMO_EXPORTAR_XLSX =
  "Este arquivo não é uma planilha .xlsx. Se ela está no Google Drive como " +
  "Planilhas Google, abra e use Arquivo → Fazer download → Microsoft Excel " +
  "(.xlsx), e envie o arquivo que baixar.";
