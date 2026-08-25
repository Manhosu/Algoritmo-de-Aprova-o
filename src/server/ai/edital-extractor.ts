import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { env } from "@/config/env";

import {
  EDITAL_PROMPT_VERSION,
  clipExtraction,
  editalExtractionSchema,
  type EditalExtraction,
} from "./edital-schema";
import { extractEditalText } from "./pdf-text";

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

/**
 * Modelo da leitura, configurável.
 *
 * PREÇOS POR MILHÃO DE TOKENS (agosto/2026)
 * ----------------------------------------------------------------------------
 *   claude-opus-5     $5 entrada / $25 saída
 *   claude-sonnet-5   $2 entrada / $10 saída
 *   claude-haiku-4-5  $1 entrada /  $5 saída
 *
 * O padrão é Opus 5 porque a leitura do edital é a operação que define se o
 * aluno confia no produto: uma extração torta significa corrigir trezentas
 * linhas na mão, e ninguém faz isso duas vezes.
 *
 * ⚠️ Com o texto já extraído localmente, a tarefa fica muito mais fácil — não
 * há mais layout nem imagem para interpretar, só texto limpo. É bem provável
 * que Sonnet ou Haiku deem o mesmo resultado por 2,5x a 5x menos. Isso PRECISA
 * ser medido antes de trocar, e `npm run compare:models` existe para isso.
 */
const MODEL = env.EDITAL_MODEL ?? "claude-opus-5";

/**
 * Teto de saída do modelo. Medido contra a API: 128.000 é o máximo aceito para
 * `claude-opus-5`; 200.000 volta 400.
 *
 * ⚠️ O raciocínio adaptativo consome deste mesmo orçamento. Com 64.000 — metade
 * do disponível — um edital real de 83 páginas truncava o JSON no meio de uma
 * string e a leitura falhava com "erro inesperado".
 */
const MAX_OUTPUT_TOKENS = 128_000;

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
  /** Como o documento foi enviado — entra no log para explicar o custo. */
  inputMode: "text_sliced" | "text_full" | "pdf";
};

export type ExtractionOutcome =
  | { status: "succeeded"; data: EditalExtraction; usage: ExtractionUsage }
  | { status: "unreadable"; reason: UnreadableReason; message: string; usage: ExtractionUsage }
  | {
      status: "failed";
      /** ⚠️ Vai para a TELA DO ALUNO. Nunca repasse texto cru da API aqui. */
      message: string;
      /** Detalhe técnico para o painel administrativo e o log. */
      operatorDetail?: string;
      cause?: unknown;
    };

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

Liste em "positions" TODOS os cargos que você identificar no documento — isso é barato e permite ao aluno corrigir se o cargo dele for outro.

Já o CONTEÚDO PROGRAMÁTICO segue a instrução do pedido do usuário: quando ele informar um cargo, extraia apenas os conhecimentos comuns a todos os cargos mais os específicos daquele. Não extraia o conteúdo específico dos demais.

DATA DA PROVA

Preencha "examDate" apenas se o edital indicar a data de aplicação da prova objetiva. Se o documento disser "data provável" ou "sujeita a alteração", marque "examDateIsEstimated" como true. Sem data no documento, use null.

QUANDO NÃO FOR POSSÍVEL LER

Marque "isReadable" como false e indique o motivo:
- "scanned_image": o PDF não tem texto selecionável, é imagem;
- "not_an_edital": o documento não é um edital de concurso;
- "no_program_section": é um edital, mas não contém a seção de conteúdo programático.

É melhor admitir que não deu para ler do que devolver uma extração inventada. Uma extração errada faz o aluno estudar o conteúdo errado.`;

/**
 * ⚠️ O CARGO É O QUE TORNA A LEITURA VIÁVEL NUM EDITAL REAL.
 *
 * A primeira versão pedia o conteúdo de TODOS os cargos ("o aluno escolhe o
 * dele depois"). Parecia generoso e não sobrevive ao mundo: o edital do TJ-RJ
 * tem 83 páginas e oito especialidades, cada uma com o programa completo. O
 * JSON estourou o orçamento de saída e a leitura falhou inteira.
 *
 * Só que o aluno JÁ DISSE o cargo dele no passo 1. Pedir o tronco comum mais a
 * especialidade dele corta a saída em várias vezes, sai mais barato, mais
 * rápido — e entrega exatamente o edital DELE, não um superconjunto que ele
 * teria de podar na tela seguinte.
 *
 * `positions` continua trazendo TODOS os cargos identificados, para a tela
 * poder dizer qual foi usado e oferecer a troca se a escolha estiver errada.
 */
function buildUserPrompt(targetPosition?: string | null): string {
  const focus = targetPosition?.trim()
    ? `O aluno vai prestar o cargo: "${targetPosition.trim()}".

Extraia:
- os CONHECIMENTOS BÁSICOS / GERAIS, que valem para todos os cargos;
- os CONHECIMENTOS ESPECÍFICOS APENAS desse cargo.

Ignore o conteúdo específico dos outros cargos. Se não encontrar esse cargo
exato, use o mais parecido e diga qual escolheu em "notes".`
    : `Extraia o conteúdo programático de todos os cargos, agrupado por disciplina.`;

  return `Extraia o conteúdo programático deste edital.

${focus}

Antes de responder, confira internamente:
- todas as disciplinas que valem para esse cargo foram incluídas?
- os nomes estão idênticos ao documento?
- algum "questionCount" foi preenchido sem o documento informar o número?
- a hierarquia de subitens foi preservada?`;
}

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
  /**
   * Cargo que o aluno informou no passo 1.
   *
   * ⚠️ É o que torna a leitura viável em edital real. Ver a nota em
   * `buildUserPrompt`.
   */
  targetPosition?: string | null;
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

  /**
   * ⚠️ AQUI MORA A MAIOR ECONOMIA DO PRODUTO.
   *
   * Medido no edital do TJ-RJ (83 páginas):
   *   PDF como documento ......... 262.214 tokens de entrada
   *   texto só do anexo ........... ~39.600 tokens          ← 7x menos
   *
   * A API trata cada página do PDF como IMAGEM além de texto, e imagem custa
   * perto de 2.000 tokens por página. Mandando o texto que a gente mesmo
   * extraiu, some tudo isso — e o corte para o anexo tira ainda o resto do
   * edital, que a IA leria só para ignorar.
   *
   * PDF escaneado não tem camada de texto: aí o PDF original vai mesmo, porque
   * a leitura de imagem é a única chance. Melhor pagar caro do que não ler.
   */
  const extracted = await extractEditalText(input.pdf);
  const useText = extracted.hasUsableText && extracted.text.length > 0;

  const documentBlock: Anthropic.ContentBlockParam = useText
    ? {
        type: "text",
        text:
          `Conteúdo do edital em texto` +
          (extracted.slicedToContent && extracted.pageRange
            ? ` (páginas ${extracted.pageRange.from} a ${extracted.pageRange.to} de ${extracted.totalPages}, ` +
              `a seção de conteúdo programático)`
            : ` (documento completo, ${extracted.totalPages} páginas)`) +
          `:

${extracted.text}`,
        // A parte cara e estável do prompt. Cacheá-la evita pagar de novo numa
        // retentativa.
        cache_control: { type: "ephemeral" },
      }
    : {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: toBase64(input.pdf),
        },
        cache_control: { type: "ephemeral" },
      };

  const inputMode: ExtractionUsage["inputMode"] = useText
    ? extracted.slicedToContent
      ? "text_sliced"
      : "text_full"
    : "pdf";

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const startedAt = Date.now();

  try {
    const stream = client.messages.stream(
      {
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
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
              documentBlock,
              { type: "text", text: buildUserPrompt(input.targetPosition) },
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
      inputMode,
    };

    if (message.stop_reason === "refusal") {
      return {
        status: "failed",
        message:
          "Não conseguimos processar este documento. Confira se enviou o edital " +
          "certo e tente de novo.",
        operatorDetail: `stop_reason=refusal ${JSON.stringify(message.stop_details)}`,
        cause: message.stop_details,
      };
    }

    const parsed = extractStructuredOutput(message);
    if (parsed === null) {
      return {
        status: "failed",
        message:
          "A leitura terminou, mas o resultado veio incompleto. Tente de novo em " +
          "alguns minutos.",
        operatorDetail: `sem parsed_output · stop_reason=${message.stop_reason}`,
        cause: message.stop_reason,
      };
    }

    const result = editalExtractionSchema.safeParse(parsed);
    if (!result.success) {
      return {
        status: "failed",
        message:
          "A leitura terminou, mas o resultado veio num formato que não " +
          "conseguimos aproveitar. Já registramos o caso — tente de novo em " +
          "alguns minutos.",
        operatorDetail: `schema: ${JSON.stringify(result.error.issues).slice(0, 800)}`,
        cause: result.error.issues,
      };
    }

    // Corta os textos para as larguras do banco. O schema aceita mais do que a
    // coluna guarda, de propósito — ver a nota em `clipExtraction`.
    const data = clipExtraction(result.data);

    if (!data.isReadable) {
      const reason = (data.unreadableReason ?? "unknown") as UnreadableReason;
      return {
        status: "unreadable",
        reason,
        message: messageForUnreadable(reason),
        usage,
      };
    }

    // O modelo disse que leu, mas não devolveu assunto nenhum. Tratar como
    // sucesso vazio faria o aluno ver uma tela em branco sem explicação.
    const topicCount = countTopics(data);
    if (topicCount === 0) {
      return {
        status: "unreadable",
        reason: "no_program_section",
        message: messageForUnreadable("no_program_section"),
        usage,
      };
    }

    return { status: "succeeded", data, usage };
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      const failure = describeApiError(error);
      return {
        status: "failed",
        message: failure.student,
        operatorDetail: failure.operator,
        cause: error,
      };
    }

    /**
     * ⚠️ SAÍDA TRUNCADA — o caso mais provável num edital grande de verdade.
     *
     * Quando a resposta estoura o orçamento de saída, ela é cortada no meio de
     * uma string e o SDK falha ao converter o JSON, ANTES de devolver a
     * mensagem — então não dá para inspecionar `stop_reason`.
     *
     * Descoberto lendo o edital do TJ-RJ (83 páginas, oito cargos): a leitura
     * devolvia "falha inesperada", que não diz nada a ninguém. O aluno
     * reenviaria o mesmo arquivo esperando outro resultado, e cada tentativa
     * custaria de novo.
     *
     * Agora vira `too_large`, cuja mensagem diz o que fazer: mandar só as
     * páginas do conteúdo programático.
     */
    if (isTruncatedOutput(error)) {
      return {
        status: "unreadable",
        reason: "too_large",
        message: messageForUnreadable("too_large"),
        usage: emptyUsage(),
      };
    }

    /**
     * A resposta veio inteira mas não passou na validação.
     *
     * Isso é defeito NOSSO — schema apertado demais para o que os editais
     * reais trazem —, não do arquivo do aluno. A mensagem não pode mandá-lo
     * mexer no PDF, porque não há nada que ele possa fazer. `cause` carrega o
     * detalhe para o log.
     */
    if (error instanceof Error && error.message.includes("structured output")) {
      return {
        status: "failed",
        message:
          "A leitura terminou, mas o resultado veio num formato que não conseguimos " +
          "aproveitar. Já registramos o caso — tente de novo em alguns minutos.",
        cause: error,
      };
    }

    return {
      status: "failed",
      message:
        "Não conseguimos concluir a leitura deste edital agora. Seu arquivo foi " +
        "guardado — tente de novo em alguns minutos.",
      operatorDetail: error instanceof Error ? error.message : String(error),
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

/**
 * Custo em centavos de dólar, pelo preço do modelo em uso.
 *
 * ⚠️ A tabela é fixa no código de propósito: o custo gravado em
 * `edital_extractions` precisa refletir o que foi COBRADO na época, e um preço
 * lido de configuração mudaria o histórico retroativamente.
 */
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

function estimateCostCents(inputTokens: number, outputTokens: number): number {
  // Sem preço conhecido, usa o mais caro: subestimar custo é pior que
  // superestimar, porque some do radar de quem paga a conta.
  const price = PRICE_PER_MTOK[MODEL] ?? { input: 5, output: 25 };
  const dollars =
    (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
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
    inputMode: "pdf",
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

/**
 * A resposta foi CORTADA no meio, ou apenas não passou na validação?
 *
 * ⚠️ A distinção importa e eu já errei nela. A primeira versão tratava qualquer
 * "Failed to parse structured output" como truncamento e mandava o aluno
 * reenviar "só as páginas do conteúdo programático" — quando o problema real
 * era um nome de cargo com mais de 200 caracteres. Conselho errado, com toda a
 * aparência de conselho certo.
 *
 * Truncamento tem assinatura própria: o JSON acaba no meio. Falha de validação
 * tem JSON completo e um campo fora das regras. Só a primeira justifica pedir
 * um arquivo menor.
 */
function isTruncatedOutput(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Unterminated string in JSON") ||
    message.includes("Unexpected end of JSON input") ||
    message.includes("Unexpected end of input")
  );
}

/**
 * Traduz o erro da API em DUAS mensagens: uma para o aluno, outra para quem
 * opera.
 *
 * ⚠️ NASCEU DE UM BUG REAL, ENCONTRADO EM 25/08/2026.
 *
 * Quando os créditos da conta acabaram, a versão anterior repassava o texto da
 * API direto para `error_message` — que é exatamente o campo que a tela do
 * aluno exibe. Na prática, quem subisse um edital leria:
 *
 *   "Your credit balance is too low to access the Anthropic API.
 *    Please go to Plans & Billing to upgrade or purchase credits."
 *
 * Em inglês, sobre a conta de outra pessoa, e sem nenhuma ação possível do lado
 * dele. Três problemas de uma vez: assusta, não ajuda e expõe a situação
 * financeira da operação para o cliente final.
 *
 * A regra agora é: NENHUM texto vindo da API chega ao aluno. Ele recebe uma
 * frase que descreve o que aconteceu do ponto de vista DELE e o que fazer; o
 * detalhe técnico vai para `raw_response`, que é o campo de depuração e só o
 * painel administrativo lê.
 */
type ApiFailure = { student: string; operator: string };

function describeApiError(
  error: InstanceType<typeof Anthropic.APIError>,
): ApiFailure {
  /**
   * Problema de conta — crédito, cota, chave. É problema NOSSO, não do
   * arquivo dele. A mensagem não pode mandá-lo mexer no PDF, porque não há
   * nada que ele possa fazer, e não pode citar cobrança.
   */
  const isBilling =
    error.status === 400 &&
    /credit balance|billing|quota|payment/i.test(error.message);

  if (isBilling || error instanceof Anthropic.AuthenticationError) {
    return {
      student:
        "A leitura automática está temporariamente indisponível. Seu edital foi " +
        "guardado — assim que o serviço voltar, é só tentar de novo. Nada do que " +
        "você enviou se perdeu.",
      operator: `Conta/credencial da API: ${error.message}`,
    };
  }

  if (error instanceof Anthropic.RateLimitError) {
    return {
      student:
        "Estamos com muitos editais na fila neste momento. Tente de novo em " +
        "alguns minutos — seu arquivo já está guardado.",
      operator: `Rate limit: ${error.message}`,
    };
  }

  return {
    student:
      "Não conseguimos concluir a leitura deste edital agora. Seu arquivo foi " +
      "guardado — tente de novo em alguns minutos.",
    operator: `API ${error.status}: ${error.message}`,
  };
}
