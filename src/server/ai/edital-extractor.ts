import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { env } from "@/config/env";

import {
  EDITAL_PROMPT_VERSION,
  editalExtractionSchema,
  type EditalExtraction,
} from "./edital-schema";

/**
 * LEITURA DO EDITAL EM PDF
 * ============================================================================
 *
 * A operação mais crítica do produto. Roda uma vez por preparação e é a
 * primeira impressão que o aluno tem: se a extração vier torta, ele corrige
 * tudo na mão e conclui que a plataforma não funciona — antes mesmo de ver o
 * algoritmo trabalhar.
 *
 * Por isso: modelo mais capaz, esforço alto e saída estruturada. O custo por
 * leitura é irrelevante perto de uma extração ruim.
 *
 * DECISÕES DE API
 * ----------------------------------------------------------------------------
 * • `output_config.format` com schema Zod: a resposta chega sempre na forma
 *   certa. Sem parsing de texto livre, que é frágil justamente nos editais
 *   estranhos — os que mais precisam dar certo.
 *
 * • Streaming: edital longo estoura o timeout de requisição não-streaming.
 *
 * • Sem `budget_tokens`: removido nesta geração de modelos. O controle de
 *   profundidade é `output_config.effort`.
 *
 * • Cache do PDF: quando é preciso reprocessar (fatiamento, nova tentativa), o
 *   documento é o mesmo e não deve ser cobrado de novo a cada chamada.
 */

const MODEL = "claude-opus-5";

/** Limites da API para documento em base64. */
const MAX_REQUEST_BYTES = 32 * 1024 * 1024;
const MAX_PAGES_PER_REQUEST = 600;

export type ExtractionUsage = {
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
  durationMs: number;
  model: string;
  promptVersion: string;
};

export type ExtractionOutcome =
  | { status: "succeeded"; data: EditalExtraction; usage: ExtractionUsage }
  | { status: "unreadable"; reason: UnreadableReason; message: string; usage: ExtractionUsage }
  | { status: "failed"; message: string; cause?: unknown };

export type UnreadableReason =
  | "scanned_image"
  | "not_an_edital"
  | "no_program_section"
  | "too_large"
  | "unknown";

/**
 * Mensagens para o ALUNO. Precisam dizer o que fazer, não o que deu errado
 * tecnicamente — "extração falhou" não ajuda ninguém.
 */
const UNREADABLE_MESSAGES: Record<UnreadableReason, string> = {
  scanned_image:
    "Este PDF parece ser uma imagem escaneada, sem texto selecionável — não conseguimos ler o conteúdo. " +
    "Tente baixar o edital direto do site da banca, que normalmente vem em PDF de texto.",
  not_an_edital:
    "Não identificamos um edital de concurso neste arquivo. Confira se enviou o documento certo.",
  no_program_section:
    "Encontramos o edital, mas não localizamos a seção de conteúdo programático. " +
    "Se ela estiver num anexo separado, envie esse anexo.",
  too_large:
    "Este edital é maior do que conseguimos processar de uma vez. " +
    "Se possível, envie apenas as páginas do conteúdo programático.",
  unknown:
    "Não conseguimos ler este edital. Tente enviar novamente ou use outra versão do arquivo.",
};

export function messageForUnreadable(reason: UnreadableReason): string {
  return UNREADABLE_MESSAGES[reason];
}

/* ========================================================================== *
 * PROMPT
 * ========================================================================== */

const SYSTEM_PROMPT = `Você extrai o conteúdo programático de editais de concurso público brasileiros.

O QUE EXTRAIR

Apenas a seção de CONTEÚDO PROGRAMÁTICO (também chamada de "programa das provas", "objetos de avaliação" ou "conteúdo das provas objetivas"). Ignore o restante do edital: inscrições, cronograma administrativo, requisitos do cargo, remuneração, recursos, anexos de formulário.

REGRAS DE FIDELIDADE

1. Copie o nome de cada disciplina e de cada assunto EXATAMENTE como aparece no documento. Não normalize, não corrija, não abrevie, não traduza. Se o edital escreve "Emprego do sinal indicativo de crase", devolva isso — não "Crase".
2. Não invente assunto que não esteja no documento, mesmo que seja óbvio que deveria estar.
3. Não agrupe assuntos distintos num só, nem separe um assunto em vários.
4. Preserve a hierarquia quando o edital numerar subitens (1, 1.1, 1.2): o subitem vira filho.

QUANTIDADE DE QUESTÕES

Preencha "questionCount" SOMENTE quando o documento informar explicitamente o número de questões daquela disciplina ou daquele assunto — em texto ou em tabela de distribuição. Se o edital não disser, use null. Não estime, não divida igualmente, não deduza a partir do total.

CARGOS

Muitos editais cobrem vários cargos com conteúdos diferentes. Liste todos os cargos identificados em "positions" e extraia o conteúdo programático de TODOS eles, agrupado por disciplina. O aluno escolhe o cargo dele depois.

DATA DA PROVA

Preencha "examDate" apenas se o edital indicar a data de aplicação da prova objetiva. Se o documento disser "data provável" ou "sujeita a alteração", marque "examDateIsEstimated" como true. Sem data no documento, use null.

QUANDO NÃO FOR POSSÍVEL LER

Marque "isReadable" como false e indique o motivo:
- "scanned_image": o PDF não tem texto selecionável, é imagem;
- "not_an_edital": o documento não é um edital de concurso;
- "no_program_section": é um edital, mas não contém a seção de conteúdo programático.

É melhor admitir que não deu para ler do que devolver uma extração inventada. Uma extração errada faz o aluno estudar o conteúdo errado.`;

const USER_PROMPT = `Extraia o conteúdo programático deste edital.

Antes de responder, confira internamente:
- todas as disciplinas do programa foram incluídas?
- os nomes estão idênticos ao documento?
- algum "questionCount" foi preenchido sem o documento informar o número?
- a hierarquia de subitens foi preservada?`;

/* ========================================================================== *
 * EXTRAÇÃO
 * ========================================================================== */

export type ExtractEditalInput = {
  /** Conteúdo do PDF. */
  pdf: Uint8Array;
  /** Nome do arquivo, só para mensagem de erro. */
  fileName?: string;
  /** Número de páginas, quando já conhecido — evita uma chamada cara e inútil. */
  pageCount?: number;
  signal?: AbortSignal;
};

export async function extractEdital(
  input: ExtractEditalInput,
): Promise<ExtractionOutcome> {
  if (!env.ANTHROPIC_API_KEY) {
    return {
      status: "failed",
      message:
        "ANTHROPIC_API_KEY não configurada. A leitura de edital não funciona sem ela.",
    };
  }

  /* --- barreiras baratas, antes de gastar uma chamada ---------------------- */
  if (input.pdf.byteLength > MAX_REQUEST_BYTES) {
    return {
      status: "unreadable",
      reason: "too_large",
      message: messageForUnreadable("too_large"),
      usage: emptyUsage(),
    };
  }

  if (input.pageCount !== undefined && input.pageCount > MAX_PAGES_PER_REQUEST) {
    return {
      status: "unreadable",
      reason: "too_large",
      message: messageForUnreadable("too_large"),
      usage: emptyUsage(),
    };
  }

  // PDF sem camada de texto é o caso mais comum de falha, e dá para detectar
  // localmente — sem gastar uma chamada de API que devolveria vazio.
  if (!hasTextLayer(input.pdf)) {
    return {
      status: "unreadable",
      reason: "scanned_image",
      message: messageForUnreadable("scanned_image"),
      usage: emptyUsage(),
    };
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const startedAt = Date.now();

  try {
    const stream = client.messages.stream(
      {
        model: MODEL,
        max_tokens: 64_000,
        system: SYSTEM_PROMPT,
        thinking: { type: "adaptive" },
        output_config: {
          effort: "high",
          format: zodOutputFormat(editalExtractionSchema),
        },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: toBase64(input.pdf),
                },
                // O documento é a parte cara e estável do prompt. Cacheá-lo
                // evita pagar de novo numa retentativa.
                cache_control: { type: "ephemeral" },
              },
              { type: "text", text: USER_PROMPT },
            ],
          },
        ],
      },
      { signal: input.signal },
    );

    const message = await stream.finalMessage();
    const durationMs = Date.now() - startedAt;

    const usage: ExtractionUsage = {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      estimatedCostCents: estimateCostCents(
        message.usage.input_tokens,
        message.usage.output_tokens,
      ),
      durationMs,
      model: MODEL,
      promptVersion: EDITAL_PROMPT_VERSION,
    };

    if (message.stop_reason === "refusal") {
      return {
        status: "failed",
        message: "O modelo recusou processar este documento.",
        cause: message.stop_details,
      };
    }

    const parsed = extractStructuredOutput(message);
    if (parsed === null) {
      return {
        status: "failed",
        message: "A resposta não veio no formato esperado.",
        cause: message.stop_reason,
      };
    }

    const result = editalExtractionSchema.safeParse(parsed);
    if (!result.success) {
      return {
        status: "failed",
        message: "A resposta não passou na validação do schema.",
        cause: result.error.issues,
      };
    }

    if (!result.data.isReadable) {
      const reason = (result.data.unreadableReason ?? "unknown") as UnreadableReason;
      return {
        status: "unreadable",
        reason,
        message: messageForUnreadable(reason),
        usage,
      };
    }

    // O modelo disse que leu, mas não devolveu assunto nenhum. Tratar como
    // sucesso vazio faria o aluno ver uma tela em branco sem explicação.
    const topicCount = countTopics(result.data);
    if (topicCount === 0) {
      return {
        status: "unreadable",
        reason: "no_program_section",
        message: messageForUnreadable("no_program_section"),
        usage,
      };
    }

    return { status: "succeeded", data: result.data, usage };
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      return {
        status: "failed",
        message: describeApiError(error),
        cause: error,
      };
    }
    return {
      status: "failed",
      message: "Falha inesperada ao ler o edital.",
      cause: error,
    };
  }
}

/* ========================================================================== *
 * APOIO
 * ========================================================================== */

/**
 * Detecta se o PDF tem camada de texto.
 *
 * Feito localmente e de propósito: PDF escaneado é o motivo mais comum de a
 * extração devolver vazio, e mandá-lo para a API significa esperar, pagar e
 * receber nada. A checagem procura os operadores de texto do PDF (`BT`/`Tj`) e
 * a presença de fontes.
 *
 * É heurística: pode aceitar um PDF com pouquíssimo texto. O erro nessa direção
 * é barato — a API confirma e devolve `scanned_image`. O erro na direção
 * contrária (rejeitar um PDF legível) seria caro, então a checagem é permissiva.
 */
export function hasTextLayer(pdf: Uint8Array): boolean {
  // Basta inspecionar o começo e o fim: fontes e operadores aparecem espalhados,
  // e varrer 30 MB a cada upload seria desperdício.
  const head = latin1(pdf.subarray(0, Math.min(pdf.byteLength, 2 * 1024 * 1024)));
  const tail = latin1(pdf.subarray(Math.max(0, pdf.byteLength - 512 * 1024)));
  const sample = head + tail;

  const hasFont = /\/(Font|BaseFont|Type1|TrueType|Type0)\b/.test(sample);
  const hasTextOperators = /\bBT\b/.test(sample) || /\bTj\b/.test(sample) || /\bTJ\b/.test(sample);
  // Conteúdo comprimido não expõe os operadores em texto puro; a presença de
  // fonte já é indício suficiente nesse caso.
  const hasCompressedStreams = /\/FlateDecode\b/.test(sample);

  return hasFont && (hasTextOperators || hasCompressedStreams);
}

function latin1(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("latin1");
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** Preços do Claude Opus 5: US$ 5 por milhão de entrada, US$ 25 de saída. */
function estimateCostCents(inputTokens: number, outputTokens: number): number {
  const dollars = (inputTokens / 1_000_000) * 5 + (outputTokens / 1_000_000) * 25;
  return Math.ceil(dollars * 100);
}

function emptyUsage(): ExtractionUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostCents: 0,
    durationMs: 0,
    model: MODEL,
    promptVersion: EDITAL_PROMPT_VERSION,
  };
}

function extractStructuredOutput(message: Anthropic.Message): unknown {
  const withParsed = message as Anthropic.Message & { parsed_output?: unknown };
  if (withParsed.parsed_output != null) return withParsed.parsed_output;

  // Alguns caminhos devolvem o JSON no bloco de texto.
  for (const block of message.content) {
    if (block.type === "text") {
      try {
        return JSON.parse(block.text);
      } catch {
        continue;
      }
    }
  }
  return null;
}

export function countTopics(extraction: EditalExtraction): number {
  return extraction.subjects.reduce(
    (total, subject) =>
      total +
      subject.topics.reduce(
        (subtotal, topic) => subtotal + 1 + (topic.children?.length ?? 0),
        0,
      ),
    0,
  );
}

export function countTopicsWithWeight(extraction: EditalExtraction): number {
  return extraction.subjects.reduce(
    (total, subject) =>
      total +
      subject.topics.reduce(
        (subtotal, topic) =>
          subtotal +
          (topic.questionCount !== null ? 1 : 0) +
          (topic.children?.filter((c) => c.questionCount !== null).length ?? 0),
        0,
      ),
    0,
  );
}

function describeApiError(error: InstanceType<typeof Anthropic.APIError>): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return "A chave da API da Anthropic foi recusada. Verifique ANTHROPIC_API_KEY.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Limite de requisições da API atingido. Tente novamente em alguns instantes.";
  }
  if (error instanceof Anthropic.BadRequestError) {
    return `A requisição foi recusada pela API: ${error.message}`;
  }
  return `Erro na API da Anthropic (${error.status}): ${error.message}`;
}
