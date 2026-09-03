import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * ASSINATURA DO WEBHOOK DO MERCADO PAGO.
 * ============================================================================
 *
 * ⚠️ SEM ISTO, QUALQUER PESSOA COM A URL LIBERA UMA ASSINATURA PREMIUM.
 *
 * O endpoint de webhook é público por natureza: o Mercado Pago precisa alcançá-lo
 * sem sessão. Um POST forjado dizendo "pagamento aprovado" valeria uma
 * assinatura paga de graça, e nada no sistema acusaria — a linha entraria com a
 * mesma aparência de uma legítima.
 *
 * O Mercado Pago manda dois cabeçalhos:
 *
 *   x-signature:  ts=1704908010,v1=618c85345248dd820d5fd456117c2ab2ef8eda45a0282ff693eac24131a5e839
 *   x-request-id: bcf7a652-c8bf-4a49-a86e-e64a5e0a3b91
 *
 * E o manifesto assinado é montado nesta ordem exata, com os pontos e vírgulas
 * finais:
 *
 *   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 *
 * ⚠️ ESTE MÓDULO É PURO, e essa é a razão de ele existir separado.
 *
 * Validação de assinatura é o tipo de código que ninguém testa contra o serviço
 * real: exige um pagamento de verdade para produzir um caso. Puro, ele é testado
 * com vetores fixos, incluindo os casos de ataque.
 */

export type SignatureCheck =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Confere a assinatura de uma notificação.
 *
 * `dataId` é `data.id` da query string da requisição, não do corpo — é assim que
 * o Mercado Pago monta o manifesto, e usar o do corpo faz a conferência falhar
 * em notificações legítimas.
 */
export function verifyWebhookSignature(input: {
  /** O cabeçalho `x-signature` inteiro. */
  signatureHeader: string | null;
  /** O cabeçalho `x-request-id`. */
  requestId: string | null;
  /** `data.id` da query string. */
  dataId: string | null;
  secret: string;
  /** Injetável para o teste; em produção é o relógio. */
  now?: Date;
  /** Quanto tempo uma notificação continua aceitável. */
  toleranceSeconds?: number;
}): SignatureCheck {
  if (!input.secret) return { valid: false, reason: "segredo não configurado" };
  if (!input.signatureHeader) return { valid: false, reason: "sem cabeçalho x-signature" };
  if (!input.dataId) return { valid: false, reason: "sem data.id" };

  const partes = new Map<string, string>();
  for (const pedaco of input.signatureHeader.split(",")) {
    const [chave, ...resto] = pedaco.split("=");
    if (chave && resto.length > 0) partes.set(chave.trim(), resto.join("=").trim());
  }

  const ts = partes.get("ts");
  const v1 = partes.get("v1");

  if (!ts || !v1) return { valid: false, reason: "x-signature sem ts ou v1" };

  /*
    ⚠️ A JANELA DE TEMPO É PARTE DA DEFESA, não um detalhe.

    Sem ela, uma notificação legítima capturada uma vez pode ser reenviada para
    sempre — a assinatura continua válida porque o conteúdo não mudou. Com a
    janela, o ataque de repetição tem alguns minutos de vida em vez de anos.

    A idempotência por `externalEventId` também barra a repetição, e as duas
    juntas cobrem o caso em que alguém varia o id para escapar do índice único.
  */
  const tolerancia = input.toleranceSeconds ?? 300;
  const agora = (input.now ?? new Date()).getTime();
  const carimbo = Number(ts);

  if (!Number.isFinite(carimbo)) return { valid: false, reason: "ts inválido" };

  /* O `ts` do Mercado Pago vem em milissegundos. */
  const idadeSegundos = Math.abs(agora - carimbo) / 1000;
  if (idadeSegundos > tolerancia) {
    return { valid: false, reason: `notificação fora da janela (${Math.round(idadeSegundos)}s)` };
  }

  const manifesto = `id:${input.dataId};request-id:${input.requestId ?? ""};ts:${ts};`;
  const esperado = createHmac("sha256", input.secret).update(manifesto).digest("hex");

  /*
    ⚠️ `timingSafeEqual`, e nunca `===`.

    Comparar strings para no primeiro byte diferente, e o tempo dessa parada
    vaza quantos bytes iniciais estavam certos. Com requisições suficientes dá
    para descobrir a assinatura byte a byte, sem conhecer o segredo.

    Ele exige buffers do mesmo tamanho, então o comprimento é conferido antes —
    esse sim pode vazar sem custo, porque o tamanho de um HMAC-SHA256 é público.
  */
  const a = Buffer.from(esperado, "hex");
  const b = Buffer.from(v1, "hex");

  if (a.length !== b.length || a.length === 0) {
    return { valid: false, reason: "assinatura com tamanho inesperado" };
  }

  return timingSafeEqual(a, b)
    ? { valid: true }
    : { valid: false, reason: "assinatura não confere" };
}
