import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { createdAt, primaryId, timestamps } from "./_shared";
import {
  billingPeriodEnum,
  contentAccessLevelEnum,
  contentTypeEnum,
  paymentMethodEnum,
  paymentProviderEnum,
  paymentStatusEnum,
  subscriptionStatusEnum,
} from "./enums";
import { users } from "./identity";

/* ========================================================================== *
 * PLANOS
 * ========================================================================== */

/**
 * Plano de assinatura (README 2.5).
 *
 * Os três planos são LINHAS, não enum e não constante em código: a cliente
 * precisa poder renomear, reprecificar e mexer nas regras pelo painel sem
 * deploy. `code` é a chave estável referenciada pela lógica.
 */
export const plans = pgTable(
  "plans",
  {
    id: primaryId(),
    /** "free" | "intermediate" | "premium" — estável, usada em código. */
    code: varchar({ length: 40 }).notNull(),
    name: varchar({ length: 80 }).notNull(),
    tagline: varchar({ length: 200 }),
    description: text(),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    /** Destaque visual na página de planos. */
    isFeatured: boolean().notNull().default(false),
    ...timestamps,
  },
  (table) => [uniqueIndex("plans_code_unique").on(table.code)],
);

/**
 * Preço de um plano em um período de cobrança.
 *
 * Preço é linha separada e nunca é editado no lugar: para mudar o valor,
 * desativa-se a linha e cria-se outra. Assinatura antiga continua apontando
 * para o preço que foi contratado — que é o que a cobrança recorrente exige.
 */
export const planPrices = pgTable(
  "plan_prices",
  {
    id: primaryId(),
    planId: uuid()
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),

    billingPeriod: billingPeriodEnum().notNull(),
    /** Em centavos. Nunca use float para dinheiro. */
    amountCents: integer().notNull(),
    currency: varchar({ length: 3 }).notNull().default("BRL"),
    /** Só exibição: "50% OFF" no comparativo anual (README 2.5). */
    discountPercent: integer(),

    /** `preapproval_plan_id` do Mercado Pago. */
    externalPlanId: varchar({ length: 120 }),

    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index("plan_prices_plan_idx").on(table.planId, table.billingPeriod, table.isActive),
  ],
);

/**
 * Limites quantitativos do plano.
 *
 * Um-para-um com `plans`, em tabela separada porque é o que o painel edita
 * (README 2.6: "Regras de cada plano de assinatura") e o que a aplicação
 * consulta a cada questão respondida.
 *
 * NULL significa ILIMITADO — não use 0 nem um número mágico grande.
 */
export const planLimits = pgTable(
  "plan_limits",
  {
    planId: uuid()
      .primaryKey()
      .references(() => plans.id, { onDelete: "cascade" }),

    /** Free 10, Intermediário 20, Premium NULL (ilimitado). README 2.5. */
    dailyQuestionLimit: integer(),

    /**
     * Preparações ativas simultâneas.
     * Free 1, Intermediário 1, Premium NULL (ilimitado).
     * É a regra "mais de uma preparação só no Premium" (decisão fechada).
     */
    maxActivePreparations: integer(),

    /** Teto mensal de leituras de edital pela IA — protege o custo da cliente. */
    monthlyEditalUploadLimit: integer(),

    ...timestamps,
  },
);

/**
 * Acesso a material por tipo de conteúdo e plano
 * (Mapas Mentais / Flashcards / Videoaulas / Biblioteca: Limitado, Ampliado,
 * Completo — README 2.5).
 *
 * Uma linha por (plano, tipo de conteúdo). Hoje os quatro tipos andam juntos
 * dentro de um plano, mas modelar separado custa nada agora e evita migration
 * no dia em que a cliente quiser liberar só videoaula no Intermediário.
 */
export const planContentAccess = pgTable(
  "plan_content_access",
  {
    id: primaryId(),
    planId: uuid()
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    contentType: contentTypeEnum().notNull(),
    accessLevel: contentAccessLevelEnum().notNull(),
    /** Teto de itens visíveis quando o nível é "limited". NULL = sem teto. */
    maxItems: integer(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("plan_content_access_unique").on(table.planId, table.contentType),
  ],
);

/* ========================================================================== *
 * ASSINATURA
 * ========================================================================== */

/**
 * Assinatura vigente de um usuário.
 *
 * REGRA CENTRAL: todo usuário tem SEMPRE exatamente uma assinatura ativa,
 * inclusive no Free — criada no cadastro com `provider = "manual"` e sem
 * pagamento. Isso torna "qual é o plano deste aluno?" uma única consulta, sem
 * caso especial, e faz a métrica de upgrade do funil ser a simples transição
 * de uma linha para outra.
 *
 * No Marco 1 a mudança de plano é feita pelo painel (provider "manual"). O
 * checkout do Mercado Pago entra no Marco 2 sem alterar esta tabela.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: primaryId(),
    /**
     * `restrict`, não `cascade`: registro financeiro tem prazo de guarda legal
     * (fiscal) e a LGPD reconhece o cumprimento de obrigação legal como base
     * para retenção. Um cascade acidental destruiria essa evidência. A
     * anonimização mantém a linha e limpa a PII de dentro dela.
     */
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    planId: uuid()
      .notNull()
      .references(() => plans.id),
    planPriceId: uuid().references(() => planPrices.id),

    status: subscriptionStatusEnum().notNull().default("active"),
    provider: paymentProviderEnum().notNull().default("manual"),
    billingPeriod: billingPeriodEnum(),

    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    currentPeriodStart: timestamp({ withTimezone: true }),
    currentPeriodEnd: timestamp({ withTimezone: true }),

    cancelAtPeriodEnd: boolean().notNull().default(false),
    canceledAt: timestamp({ withTimezone: true }),
    cancelReason: text(),
    endedAt: timestamp({ withTimezone: true }),

    /** `preapproval_id` do Mercado Pago. */
    externalSubscriptionId: varchar({ length: 120 }),
    externalCustomerId: varchar({ length: 120 }),

    /** Quando falhou a cobrança e quantas vezes — dispara o fluxo de retentativa. */
    failedPaymentCount: integer().notNull().default(0),
    lastPaymentFailureAt: timestamp({ withTimezone: true }),

    /** Quem trocou o plano na mão, quando `provider = "manual"`. */
    changedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    changeNote: text(),

    ...timestamps,
  },
  (table) => [
    /**
     * Garante no BANCO — não só no código — que ninguém acumula duas
     * assinaturas ativas. Índice parcial: só vale para status "active".
     */
    uniqueIndex("subscriptions_one_active_per_user")
      .on(table.userId)
      .where(sql`${table.status} = 'active'`),
    index("subscriptions_user_idx").on(table.userId, table.status),
    index("subscriptions_plan_idx").on(table.planId, table.status),
    uniqueIndex("subscriptions_external_id_unique").on(table.externalSubscriptionId),
  ],
);

/**
 * Pagamento individual. Uma assinatura recorrente gera vários.
 * `rawPayload` guarda a notificação original — quando a conciliação diverge, é
 * a única fonte de verdade que resta.
 */
export const payments = pgTable(
  "payments",
  {
    id: primaryId(),
    subscriptionId: uuid().references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    /** `restrict` pelo mesmo motivo de `subscriptions.userId`: guarda fiscal. */
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    amountCents: integer().notNull(),
    currency: varchar({ length: 3 }).notNull().default("BRL"),
    status: paymentStatusEnum().notNull().default("pending"),
    method: paymentMethodEnum().notNull().default("other"),
    provider: paymentProviderEnum().notNull().default("mercadopago"),

    externalPaymentId: varchar({ length: 120 }),
    paidAt: timestamp({ withTimezone: true }),
    failureReason: text(),
    rawPayload: jsonb(),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("payments_external_id_unique").on(table.externalPaymentId),
    index("payments_user_idx").on(table.userId, table.createdAt),
    index("payments_subscription_idx").on(table.subscriptionId),
  ],
);

/**
 * Log bruto de webhook do gateway.
 *
 * Existe por um motivo só: IDEMPOTÊNCIA. O Mercado Pago reenvia notificação, e
 * sem o índice único em `externalEventId` a mesma cobrança pode ser processada
 * duas vezes — o que no melhor caso duplica um pagamento no relatório e no pior
 * estende a assinatura duas vezes.
 */
export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    id: primaryId(),
    provider: paymentProviderEnum().notNull().default("mercadopago"),
    externalEventId: varchar({ length: 160 }).notNull(),
    eventType: varchar({ length: 80 }).notNull(),
    payload: jsonb().notNull(),

    receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp({ withTimezone: true }),
    processingError: text(),
    /** Assinatura do payload conferiu? Se não, a notificação é descartada. */
    signatureValid: boolean(),

    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("payment_webhook_events_external_unique").on(
      table.provider,
      table.externalEventId,
    ),
    index("payment_webhook_events_unprocessed_idx").on(table.processedAt),
  ],
);

/* ========================================================================== *
 * RELAÇÕES
 * ========================================================================== */

export const plansRelations = relations(plans, ({ one, many }) => ({
  limits: one(planLimits, {
    fields: [plans.id],
    references: [planLimits.planId],
  }),
  prices: many(planPrices),
  contentAccess: many(planContentAccess),
  subscriptions: many(subscriptions),
}));

export const planPricesRelations = relations(planPrices, ({ one }) => ({
  plan: one(plans, { fields: [planPrices.planId], references: [plans.id] }),
}));

export const planLimitsRelations = relations(planLimits, ({ one }) => ({
  plan: one(plans, { fields: [planLimits.planId], references: [plans.id] }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
  plan: one(plans, { fields: [subscriptions.planId], references: [plans.id] }),
  price: one(planPrices, {
    fields: [subscriptions.planPriceId],
    references: [planPrices.id],
  }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [payments.subscriptionId],
    references: [subscriptions.id],
  }),
  user: one(users, { fields: [payments.userId], references: [users.id] }),
}));
