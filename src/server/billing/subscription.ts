import "server-only";

import { and, eq } from "drizzle-orm";

import { env } from "@/config/env";
import { db } from "@/server/db";
import { planPrices, plans, subscriptions, users } from "@/server/db/schema";

import { createPreapproval, isMercadoPagoConfigured, MercadoPagoError } from "./mercadopago";
import { precoVigente } from "./promotions";
import { sincronizarAssinatura } from "./webhook";

/**
 * ASSINATURA — do clique em "Assinar" até a volta do Mercado Pago.
 * ============================================================================
 *
 * ⚠️ A LINHA DE `subscriptions` NASCE ANTES DO CHECKOUT, com status `pending`.
 *
 * Ela é criada primeiro porque o `external_reference` que vai para o Mercado
 * Pago É o id dela. Criar depois exigiria adivinhar de quem é o pagamento
 * quando o webhook chegasse, casando por e-mail (que o aluno troca) ou por valor
 * e horário (que é chute).
 *
 * O preço disso é linha pendente de gente que desistiu no checkout. É barato:
 * elas não dão acesso a nada e o índice único de assinatura ativa não as vê.
 *
 * DOIS CAMINHOS
 * ----------------------------------------------------------------------------
 * Com `cardTokenId`, o aluno digitou o cartão na nossa tela: a assinatura nasce
 * autorizada e o plano é liberado na hora. Sem ele, o aluno vai ao checkout do
 * Mercado Pago e volta pela `back_url`. Ver a nota em `createPreapproval`.
 */

export type StartCheckoutResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; message: string };

export async function startSubscriptionCheckout(input: {
  userId: string;
  planCode: string;
  billingPeriod: "monthly" | "annual";
  /** Token do cartão gerado pelo formulário da página de planos. */
  cardTokenId?: string;
  /** Para a verificação escolher o dia da promoção. A tela nunca passa. */
  now?: Date;
}): Promise<StartCheckoutResult> {
  if (!isMercadoPagoConfigured()) {
    return {
      ok: false,
      message: "O pagamento ainda não está configurado. Fale com o suporte.",
    };
  }

  const [aluno] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  if (!aluno?.email) {
    return { ok: false, message: "Sua conta precisa de um e-mail para assinar." };
  }

  const [preco] = await db
    .select({
      priceId: planPrices.id,
      amountCents: planPrices.amountCents,
      planId: plans.id,
      planName: plans.name,
      planCode: plans.code,
    })
    .from(planPrices)
    .innerJoin(plans, eq(plans.id, planPrices.planId))
    .where(
      and(
        eq(plans.code, input.planCode),
        eq(planPrices.billingPeriod, input.billingPeriod),
        eq(planPrices.isActive, true),
        eq(plans.isActive, true),
      ),
    )
    .limit(1);

  if (!preco) return { ok: false, message: "Este plano não está disponível." };

  /*
    ⚠️ O PREÇO VEM DO BANCO, e o formulário só diz QUAL plano.

    Se o valor viajasse pelo formulário, qualquer pessoa com o inspetor aberto
    assinaria o Premium por um centavo. O cliente escolhe o item; o servidor
    decide quanto custa.
  */

  const [jaAtiva] = await db
    .select({ id: subscriptions.id, planId: subscriptions.planId })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, input.userId), eq(subscriptions.status, "active")))
    .limit(1);

  if (jaAtiva?.planId === preco.planId) {
    return { ok: false, message: "Você já está neste plano." };
  }

  /*
    ⚠️ O VALOR QUE VAI PARA O MERCADO PAGO É O VIGENTE HOJE: o promocional
    durante uma promoção, o normal fora dela. Ele fica gravado na assinatura de
    lá e é o que ela cobra enquanto existir — ver `modules/billing/promotions`.
  */
  const vigente = await precoVigente(preco.planId, input.billingPeriod, input.now ?? new Date());
  const valorCents = vigente?.amountCents ?? preco.amountCents;

  /*
    A assinatura anterior NÃO é cancelada aqui. Ela só cai quando a nova for
    confirmada — cancelar antes deixaria o aluno sem acesso nenhum caso ele
    desistisse no checkout, e o índice único de assinatura ativa impede que as
    duas coexistam depois.
  */
  const [pendente] = await db
    .insert(subscriptions)
    .values({
      userId: input.userId,
      planId: preco.planId,
      planPriceId: preco.priceId,
      status: "pending",
      provider: "mercadopago",
      billingPeriod: input.billingPeriod,
      promotionId: vigente?.promotionId ?? null,
    })
    .returning({ id: subscriptions.id });

  const retorno = `/planos/retorno?assinatura=${pendente.id}`;

  try {
    const assinatura = await createPreapproval({
      externalReference: pendente.id,
      payerEmail: aluno.email,
      reason: `${preco.planName} — O Algoritmo da Aprovação`,
      amountCents: valorCents,
      billingPeriod: input.billingPeriod,
      backUrl: `${env.APP_URL}${retorno}`,
      /*
        A chave é o id da NOSSA linha. Dois cliques no botão criam duas linhas e
        duas chaves, então isto protege só a retentativa da mesma requisição —
        que é o caso que o Mercado Pago cobra em dobro.
      */
      idempotencyKey: pendente.id,
      cardTokenId: input.cardTokenId,
    });

    await db
      .update(subscriptions)
      .set({ externalSubscriptionId: assinatura.id, updatedAt: new Date() })
      .where(eq(subscriptions.id, pendente.id));

    if (input.cardTokenId) {
      /*
        O cartão passou e a assinatura já nasceu autorizada. O plano é liberado
        agora, pelo mesmo caminho do webhook — o estado é relido da API, não
        presumido. O aluno vai direto à tela de "Pronto!".
      */
      if (assinatura.status === "authorized") {
        await sincronizarAssinatura(assinatura.id);
      }

      return { ok: true, checkoutUrl: retorno };
    }

    return { ok: true, checkoutUrl: assinatura.init_point };
  } catch (erro) {
    /*
      ⚠️ A LINHA PENDENTE É REMOVIDA quando o Mercado Pago recusa.

      Sem isto, cada tentativa falha deixaria um rascunho para sempre, e o
      relatório financeiro passaria a contar assinaturas que nunca existiram.
      Como ela ainda não tem pagamento nem id externo, apagar é seguro — não há
      registro fiscal a preservar.
    */
    await db.delete(subscriptions).where(eq(subscriptions.id, pendente.id));

    console.error("[mercadopago] falha ao criar assinatura", erro);

    return { ok: false, message: traduzirRecusa(erro, Boolean(input.cardTokenId)) };
  }
}

/**
 * A recusa do Mercado Pago, na língua de quem está tentando pagar.
 *
 * A mensagem crua dele ("CC_VAL_433 Credit card validation has failed") vai
 * para o log; para o aluno vai o que ele pode fazer a seguir.
 */
function traduzirRecusa(erro: unknown, comCartao: boolean): string {
  const texto = erro instanceof MercadoPagoError ? erro.message : "";

  /*
    ⚠️ O ERRO DO AMBIENTE DE TESTE MERECE A PRÓPRIA MENSAGEM.

    Com credenciais de teste, o Mercado Pago recusa qualquer pagador que não
    seja um usuário de teste. A mensagem genérica mandaria a pessoa repetir para
    sempre uma ação que nunca vai funcionar.
  */
  if (/must be real or test users|guest_site_mismatch/i.test(texto)) {
    return (
      "O pagamento está em modo de teste, e nele só uma conta de teste do " +
      "Mercado Pago consegue assinar. Com as credenciais de produção, " +
      "qualquer conta funciona."
    );
  }

  /*
    O vendedor não pode assinar o próprio plano. Aconteceu com a cliente em
    09/09/2026, logada na conta que recebe; pelo cartão, o que conta é o e-mail
    da conta do site, que vira o `payer_email`.
  */
  if (/collector/i.test(texto)) {
    return (
      "O e-mail desta conta é o mesmo da conta do Mercado Pago que recebe os " +
      "pagamentos, e ela não pode assinar o próprio plano. Teste com uma conta " +
      "de outro e-mail."
    );
  }

  /*
    ⚠️ CARTÃO QUE NÃO ACEITA RECORRÊNCIA, e não "cartão recusado".

    Débito e boa parte dos pré-pagos não aceitam cobrança automática. O Mercado
    Pago devolve "Unsupported_credit_card_for_recurring_payment" — apareceu no
    primeiro teste do cartão digitado na página. Dizer só "não foi aceito"
    mandaria a pessoa redigitar o mesmo cartão para sempre.
  */
  if (/unsupported_credit_card_for_recurring/i.test(texto)) {
    return (
      "Este cartão não aceita cobrança recorrente — cartões de débito e alguns " +
      "pré-pagos não aceitam. Use um cartão de crédito. Nada foi cobrado."
    );
  }

  if (comCartao) {
    return (
      "O cartão não foi aceito. Confira número, validade, código e CPF, ou use " +
      "outro cartão. Nada foi cobrado."
    );
  }

  return "Não consegui abrir o pagamento agora. Tente de novo em alguns minutos.";
}
