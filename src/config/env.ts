import { z } from "zod";

/**
 * Validação das variáveis de ambiente.
 *
 * Falha cedo e com mensagem legível: é melhor a aplicação não subir do que
 * subir e quebrar na primeira consulta ao banco ou no primeiro e-mail enviado.
 *
 * Nunca importe este módulo de um Client Component — ele expõe segredos.
 * Valores públicos ficam em `publicEnv`, abaixo, e usam o prefixo NEXT_PUBLIC_.
 */

const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** PostgreSQL do Supabase. Use a connection string do pooler em produção. */
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),

  /**
   * Conexão direta (porta 5432), sem pooler. Migrations e backup precisam dela
   * porque o pooler em modo transaction não suporta prepared statements nem
   * comandos DDL longos. Cai para DATABASE_URL quando não informada.
   */
  DATABASE_URL_DIRECT: z.string().optional(),

  /**
   * Segredo de assinatura das sessões. Gere com: `openssl rand -base64 32`.
   * Trocar este valor invalida todas as sessões ativas.
   */
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET precisa ter ao menos 32 caracteres"),

  /**
   * Segredo do HMAC que gera a chave pseudônima usada pelas métricas.
   *
   * ⚠️ NUNCA guarde este valor no banco nem em backup do banco — é justamente
   * a separação entre os dois que torna a pseudonimização irreversível para
   * quem tiver só o dump.
   *
   * ⚠️ NUNCA rotacione depois do go-live: a chave é determinística, e trocar o
   * segredo faria a mesma pessoa virar duas na contagem histórica do funil.
   */
  ANONYMIZATION_PEPPER: z
    .string()
    .min(32, "ANONYMIZATION_PEPPER precisa ter ao menos 32 caracteres"),

  /** URL canônica da aplicação (usada em links de e-mail e callbacks). */
  APP_URL: z.url().default("http://localhost:3000"),

  /** Leitura do edital em PDF (README: stack obrigatória). */
  ANTHROPIC_API_KEY: z.string().optional(),

  /**
   * Login com Google (OAuth 2.0).
   *
   * ⚠️ SUSPENSO em 21/08/2026 a pedido da cliente: o Google não entrega
   * telefone, e ela quer garantir o WhatsApp de todo mundo que entra. A UI foi
   * removida; a tabela `user_identities` e estas variáveis ficam porque o custo
   * de mantê-las é zero e retomar depois seria só religar.
   *
   * Ver `docs/login-google.md`.
   */
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  /** Envio de e-mail transacional. Sem chave, cai no driver de log (dev). */
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("O Algoritmo da Aprovação <nao-responda@localhost>"),

  /** Marco 2 — assinaturas. Não é exigida no Marco 1. */
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional(),
  MERCADOPAGO_WEBHOOK_SECRET: z.string().optional(),

  /** Escape hatch para builds de CI que não têm acesso aos segredos. */
  SKIP_ENV_VALIDATION: bool.optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

function parseServerEnv(): ServerEnv {
  const raw = process.env;

  if (raw.SKIP_ENV_VALIDATION === "true" || raw.SKIP_ENV_VALIDATION === "1") {
    return raw as unknown as ServerEnv;
  }

  const result = serverEnvSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Variáveis de ambiente inválidas ou ausentes:\n${issues}\n\n` +
        `Copie o .env.example para .env.local e preencha os valores.`,
    );
  }

  const env = result.data;

  // Regras que só valem em produção — em dev a ausência degrada com aviso.
  if (env.NODE_ENV === "production") {
    const missing: string[] = [];
    if (!env.ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY");
    if (!env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
    if (missing.length > 0) {
      throw new Error(
        `Em produção estas variáveis são obrigatórias: ${missing.join(", ")}`,
      );
    }
  }

  return env;
}

export const env = parseServerEnv();

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";

/**
 * ⚠️ SUSPENSO em 21/08/2026 — ver a nota em `GOOGLE_CLIENT_ID`.
 *
 * A flag continua aqui para o dia em que o login com Google voltar: nesse dia,
 * é ela que a UI consulta para decidir se desenha o botão. Nunca renderizar um
 * caminho de autenticação que vai falhar no clique.
 */
export const isGoogleLoginEnabled =
  Boolean(env.GOOGLE_CLIENT_ID) && Boolean(env.GOOGLE_CLIENT_SECRET);
