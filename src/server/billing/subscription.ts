import "server-only";

import { and, eq } from "drizzle-orm";

import { env } from "@/config/env";
import { db } from "@/server/db";
import { planPrices, plans, subscriptions, users } from "@/server/db/schema";

import { createPreapproval, isMercadoPagoConfigured, MercadoPagoError } from "./mercadopago";

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
 */

export type StartCheckoutResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; message: string };

export async function startSubscriptionCheckout(input: {
  userId: string;
  planCode: string;
  billingPeriod: "monthly" | "annual";
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
    A assinatura anterior NÃO é cancelada aqui. Ela só cai quando a nova for
    confirmada pelo webhook — cancelar antes deixaria o aluno sem acesso nenhum
    caso ele desistisse no checkout, e o índice único de assinatura ativa impede
    que as duas coexistam depois.
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
    })
    .returning({ id: subscriptions.id });

  try {
    const assinatura = await createPreapproval({
      externalReference: pendente.id,
      payerEmail: aluno.email,
      reason: `${preco.planName} — O Algoritmo da Aprovação`,
      amountCents: preco.amountCents,
      billingPeriod: input.billingPeriod,
      backUrl: `${env.APP_URL}/planos/retorno?assinatura=${pendente.id}`,
      /*
        A chave é o id da NOSSA linha. Dois cliques no botão criam duas linhas e
        duas chaves, então isto protege só a retentativa da mesma requisição —
        que é o caso que o Mercado Pago cobra em dobro.
      */
      idempotencyKey: pendente.id,
    });

    await db
      .update(subscriptions)
      .set({ externalSubscriptionId: assinatura.id, updatedAt: new Date() })
      .where(eq(subscriptions.id, pendente.id));

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

    /*
      ⚠️ O ERRO DO AMBIENTE DE TESTE MERECE A PRÓPRIA MENSAGEM.

      Com credenciais de teste, o Mercado Pago recusa qualquer pagador que não
      seja um usuário de teste: "Both payer and collector must be real or test
      users". Aconteceu na primeira vez que a cliente clicou em Assinar com a
      conta dela.

      A mensagem genérica ("tente de novo em alguns minutos") manda a pessoa
      repetir para sempre uma ação que nunca vai funcionar. Dizer o que é
      transforma um beco sem saída numa instrução — e some sozinha quando as
      credenciais de produção entrarem, porque o erro deixa de acontecer.
    */
    const recusaDeAmbiente =
      erro instanceof MercadoPagoError &&
      /must be real or test users|guest_site_mismatch/i.test(erro.message);

    if (recusaDeAmbiente) {
      return {
        ok: false,
        message:
          "O pagamento está em modo de teste, e nele só uma conta de teste do " +
          "Mercado Pago consegue assinar. Com as credenciais de produção, " +
          "qualquer conta funciona.",
      };
    }

    return {
      ok: false,
      message: "Não consegui abrir o pagamento agora. Tente de novo em alguns minutos.",
    };
  }
}
