import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
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

import { createdAt, deletedAt, primaryId, timestamps } from "./_shared";
import {
  adminAuditActionEnum,
  consentTypeEnum,
  deletionRequestStatusEnum,
  identityProviderEnum,
  legalDocumentTypeEnum,
  userRoleEnum,
  userStatusEnum,
  verificationTokenTypeEnum,
} from "./enums";

/* ========================================================================== *
 * USERS
 * ========================================================================== */

/**
 * Conta de acesso. Serve tanto ao aluno quanto ao administrador — o que muda é
 * `role` (README 1.1: separação clara entre perfil aluno e administrador).
 *
 * ANONIMIZAÇÃO EM VEZ DE DELETE (decisão 15 do Eduardo)
 * ----------------------------------------------------------------------------
 * Quando o titular exerce o direito de exclusão, esta linha NÃO é apagada.
 * A rotina de anonimização:
 *   1. sobrescreve nome, e-mail, WhatsApp e hash de senha com valores neutros;
 *   2. apaga o conteúdo do titular (preparações, respostas, logs de estudo);
 *   3. marca `anonymizedAt` e muda `status` para "anonymized";
 *   4. preserva `pseudonymKey` para que o funil histórico continue somando.
 *
 * `pseudonymKey` é um HMAC irreversível do id original com um segredo de
 * servidor. Sem o segredo não é possível voltar ao usuário, e mesmo com ele não
 * há PII para recuperar — o que atende à LGPD e mantém o painel honesto.
 */
export const users = pgTable(
  "users",
  {
    id: primaryId(),

    /**
     * PII — anulável APENAS para contas anonimizadas.
     *
     * Os três campos abaixo são obrigatórios no cadastro (README 1.2) e a
     * obrigatoriedade é garantida pelo check `users_identity_required_check`.
     * Eles são anuláveis no tipo porque a anonimização os apaga, e o check
     * `users_anonymized_scrubbed_check` obriga que uma conta anonimizada esteja
     * REALMENTE limpa. Os dois checks juntos tornam a exclusão efetiva uma
     * invariante do banco, não uma promessa da aplicação.
     */
    name: varchar({ length: 160 }),

    /** Sempre normalizado para minúsculas antes de gravar (ver check abaixo). */
    email: varchar({ length: 255 }),
    emailVerifiedAt: timestamp({ withTimezone: true }),

    /**
     * Guardado em E.164 (+5511999999999).
     * Finalidade declarada: contato e suporte. Não há envio no Marco 1.
     */
    whatsapp: varchar({ length: 20 }),

    /** argon2id. Nulo apenas em contas já anonimizadas. */
    passwordHash: text(),
    passwordChangedAt: timestamp({ withTimezone: true }),

    role: userRoleEnum().notNull().default("student"),
    status: userStatusEnum().notNull().default("active"),

    /** Fuso do aluno. O produto assume Brasília, mas o dado fica aberto. */
    timezone: varchar({ length: 64 }).notNull().default("America/Sao_Paulo"),

    avatarUrl: text(),

    /**
     * O aluno aparece com o primeiro nome no Ranking?
     *
     * ⚠️ NASCE LIGADO, e a decisão tem dono: a cliente autorizou a exibição em
     * 03/09/2026, e a Política de Privacidade 1.2 passou a descrever a prática
     * na seção 3.1, antes de qualquer nome ir para a tela.
     *
     * A chave existe porque o direito de oposição (art. 18 da LGPD) não some
     * quando a finalidade está informada. Sem ela, um aluno que não quer o nome
     * exposto teria como única saída apagar a conta.
     *
     * Desligado, a linha dele continua no ranking com posição, XP e sequência.
     * Só o nome vira "Aluno" — esconder a linha inteira mudaria a posição de
     * todo mundo abaixo e faria o ranking mentir sobre quantos alunos existem.
     */
    showNameInRanking: boolean().notNull().default(true),

    /**
     * HMAC-SHA256(ANONYMIZATION_PEPPER, id). Chave pseudônima estável que
     * acompanha os eventos de telemetria.
     *
     * ⚠️ É APAGADA NA ANONIMIZAÇÃO — e essa é a peça central da garantia.
     *
     * Enquanto a conta existe, esta coluna é a ponte entre o usuário e seus
     * eventos. Ao anonimizar, a ponte é DESTRUÍDA: os eventos continuam com a
     * chave, mas nenhuma linha do banco associa aquela chave a uma pessoa.
     * Os eventos permanecem agrupáveis entre si (a coorte continua correta) e
     * deixam de ser religáveis a alguém — que é exatamente o que a LGPD chama
     * de dado anonimizado.
     */
    pseudonymKey: varchar({ length: 64 }),

    /** Última vez que uma requisição autenticada foi vista. */
    lastSeenAt: timestamp({ withTimezone: true }),
    /** Primeiro login efetivo — marco do funil. */
    firstLoginAt: timestamp({ withTimezone: true }),

    anonymizedAt: timestamp({ withTimezone: true }),

    ...timestamps,
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    uniqueIndex("users_pseudonym_key_unique").on(table.pseudonymKey),
    index("users_role_status_idx").on(table.role, table.status),
    index("users_created_at_idx").on(table.createdAt),
    check("users_email_lowercase_check", sql`${table.email} = lower(${table.email})`),
    check(
      "users_whatsapp_e164_check",
      sql`${table.whatsapp} is null or ${table.whatsapp} ~ '^\\+[1-9][0-9]{7,14}$'`,
    ),

    /**
     * Conta viva TEM que ter identidade completa. É a obrigatoriedade do
     * cadastro (nome, e-mail e WhatsApp) escrita no banco.
     */
    check(
      "users_identity_required_check",
      sql`${table.status} = 'anonymized' or (
        ${table.name} is not null
        and ${table.email} is not null
        and ${table.whatsapp} is not null
        and ${table.pseudonymKey} is not null
      )`,
    ),

    /**
     * Conta anonimizada TEM que estar limpa. Este check é a diferença entre
     * "a rotina de exclusão apaga os dados" e "o banco não aceita uma conta
     * anonimizada que ainda tenha dado pessoal". Se a rotina falhar no meio,
     * a transação não fecha.
     */
    check(
      "users_anonymized_scrubbed_check",
      sql`${table.status} <> 'anonymized' or (
        ${table.name} is null
        and ${table.email} is null
        and ${table.whatsapp} is null
        and ${table.passwordHash} is null
        and ${table.avatarUrl} is null
        and ${table.pseudonymKey} is null
        and ${table.anonymizedAt} is not null
      )`,
    ),
  ],
);

/* ========================================================================== *
 * SESSÃO DE AUTENTICAÇÃO
 * ========================================================================== */

/**
 * Sessão de LOGIN. Não confunda com `usageSessions` (permanência na plataforma,
 * que alimenta o card "Horas Estudadas"). São coisas diferentes com ciclos de
 * vida diferentes, por isso são tabelas diferentes.
 *
 * Sessão em banco — e não só um JWT — é o que permite:
 *   • derrubar o acesso na hora em que o titular pede exclusão da conta;
 *   • encerrar todas as sessões ao trocar a senha;
 *   • mostrar ao aluno onde ele está logado.
 *
 * O token nunca é guardado em claro: gravamos o SHA-256 dele. Vazamento do
 * banco não vira sessão válida.
 */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    tokenHash: varchar({ length: 64 }).notNull(),

    expiresAt: timestamp({ withTimezone: true }).notNull(),
    lastUsedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),

    /** Hash do IP — suficiente para detectar anomalia, sem guardar o IP. */
    ipHash: varchar({ length: 64 }),
    userAgent: text(),

    revokedAt: timestamp({ withTimezone: true }),
    revokedReason: varchar({ length: 64 }),

    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("auth_sessions_token_hash_unique").on(table.tokenHash),
    index("auth_sessions_user_idx").on(table.userId),
    index("auth_sessions_expires_idx").on(table.expiresAt),
  ],
);

/**
 * Identidade externa vinculada a uma conta (login com Google).
 *
 * O QUE ESTA TABELA **NÃO** FAZ
 * ----------------------------------------------------------------------------
 * Ela não substitui a sessão. O Google é consultado uma vez, no login; o que
 * vale depois é a sessão em `auth_sessions`, com a nossa expiração e a nossa
 * revogação. É o que mantém a promessa de derrubar o acesso na hora em que o
 * titular pede exclusão da conta.
 *
 * NÃO GUARDAMOS TOKEN DO GOOGLE
 * ----------------------------------------------------------------------------
 * Nem access token, nem refresh token. Não pedimos escopo além de identificação
 * (`openid email profile`), então não há nada a acessar em nome do aluno depois
 * do login — e guardar credencial que não se usa é só passivo em caso de
 * vazamento.
 *
 * VINCULAÇÃO DE CONTA É VETOR DE INVASÃO
 * ----------------------------------------------------------------------------
 * Se alguém se cadastrou com senha usando `x@gmail.com` e depois aparece um
 * login Google com o mesmo endereço, vincular automaticamente permitiria tomar
 * a conta de outra pessoa a partir de um e-mail não confirmado. A regra é:
 * só vincula sozinho quando o Google informa `email_verified = true` E o e-mail
 * da conta existente já está verificado. Fora disso, exige a senha.
 */
export const userIdentities = pgTable(
  "user_identities",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    provider: identityProviderEnum().notNull(),
    /** O `sub` do Google — estável mesmo se o aluno trocar de e-mail lá. */
    providerAccountId: varchar({ length: 255 }).notNull(),

    /** E-mail no provedor. Pode divergir de `users.email` com o tempo. */
    providerEmail: varchar({ length: 255 }),
    providerEmailVerified: boolean().notNull().default(false),
    providerDisplayName: varchar({ length: 200 }),
    providerAvatarUrl: text(),

    linkedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp({ withTimezone: true }),

    ...timestamps,
  },
  (table) => [
    /** Uma conta do Google não pode estar vinculada a dois alunos. */
    uniqueIndex("user_identities_provider_account_unique").on(
      table.provider,
      table.providerAccountId,
    ),
    /** Um aluno tem no máximo uma conta por provedor. */
    uniqueIndex("user_identities_user_provider_unique").on(table.userId, table.provider),
    index("user_identities_email_idx").on(table.providerEmail),
  ],
);

/**
 * Token de uso único para recuperação de senha, verificação de e-mail e troca
 * de e-mail (README 1.2).
 *
 * Também guardamos apenas o hash. `expiresAt` é curto (padrão: 1 hora) e
 * `usedAt` impede reuso — as duas exigências de "token com validade limitada".
 */
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    type: verificationTokenTypeEnum().notNull(),
    tokenHash: varchar({ length: 64 }).notNull(),

    /** Só para `email_change`: o endereço novo, confirmado no destino. */
    newEmail: varchar({ length: 255 }),

    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),

    requestedIpHash: varchar({ length: 64 }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("verification_tokens_hash_unique").on(table.tokenHash),
    index("verification_tokens_user_type_idx").on(table.userId, table.type),
    index("verification_tokens_expires_idx").on(table.expiresAt),
  ],
);

/* ========================================================================== *
 * LGPD
 * ========================================================================== */

/**
 * Versão publicada da Política de Privacidade e dos Termos.
 *
 * Sem versionar o documento, "o usuário consentiu" é uma afirmação sem prova:
 * não dá para dizer COM O QUÊ ele consentiu se o texto mudou depois.
 */
export const legalDocuments = pgTable(
  "legal_documents",
  {
    id: primaryId(),
    type: legalDocumentTypeEnum().notNull(),
    version: varchar({ length: 20 }).notNull(),
    title: varchar({ length: 200 }).notNull(),
    /** Markdown renderizado na página pública. */
    content: text().notNull(),
    /** Resumo das mudanças em relação à versão anterior. */
    changeSummary: text(),
    publishedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    effectiveFrom: timestamp({ withTimezone: true }).notNull().defaultNow(),
    isCurrent: boolean().notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("legal_documents_type_version_unique").on(table.type, table.version),
    index("legal_documents_current_idx").on(table.type, table.isCurrent),
  ],
);

/**
 * Registro de consentimento (README 1.1: consentimento no cadastro, finalidade
 * declarada, direitos do titular).
 *
 * Uma linha por concessão E uma linha por revogação — histórico, não estado.
 * `purpose` guarda a finalidade declarada no momento, em texto, porque é ela
 * que precisa ser provada depois, não a finalidade atual do produto.
 */
export const userConsents = pgTable(
  "user_consents",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    type: consentTypeEnum().notNull(),
    legalDocumentId: uuid().references(() => legalDocuments.id),

    granted: boolean().notNull(),
    purpose: text().notNull(),

    ipHash: varchar({ length: 64 }),
    userAgent: text(),

    grantedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp({ withTimezone: true }),

    createdAt: createdAt(),
  },
  (table) => [
    index("user_consents_user_type_idx").on(table.userId, table.type),
    index("user_consents_granted_at_idx").on(table.grantedAt),
  ],
);

/**
 * Pedido de exclusão de conta e dados (README 1.1).
 *
 * O pedido é registrado, executado e o resultado fica arquivado — é a evidência
 * de que o direito do titular foi atendido, e quando.
 */
export const dataDeletionRequests = pgTable(
  "data_deletion_requests",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    status: deletionRequestStatusEnum().notNull().default("pending"),
    reason: text(),

    requestedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Janela de arrependimento antes da execução. */
    scheduledFor: timestamp({ withTimezone: true }).notNull(),
    executedAt: timestamp({ withTimezone: true }),
    canceledAt: timestamp({ withTimezone: true }),

    /** O que foi removido, para prestação de contas. */
    executionReport: jsonb().$type<{
      deletedTables: Record<string, number>;
      anonymizedTables: Record<string, number>;
    }>(),

    ...timestamps,
  },
  (table) => [
    index("data_deletion_requests_status_idx").on(table.status, table.scheduledFor),
    index("data_deletion_requests_user_idx").on(table.userId),
  ],
);

/**
 * Exportação de dados do titular (direito de portabilidade, LGPD art. 18).
 * Guardamos só o metadado; o arquivo é temporário e expira.
 */
export const dataExportRequests = pgTable(
  "data_export_requests",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: deletionRequestStatusEnum().notNull().default("pending"),
    requestedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp({ withTimezone: true }),
    downloadExpiresAt: timestamp({ withTimezone: true }),
    storagePath: text(),
    ...timestamps,
  },
  (table) => [index("data_export_requests_user_idx").on(table.userId, table.status)],
);

/* ========================================================================== *
 * AUDITORIA ADMINISTRATIVA
 * ========================================================================== */

/**
 * Toda ação de administrador que muda dado de negócio.
 *
 * Isto não é opcional: o painel pode alterar os pesos do motor, os valores de
 * XP e o plano de um aluno. Sem trilha de auditoria, "por que o algoritmo mudou
 * de comportamento na terça?" vira uma pergunta sem resposta.
 */
export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: primaryId(),
    /**
     * Anulável de propósito: se a conta do administrador for removida algum
     * dia, a trilha de auditoria precisa sobreviver a ela.
     */
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Cópia do e-mail no momento da ação, para o log continuar legível. */
    actorEmail: varchar({ length: 255 }),

    action: adminAuditActionEnum().notNull(),
    entityType: varchar({ length: 80 }).notNull(),
    entityId: varchar({ length: 80 }),

    /** Estado antes e depois, para reconstruir o que foi alterado. */
    before: jsonb(),
    after: jsonb(),

    ipHash: varchar({ length: 64 }),
    userAgent: text(),
    createdAt: createdAt(),
  },
  (table) => [
    index("admin_audit_logs_actor_idx").on(table.actorUserId, table.createdAt),
    index("admin_audit_logs_entity_idx").on(table.entityType, table.entityId),
  ],
);

/**
 * Controle de tentativas de login e de pedidos de recuperação de senha.
 * Sem isso, o formulário de login é um oráculo de força bruta.
 */
export const authThrottleCounters = pgTable(
  "auth_throttle_counters",
  {
    id: primaryId(),
    /** e-mail normalizado ou hash de IP, conforme a regra aplicada. */
    subject: varchar({ length: 255 }).notNull(),
    scope: varchar({ length: 40 }).notNull(),
    windowDate: date({ mode: "string" }).notNull(),
    attempts: integer().notNull().default(0),
    lockedUntil: timestamp({ withTimezone: true }),
    lastAttemptAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("auth_throttle_unique").on(table.subject, table.scope, table.windowDate),
    index("auth_throttle_locked_idx").on(table.lockedUntil),
  ],
);

/* ========================================================================== *
 * RELAÇÕES
 * ========================================================================== */

export const usersRelations = relations(users, ({ many }) => ({
  authSessions: many(authSessions),
  identities: many(userIdentities),
  verificationTokens: many(verificationTokens),
  consents: many(userConsents),
  deletionRequests: many(dataDeletionRequests),
}));

export const userIdentitiesRelations = relations(userIdentities, ({ one }) => ({
  user: one(users, { fields: [userIdentities.userId], references: [users.id] }),
}));

export const authSessionsRelations = relations(authSessions, ({ one }) => ({
  user: one(users, { fields: [authSessions.userId], references: [users.id] }),
}));

export const verificationTokensRelations = relations(verificationTokens, ({ one }) => ({
  user: one(users, { fields: [verificationTokens.userId], references: [users.id] }),
}));

export const userConsentsRelations = relations(userConsents, ({ one }) => ({
  user: one(users, { fields: [userConsents.userId], references: [users.id] }),
  legalDocument: one(legalDocuments, {
    fields: [userConsents.legalDocumentId],
    references: [legalDocuments.id],
  }),
}));
