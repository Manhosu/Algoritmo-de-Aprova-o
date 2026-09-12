import "server-only";

import { and, eq, ne } from "drizzle-orm";

import { db } from "@/server/db";
import { payments, paymentWebhookEvents, subscriptions } from "@/server/db/schema";

import {
  getAuthorizedPayment,
  getPayment,
  getPreapproval,
  toPaymentMethod,
  toPaymentStatus,
} from "./mercadopago";

/**
 * PROCESSAMENTO DA NOTIFICAÇÃO DO MERCADO PAGO.
 * ============================================================================
 *
 * ⚠️ O CORPO DA NOTIFICAÇÃO É SINAL, NUNCA DADO.
 *
 * Dele sai só o tipo e o id. O estado — aprovado, recusado, valor, data — é
 * buscado de volta na API com o nosso access token. Uma notificação forjada, no
 * pior caso, faz o sistema reler um recurso verdadeiro; ela não consegue
 * escrever "aprovado" em lugar nenhum.
 *
 * É por isso que este arquivo funciona mesmo antes de a cliente configurar o
 * segredo de assinatura no painel do Mercado Pago. A assinatura é a primeira
 * porta; esta releitura é a segunda, e é a que sustenta a garantia.
 *
 * ⚠️ E É IDEMPOTENTE POR CONSTRUÇÃO.
 *
 * O Mercado Pago reenvia notificação quando não recebe 200 rápido, e reenvia de
 * novo depois. O índice único de `payment_webhook_events` recusa o duplicado
 * antes de qualquer escrita, e o de `payments.externalPaymentId` recusa o
 * pagamento repetido mesmo se o evento vier com id novo.
 */

export type WebhookResult =
  | { handled: true; detail: string }
  | { handled: false; reason: string };

export async function processWebhook(input: {
  eventId: string;
  eventType: string;
  dataId: string;
  payload: unknown;
  signatureValid: boolean | null;
}): Promise<WebhookResult> {
  /*
    ⚠️ O REGISTRO VEM PRIMEIRO, e o conflito é a trava de idempotência.

    Gravar depois de processar deixaria a janela em que duas notificações
    simultâneas passam as duas pela checagem e estendem a assinatura duas vezes.
    Aqui a segunda esbarra no índice único e sai antes de tocar em dinheiro.
  */
  const [evento] = await db
    .insert(paymentWebhookEvents)
    .values({
      provider: "mercadopago",
      externalEventId: input.eventId,
      eventType: input.eventType,
      payload: input.payload as object,
      signatureValid: input.signatureValid,
    })
    .onConflictDoNothing({
      target: [paymentWebhookEvents.provider, paymentWebhookEvents.externalEventId],
    })
    .returning({ id: paymentWebhookEvents.id });

  if (!evento) return { handled: false, reason: "notificação já processada" };

  try {
    const resultado = await despachar(input.eventType, input.dataId);

    await db
      .update(paymentWebhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(paymentWebhookEvents.id, evento.id));

    return resultado;
  } catch (erro) {
    /*
      O erro fica gravado NA LINHA do evento, com o payload ao lado. Sem isso, a
      investigação de "por que o aluno pagou e não liberou" começaria sem nada:
      o log da Vercel expira, e o Mercado Pago não guarda o que ele nos mandou.
    */
    await db
      .update(paymentWebhookEvents)
      .set({ processingError: erro instanceof Error ? erro.message : String(erro) })
      .where(eq(paymentWebhookEvents.id, evento.id));

    throw erro;
  }
}

async function despachar(tipo: string, dataId: string): Promise<WebhookResult> {
  switch (tipo) {
    case "subscription_preapproval":
      return aplicarAssinatura(dataId);

    case "subscription_authorized_payment": {
      /*
        Cobrança de uma assinatura recorrente. O recurso traz o id do pagamento
        de verdade dentro dele, e é esse que interessa.
      */
      const autorizado = await getAuthorizedPayment(dataId);
      if (!autorizado.payment?.id) {
        return { handled: false, reason: "cobrança ainda sem pagamento" };
      }
      return aplicarPagamento(String(autorizado.payment.id), autorizado.preapproval_id);
    }

    case "payment":
      return aplicarPagamento(dataId, null);

    default:
      /*
        O Mercado Pago manda vários tipos que não nos dizem respeito
        (`plan`, `invoice`, `point_integration_wh`). Ignorar é o certo, e
        devolver 200 evita que ele fique reenviando para sempre.
      */
      return { handled: false, reason: `tipo ignorado: ${tipo}` };
  }
}

/** O aluno autorizou, pausou ou cancelou a assinatura. */
async function aplicarAssinatura(preapprovalId: string): Promise<WebhookResult> {
  const remota = await getPreapproval(preapprovalId);

  const nossa = await acharAssinatura(preapprovalId, remota.external_reference);
  if (!nossa) return { handled: false, reason: "assinatura desconhecida" };

  if (remota.status === "authorized") {
    await ativar(nossa.id, nossa.userId, preapprovalId);
    return { handled: true, detail: `assinatura ${nossa.id} ativa` };
  }

  if (remota.status === "cancelled" || remota.status === "paused") {
    /*
      ⚠️ CANCELADA PELO ALUNO, COM PERÍODO PAGO PELA FRENTE: não derruba agora.

      O botão "Cancelar assinatura" do perfil cancela no Mercado Pago, e o
      Mercado Pago avisa por aqui. Derrubar para o Free neste instante tiraria
      do aluno o mês que ele já pagou. Quem encerra, no fim do período, é
      `encerrarAssinaturaVencida`.
    */
    if (
      remota.status === "cancelled" &&
      nossa.cancelAtPeriodEnd &&
      nossa.currentPeriodEnd &&
      nossa.currentPeriodEnd.getTime() > Date.now()
    ) {
      return {
        handled: true,
        detail: `assinatura ${nossa.id} segue ativa até ${nossa.currentPeriodEnd.toISOString().slice(0, 10)}`,
      };
    }

    await db
      .update(subscriptions)
      .set({
        status: "canceled",
        canceledAt: new Date(),
        cancelReason: `Mercado Pago: ${remota.status}`,
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, nossa.id));

    /*
      ⚠️ QUEM PERDE O PREMIUM VOLTA PARA O FREE, e não fica sem plano.

      Sem assinatura ativa, `getContentAccess` não acha linha nenhuma e LIBERA
      tudo — ver a nota em `billing/content-access`. Cancelar sem devolver ao
      Free daria acesso completo de graça a quem acabou de cancelar.
    */
    await voltarParaFree(nossa.userId);

    return { handled: true, detail: `assinatura ${nossa.id} cancelada` };
  }

  return { handled: false, reason: `status ${remota.status} não exige ação` };
}

/** Uma cobrança individual mudou de estado. */
async function aplicarPagamento(
  paymentId: string,
  preapprovalId: string | null,
): Promise<WebhookResult> {
  const pago = await getPayment(paymentId);

  const referencia = preapprovalId ?? pago.external_reference;
  const nossa = referencia ? await acharAssinatura(preapprovalId, pago.external_reference) : null;

  const status = toPaymentStatus(pago.status);

  /*
    ⚠️ SEM ASSINATURA CONHECIDA, O PAGAMENTO NÃO É GRAVADO.

    `payments.userId` é obrigatório e é um UUID: não existe valor de
    preenchimento honesto. Uma string vazia estouraria a coluna, e um usuário
    inventado atribuiria dinheiro a quem não pagou.

    O payload inteiro já está guardado em `payment_webhook_events` pela função
    que chamou esta, com o erro ao lado. É de lá que sai a conciliação manual —
    o caso acontece quando alguém paga por um link antigo, ou quando a linha
    pendente foi apagada antes de o webhook chegar.
  */
  if (!nossa) {
    return { handled: false, reason: `pagamento ${pago.id} sem assinatura conhecida` };
  }

  await db
    .insert(payments)
    .values({
      subscriptionId: nossa.id,
      userId: nossa.userId,
      amountCents: Math.round(pago.transaction_amount * 100),
      currency: pago.currency_id || "BRL",
      status,
      method: toPaymentMethod(pago.payment_type_id),
      provider: "mercadopago",
      externalPaymentId: String(pago.id),
      paidAt: pago.date_approved ? new Date(pago.date_approved) : null,
      failureReason: status === "rejected" ? pago.status_detail : null,
      rawPayload: pago as unknown as object,
    })
    .onConflictDoUpdate({
      target: payments.externalPaymentId,
      /*
        Um pagamento muda de estado ao longo da vida: pendente, aprovado,
        estornado. A linha é a MESMA e é atualizada; inserir de novo faria o
        relatório contar a mesma cobrança três vezes.
      */
      set: {
        status,
        paidAt: pago.date_approved ? new Date(pago.date_approved) : null,
        failureReason: status === "rejected" ? pago.status_detail : null,
        rawPayload: pago as unknown as object,
        updatedAt: new Date(),
      },
    });

  if (status === "approved") {
    await ativar(nossa.id, nossa.userId, nossa.externalSubscriptionId);
    return { handled: true, detail: `pagamento ${pago.id} aprovado` };
  }

  if (status === "rejected") {
    /*
      Recusa NÃO cancela na hora. O Mercado Pago retenta, e derrubar o acesso na
      primeira falha tiraria o aluno do ar por um cartão que passa na segunda
      tentativa. `past_due` marca o problema sem fechar a porta.
    */
    await db
      .update(subscriptions)
      .set({
        status: "past_due",
        failedPaymentCount: nossa.failedPaymentCount + 1,
        lastPaymentFailureAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, nossa.id));

    return { handled: true, detail: `pagamento ${pago.id} recusado` };
  }

  if (status === "refunded" || status === "charged_back") {
    await db
      .update(subscriptions)
      .set({
        status: "canceled",
        canceledAt: new Date(),
        cancelReason: `Pagamento ${status}`,
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, nossa.id));

    await voltarParaFree(nossa.userId);

    return { handled: true, detail: `pagamento ${pago.id} ${status}` };
  }

  return { handled: true, detail: `pagamento ${pago.id} em ${status}` };
}

type AssinaturaNossa = {
  id: string;
  userId: string;
  billingPeriod: "monthly" | "annual" | null;
  externalSubscriptionId: string | null;
  failedPaymentCount: number;
  /** O aluno cancelou pelo perfil: o acesso vai até `currentPeriodEnd`. */
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
};

/**
 * Acha a nossa assinatura por qualquer um dos dois caminhos.
 *
 * O `external_reference` é o nosso id e é o caminho preferido. O id do Mercado
 * Pago serve para as notificações que não carregam a referência — pagamento
 * recorrente, por exemplo, que vem amarrado só ao `preapproval_id`.
 */
async function acharAssinatura(
  preapprovalId: string | null,
  externalReference: string | null,
): Promise<AssinaturaNossa | null> {
  const colunas = {
    id: subscriptions.id,
    userId: subscriptions.userId,
    billingPeriod: subscriptions.billingPeriod,
    externalSubscriptionId: subscriptions.externalSubscriptionId,
    failedPaymentCount: subscriptions.failedPaymentCount,
    cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
    currentPeriodEnd: subscriptions.currentPeriodEnd,
  };

  if (externalReference) {
    const [porReferencia] = await db
      .select(colunas)
      .from(subscriptions)
      .where(eq(subscriptions.id, externalReference))
      .limit(1);

    if (porReferencia) return porReferencia;
  }

  if (preapprovalId) {
    const [porExterno] = await db
      .select(colunas)
      .from(subscriptions)
      .where(eq(subscriptions.externalSubscriptionId, preapprovalId))
      .limit(1);

    if (porExterno) return porExterno;
  }

  return null;
}

/**
 * Ativa a assinatura e derruba a anterior.
 *
 * ⚠️ AS DUAS COISAS NUMA TRANSAÇÃO, por causa do índice único.
 *
 * `subscriptions_one_active_per_user` é um índice parcial que impede duas linhas
 * ativas para o mesmo aluno. Ativar antes de encerrar a anterior estoura o
 * índice; encerrar antes de ativar deixa o aluno sem plano no meio. A transação
 * faz as duas ou nenhuma, e o encerramento vem primeiro.
 */
async function ativar(
  subscriptionId: string,
  userId: string,
  preapprovalId: string | null,
): Promise<void> {
  const agora = new Date();

  const [linha] = await db
    .select({ billingPeriod: subscriptions.billingPeriod })
    .from(subscriptions)
    .where(eq(subscriptions.id, subscriptionId))
    .limit(1);

  const dias = linha?.billingPeriod === "annual" ? 365 : 30;

  /*
    `addDays` do projeto trabalha em data civil (string "AAAA-MM-DD") e a coluna
    é `timestamptz`. Somar em milissegundos aqui é o certo: o fim do período é um
    instante, não um dia do calendário — a renovação acontece na hora exata em
    que a anterior venceu.
  */
  const fim = new Date(agora.getTime() + dias * 24 * 60 * 60 * 1000);

  await db.transaction(async (tx) => {
    await tx
      .update(subscriptions)
      .set({ status: "canceled", endedAt: agora, updatedAt: agora })
      .where(
        and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, "active"),
          ne(subscriptions.id, subscriptionId),
        ),
      );

    await tx
      .update(subscriptions)
      .set({
        status: "active",
        currentPeriodStart: agora,
        currentPeriodEnd: fim,
        externalSubscriptionId: preapprovalId,
        failedPaymentCount: 0,
        lastPaymentFailureAt: null,
        canceledAt: null,
        endedAt: null,
        updatedAt: agora,
      })
      .where(eq(subscriptions.id, subscriptionId));
  });
}

/** Devolve o aluno ao Free. Ver a nota em `aplicarAssinatura`. */
export async function voltarParaFree(userId: string): Promise<void> {
  const free = await db.query.plans.findFirst({
    where: (t, { eq: e }) => e(t.code, "free"),
    columns: { id: true },
  });

  if (!free) {
    console.error("[mercadopago] plano free não encontrado — aluno ficou sem plano", userId);
    return;
  }

  const agora = new Date();

  await db
    .insert(subscriptions)
    .values({
      userId,
      planId: free.id,
      status: "active",
      provider: "manual",
      changeNote: "Retorno automático ao Free após cancelamento no Mercado Pago.",
      startedAt: agora,
    })
    /*
      O aluno pode já ter uma linha Free ativa de antes. O índice único recusa a
      segunda, e não fazer nada é o comportamento certo: ele já está onde
      deveria estar.
    */
    .onConflictDoNothing();
}

/**
 * Aplica o estado atual de uma assinatura, lido da API do Mercado Pago.
 *
 * É o mesmo caminho do webhook, exposto para quem acabou de criar uma
 * assinatura com cartão: ela nasce `authorized`, e o aluno não deve esperar a
 * notificação chegar para ver o plano liberado. Quando o webhook vier depois,
 * ele reaplica o mesmo estado — e ativar duas vezes dá no mesmo.
 *
 * ⚠️ O ESTADO VEM DA API, nunca de quem chama. É a mesma garantia do webhook.
 */
export async function sincronizarAssinatura(preapprovalId: string): Promise<WebhookResult> {
  return aplicarAssinatura(preapprovalId);
}
