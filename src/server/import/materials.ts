import "server-only";

import { readXlsx } from "./xlsx";

/**
 * IMPORTAÇÃO DE MATERIAIS POR PLANILHA.
 * ============================================================================
 *
 * ⚠️ O GARGALO DO PRODUTO NÃO É CÓDIGO, É ACERVO.
 *
 * O card "Acervo de estudos" mostra 1% de cobertura do edital da cliente. Todo
 * o resto do Marco 2 está pronto e quase vazio: a prova de domínio não abre sem
 * questões, o Mind-X não teria vídeo, a biblioteca filtra um punhado de itens.
 *
 * O cadastro item a item existe e funciona, e é o caminho errado para colocar
 * duzentos materiais no ar. Esta importação é a mesma ideia da de questões, que
 * já provou funcionar com 1.046 linhas.
 *
 * ⚠️ ESTE ARQUIVO SÓ LÊ E CONFERE. Quem grava é `run-material-import`, pelo
 * mesmo motivo que separa parser de escrita na importação de questões: uma
 * planilha ruim precisa ser recusada INTEIRA antes de a primeira linha entrar
 * no banco.
 */

export const MATERIAL_SHEET_COLUMNS = [
  "Título",
  "Tipo",
  "Disciplina",
  "Assunto",
  "Endereço",
  "Descrição",
  "Quem pode ver",
] as const;

/** O que a cliente escreve na coluna Tipo, e o valor que o banco guarda. */
const TIPOS: Record<string, string> = {
  resumo: "study_text",
  resumos: "study_text",
  texto: "study_text",
  "mapa mental": "mind_map",
  "mapa-mental": "mind_map",
  mapa: "mind_map",
  flashcard: "flashcard_deck",
  flashcards: "flashcard_deck",
  baralho: "flashcard_deck",
  video: "video",
  videoaula: "video",
  pdf: "pdf",
  audio: "audio",
};

/** O que ela escreve em "Quem pode ver", e o nível que o banco guarda. */
const ACESSOS: Record<string, "limited" | "extended" | "full"> = {
  "": "limited",
  todos: "limited",
  "todos os planos": "limited",
  free: "limited",
  limitado: "limited",
  ampliado: "extended",
  intermediario: "extended",
  intermediário: "extended",
  "ampliado e completo": "extended",
  completo: "full",
  premium: "full",
  "so no completo": "full",
  "só no completo": "full",
};

export type ParsedMaterial = {
  title: string;
  type: string;
  subjectName: string;
  topicName: string;
  externalUrl: string | null;
  description: string | null;
  requiredAccessLevel: "limited" | "extended" | "full";
};

export type MaterialIssue = { row: number; message: string };

export type MaterialParseResult = {
  materials: ParsedMaterial[];
  issues: MaterialIssue[];
};

/** Marcas de acento separadas por `normalize("NFD")`. */
const DIACRITICS = new RegExp("[\u0300-\u036f]", "g");

/** Compara cabeçalho e rótulo ignorando acento, caixa e espaço. */
function looseKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function limpar(valor: string | undefined): string {
  return (valor ?? "").replace(/\s+/g, " ").trim();
}

export function parseMaterialSheet(
  data: Uint8Array,
  options: { sheetName?: string } = {},
): MaterialParseResult {
  const sheet = readXlsx(data, { sheetName: options.sheetName });
  const [header, ...body] = sheet.rows;

  if (!header) throw new Error("A planilha está vazia.");

  const headerKeys = header.map(looseKey);

  /*
    ⚠️ SÓ AS QUATRO PRIMEIRAS COLUNAS SÃO OBRIGATÓRIAS no cabeçalho.

    Endereço, Descrição e "Quem pode ver" podem faltar: material sem endereço
    entra como rascunho, descrição é opcional e o acesso tem padrão. Exigir as
    sete recusaria uma planilha boa por causa de uma coluna vazia.
  */
  const obrigatorias = MATERIAL_SHEET_COLUMNS.slice(0, 4);
  const faltando = obrigatorias.filter((c) => !headerKeys.includes(looseKey(c)));

  if (faltando.length > 0) {
    throw new Error(
      `A planilha não segue o template. Colunas ausentes: ${faltando.join(", ")}. ` +
        `Esperado: ${MATERIAL_SHEET_COLUMNS.join(" | ")}.`,
    );
  }

  const indice = (nome: string) => headerKeys.indexOf(looseKey(nome));
  const col = {
    title: indice("Título"),
    type: indice("Tipo"),
    subject: indice("Disciplina"),
    topic: indice("Assunto"),
    url: indice("Endereço"),
    description: indice("Descrição"),
    access: indice("Quem pode ver"),
  };

  const materials: ParsedMaterial[] = [];
  const issues: MaterialIssue[] = [];

  /*
    Título repetido dentro da MESMA planilha é erro de digitação dela, e vale
    apontar a linha. Título repetido contra o banco é outra coisa, e quem
    decide é a gravação.
  */
  const vistos = new Map<string, number>();

  body.forEach((cells, offset) => {
    const row = offset + 2;
    const get = (i: number) => (i >= 0 ? limpar(cells[i]) : "");

    if (cells.every((c) => !c || !c.trim())) return;

    const fail = (mensagem: string) => issues.push({ row, message: mensagem });

    const title = get(col.title);
    if (title.length < 3) {
      fail("Título ausente ou curto demais.");
      return;
    }

    const anterior = vistos.get(looseKey(title));
    if (anterior !== undefined) {
      fail(`Título repetido: já apareceu na linha ${anterior}.`);
      return;
    }
    vistos.set(looseKey(title), row);

    const tipoBruto = looseKey(get(col.type));
    const type = TIPOS[tipoBruto];
    if (!type) {
      fail(
        `Tipo "${get(col.type)}" não reconhecido. Use: Resumo, Mapa mental, ` +
          `Flashcards, Videoaula, PDF ou Áudio.`,
      );
      return;
    }

    const subjectName = get(col.subject);
    if (!subjectName) {
      fail("Disciplina em branco.");
      return;
    }

    const url = get(col.url);
    if (url && !/^https?:\/\//i.test(url)) {
      /*
        Sem o esquema, o navegador trata o valor como caminho relativo e o aluno
        cai numa página inexistente DENTRO da plataforma. Parece defeito nosso.
      */
      fail(`Endereço "${url}" precisa começar com http:// ou https://`);
      return;
    }

    const acessoBruto = looseKey(get(col.access));
    const requiredAccessLevel = ACESSOS[acessoBruto];
    if (requiredAccessLevel === undefined) {
      fail(
        `"Quem pode ver" com "${get(col.access)}" não reconhecido. Use: ` +
          `Todos os planos, Ampliado e Completo, ou Só no Completo.`,
      );
      return;
    }

    materials.push({
      title,
      type,
      subjectName,
      topicName: get(col.topic),
      externalUrl: url || null,
      description: get(col.description) || null,
      requiredAccessLevel,
    });
  });

  return { materials, issues };
}
