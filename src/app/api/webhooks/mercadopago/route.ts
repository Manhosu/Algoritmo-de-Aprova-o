import { NextResponse } from "next/server";

import { env } from "@/config/env";
import { verifyWebhookSignature } from "@/modules/billing/webhook-signature";
import { processWebhook } from "@/server/billing/webhook";

/**
 * NOTIFICAÇÕES DO MERCADO PAGO.
 * ============================================================================
 *
 * ⚠️ ESTA ROTA É PÚBLICA POR NECESSIDADE, e é a única do produto que muda
 * assinatura sem sessão. Três camadas a cercam:
 *
 *   1. assinatura HMAC conferida contra `MERCADOPAGO_WEBHOOK_SECRET`;
 *   2. releitura do recurso na API do Mercado Pago com o nosso access token —
 *      o corpo da notificação nunca vira dado gravado;
 *   3. índice único em `payment_webhook_events`, que barra reenvio.
 *
 * ⚠️ RESPONDE 200 QUASE SEMPRE, e isso é deliberado.
 *
 * O Mercado Pago reenvia enquanto não recebe 2xx, com atraso crescente, por
 * dias. Devolver erro para uma notificação que não nos interessa transforma um
 * evento ignorado numa fila de retentativas eterna. Só falha de verdade (o
 * banco fora do ar, a API do Mercado Pago fora do ar) devolve 500, porque aí a
 * retentativa é exatamente o que se quer.
 */

export const dynamic = "force-dynamic";
/* Sem corpo grande e sem processamento longo: o Mercado Pago espera resposta rápida. */
export const maxDuration = 30;

export async function POST(request: Request) {
  const url = new URL(request.url);

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const notificacao = corpo as {
    id?: string | number;
    type?: string;
    action?: string;
    data?: { id?: string | number };
  };

  /*
    `data.id` vem na query string E no corpo. A assinatura é montada com o da
    QUERY — usar o do corpo faz a conferência falhar em notificação legítima.
  */
  const dataIdQuery = url.searchParams.get("data.id");
  const dataId = dataIdQuery ?? (notificacao.data?.id ? String(notificacao.data.id) : null);

  const tipo = notificacao.type ?? url.searchParams.get("type") ?? "";

  if (!dataId || !tipo) {
    return NextResponse.json({ ignorado: "sem data.id ou type" }, { status: 200 });
  }

  const assinatura = verifyWebhookSignature({
    signatureHeader: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    dataId: dataIdQuery,
    secret: env.MERCADOPAGO_WEBHOOK_SECRET ?? "",
  });

  /*
    ⚠️ ASSINATURA INVÁLIDA NÃO DERRUBA O PROCESSAMENTO, e a decisão tem uma
    razão específica.

    A camada 2 é que garante a integridade: tudo o que é gravado vem de uma
    releitura autenticada na API do Mercado Pago. Uma notificação forjada só
    consegue fazer o sistema reler um recurso verdadeiro.

    Recusar aqui bloquearia o produto inteiro enquanto o segredo não estiver
    configurado no painel do Mercado Pago — que é um passo manual da cliente,
    feito DEPOIS de a URL existir. O resultado fica gravado em
    `signature_valid`, então a auditoria enxerga cada notificação que chegou sem
    assinatura conferida.
  */
  if (!assinatura.valid) {
    console.warn(`[mercadopago] assinatura não conferida: ${assinatura.reason}`);
  }

  /*
    O id do evento é o que o índice único usa. O Mercado Pago manda `id` no
    corpo; quando falta, o par tipo+recurso serve — duas notificações do mesmo
    recurso e tipo são, para nós, a mesma coisa.
  */
  const eventId = notificacao.id ? String(notificacao.id) : `${tipo}:${dataId}`;

  try {
    const resultado = await processWebhook({
      eventId,
      eventType: tipo,
      dataId,
      payload: corpo,
      signatureValid: assinatura.valid,
    });

    return NextResponse.json(resultado, { status: 200 });
  } catch (erro) {
    /*
      500 aqui é PEDIDO DE RETENTATIVA, e é o que se quer: chegamos até aqui,
      então a notificação era processável e alguma dependência falhou.
    */
    console.error("[mercadopago] falha ao processar notificação", erro);
    return NextResponse.json({ erro: "falha ao processar" }, { status: 500 });
  }
}

/**
 * O Mercado Pago faz um GET ao salvar a URL no painel, para conferir que ela
 * responde. Sem isto, a configuração da notificação é recusada lá.
 */
export async function GET() {
  return NextResponse.json({ ok: true });
}
