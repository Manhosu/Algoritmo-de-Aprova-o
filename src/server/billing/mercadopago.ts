import "server-only";

import { env } from "@/config/env";

/**
 * CLIENTE DO MERCADO PAGO (README 2.5, item 14 do aceite).
 * ============================================================================
 *
 * ⚠️ ASSINATURA RECORRENTE (`preapproval`), não pagamento avulso.
 *
 * O produto é mensalidade. Com `preference` (pagamento único) a renovação viraria
 * um lembrete por e-mail e um novo checkout todo mês, e a taxa de renovação de
 * um produto de estudo despenca quando exige ação. O `preapproval` autoriza a
 * cobrança recorrente uma vez.
 *
 * ⚠️ NADA AQUI CONFIA NO QUE O WEBHOOK MANDA.
 *
 * O corpo da notificação é usado só como SINAL de que algo mudou. O estado real
 * é buscado de volta na API com o nosso access token — `getPreapproval` e
 * `getPayment` existem para isso. Uma notificação forjada, no pior caso, faz o
 * sistema reler um recurso verdadeiro; ela nunca escreve valor nenhum.
 */

const API = "https://api.mercadopago.com";

export class MercadoPagoError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "MercadoPagoError";
  }
}

export function isMercadoPagoConfigured(): boolean {
  return Boolean(env.MERCADOPAGO_ACCESS_TOKEN);
}

async function chamar<T>(
  caminho: string,
  init?: RequestInit & { idempotencyKey?: string },
): Promise<T> {
  const token = env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new MercadoPagoError("MERCADOPAGO_ACCESS_TOKEN não configurado", 0, null);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) ?? {}),
  };

  /*
    ⚠️ CHAVE DE IDEMPOTÊNCIA em toda criação.

    Um clique duplo em "Assinar", ou uma retentativa de rede, criaria duas
    assinaturas para a mesma pessoa. O Mercado Pago devolve a primeira quando a
    chave repete, em vez de cobrar de novo.
  */
  if (init?.idempotencyKey) headers["X-Idempotency-Key"] = init.idempotencyKey;

  const resposta = await fetch(`${API}${caminho}`, {
    ...init,
    headers,
    /* Dado financeiro nunca sai de cache. */
    cache: "no-store",
  });

  const texto = await resposta.text();
  const corpo = texto ? safeJson(texto) : null;

  if (!resposta.ok) {
    /*
      A mensagem do Mercado Pago entra no erro porque ela é específica ("payer
      cannot be the collector", "invalid transaction_amount") e sem ela a
      depuração vira adivinhação. Ela NÃO chega ao aluno: quem chama traduz.
    */
    const detalhe =
      typeof corpo === "object" && corpo !== null && "message" in corpo
        ? String((corpo as { message: unknown }).message)
        : resposta.statusText;

    throw new MercadoPagoError(detalhe, resposta.status, corpo);
  }

  return corpo as T;
}

function safeJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

/* ========================================================================== *
 * ASSINATURA
 * ========================================================================== */

export type PreapprovalStatus = "pending" | "authorized" | "paused" | "cancelled";

export type Preapproval = {
  id: string;
  status: PreapprovalStatus;
  init_point: string;
  external_reference: string | null;
  payer_id: number | null;
  next_payment_date: string | null;
  auto_recurring: {
    frequency: number;
    frequency_type: "months" | "days";
    transaction_amount: number;
    currency_id: string;
  } | null;
};

/**
 * Cria a assinatura e devolve o endereço para onde mandar o aluno.
 *
 * ⚠️ `external_reference` CARREGA A NOSSA CHAVE, e é o que amarra os dois lados.
 *
 * O webhook chega dizendo só o id do Mercado Pago. Sem uma referência nossa
 * dentro da assinatura, descobrir de quem é o pagamento exigiria casar por
 * e-mail — que o aluno pode trocar — ou por valor e horário, que é adivinhação.
 */
export async function createPreapproval(input: {
  /** Nossa chave: o id da linha em `subscriptions`. */
  externalReference: string;
  payerEmail: string;
  /** O que aparece na fatura do cartão. */
  reason: string;
  amountCents: number;
  billingPeriod: "monthly" | "annual";
  backUrl: string;
  idempotencyKey: string;
}): Promise<Preapproval> {
  return chamar<Preapproval>("/preapproval", {
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    body: JSON.stringify({
      reason: input.reason,
      external_reference: input.externalReference,
      payer_email: input.payerEmail,
      back_url: input.backUrl,
      /*
        `authorized` faria o Mercado Pago tentar cobrar na hora, o que exige o
        cartão já autorizado. `pending` abre o checkout para o aluno escolher a
        forma de pagamento — que é o fluxo que a tela oferece.
      */
      status: "pending",
      auto_recurring: {
        /*
          ⚠️ ANUAL É 12 MESES, e não `frequency_type: "years"`.

          O Mercado Pago aceita só `days` e `months`. "years" é recusado com
          "invalid frequency_type", e o erro só apareceria no primeiro aluno que
          escolhesse o plano anual — o de maior valor.
        */
        frequency: input.billingPeriod === "annual" ? 12 : 1,
        frequency_type: "months",
        /*
          O Mercado Pago trabalha em REAIS com decimal; nós guardamos centavos
          inteiros. A conversão acontece só aqui, na fronteira — dinheiro em
          float dentro do sistema é como o centavo some.
        */
        transaction_amount: input.amountCents / 100,
        currency_id: "BRL",
      },
    }),
  });
}

export async function getPreapproval(id: string): Promise<Preapproval> {
  return chamar<Preapproval>(`/preapproval/${encodeURIComponent(id)}`);
}

/** Cancela no Mercado Pago. A nossa linha é atualizada por quem chama. */
export async function cancelPreapproval(id: string): Promise<Preapproval> {
  return chamar<Preapproval>(`/preapproval/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ status: "cancelled" }),
  });
}

/* ========================================================================== *
 * PAGAMENTO
 * ========================================================================== */

export type Payment = {
  id: number;
  status: "pending" | "approved" | "authorized" | "in_process" | "rejected" | "refunded" | "cancelled" | "charged_back";
  status_detail: string | null;
  transaction_amount: number;
  currency_id: string;
  date_approved: string | null;
  external_reference: string | null;
  payment_method_id: string | null;
  payment_type_id: string | null;
  metadata: Record<string, unknown> | null;
};

export async function getPayment(id: string | number): Promise<Payment> {
  return chamar<Payment>(`/v1/payments/${encodeURIComponent(String(id))}`);
}

/** Pagamento de uma assinatura recorrente. */
export type AuthorizedPayment = {
  id: number;
  preapproval_id: string;
  status: string;
  payment: { id: number; status: string } | null;
  transaction_amount: number;
};

export async function getAuthorizedPayment(id: string | number): Promise<AuthorizedPayment> {
  return chamar<AuthorizedPayment>(
    `/authorized_payments/${encodeURIComponent(String(id))}`,
  );
}

/* ========================================================================== *
 * TRADUÇÃO PARA O NOSSO VOCABULÁRIO
 * ========================================================================== */

/**
 * ⚠️ MAPA EXPLÍCITO, sem `default` silencioso.
 *
 * Um status desconhecido do Mercado Pago não pode virar "aprovado" por descuido
 * nem "falhou" por precaução — os dois estão errados. Ele vira `pending`, que é
 * o único estado que não concede acesso nem encerra a assinatura, e quem chama
 * registra o valor cru para investigação.
 */
export function toPaymentStatus(
  mp: Payment["status"],
): "pending" | "approved" | "rejected" | "refunded" | "charged_back" | "canceled" {
  switch (mp) {
    case "approved":
    case "authorized":
      return "approved";
    case "rejected":
      /*
        O nosso enum diz `rejected`, igual ao do Mercado Pago. Escrevi
        "declined" na primeira versão e o typecheck pegou — em runtime seria o
        Postgres recusando o insert do primeiro pagamento negado, na frente de
        um aluno tentando pagar.
      */
      return "rejected";
    case "refunded":
      return "refunded";
    case "charged_back":
      return "charged_back";
    case "cancelled":
      return "canceled";
    case "pending":
    case "in_process":
      return "pending";
  }
}

/** `payment_type_id` do Mercado Pago para o nosso enum. */
export function toPaymentMethod(
  tipo: string | null,
): "pix" | "credit_card" | "boleto" | "other" {
  switch (tipo) {
    case "credit_card":
    case "debit_card":
      return "credit_card";
    case "bank_transfer":
      /* Pix chega como `bank_transfer` com `payment_method_id: "pix"`. */
      return "pix";
    case "ticket":
      return "boleto";
    default:
      return "other";
  }
}
