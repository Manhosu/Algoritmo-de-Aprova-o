import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { env } from "@/config/env";

/**
 * Geração e verificação de segredos: tokens de sessão, tokens de e-mail e a
 * chave pseudônima da LGPD.
 *
 * REGRA QUE VALE PARA TUDO AQUI: o banco nunca guarda o segredo em claro.
 * Guarda o SHA-256 dele. Um vazamento do banco não vira sessão válida nem link
 * de redefinição de senha utilizável.
 *
 * SHA-256 sem sal e sem custo é adequado NESTE caso — e só neste. O que
 * protege senha é o custo (argon2, em `password.ts`), porque senha tem pouca
 * entropia e é adivinhável. Token aqui tem 256 bits de aleatoriedade
 * criptográfica: não há dicionário que o alcance, e um hash lento só serviria
 * para deixar cada requisição autenticada mais cara.
 */

/** 32 bytes = 256 bits. */
const TOKEN_BYTES = 32;

export type GeneratedToken = {
  /** Vai para o cookie ou para o link do e-mail. Nunca é gravado. */
  token: string;
  /** Vai para o banco. */
  tokenHash: string;
};

export function generateToken(): GeneratedToken {
  // base64url: seguro em URL e em cookie, sem escape.
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Comparação em tempo constante.
 *
 * A busca no banco é feita pelo hash (índice único), então o caminho normal já
 * não vaza tempo. Esta função existe para as comparações fora do banco — por
 * exemplo conferir o `state` do OAuth.
 */
export function safeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  // `timingSafeEqual` exige mesmo comprimento; comprimentos diferentes já são
  // uma diferença pública, então rejeitar direto não vaza nada novo.
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/* ========================================================================== *
 * VALIDADE
 * ========================================================================== */

export const TOKEN_LIFETIMES = {
  /** Sessão de login. Renovada por uso (ver `session.ts`). */
  session: 30 * 24 * 60 * 60 * 1000,
  /** Recuperação de senha. Curto de propósito: e-mail fica em caixa de entrada. */
  passwordReset: 60 * 60 * 1000,
  /** Confirmação de e-mail no cadastro. */
  emailVerification: 24 * 60 * 60 * 1000,
  /** Confirmação de troca de e-mail, enviada ao endereço NOVO. */
  emailChange: 2 * 60 * 60 * 1000,
  /** `state` do OAuth. Só precisa durar o ida e volta ao Google. */
  oauthState: 10 * 60 * 1000,
} as const;

export function expiresAt(lifetimeMs: number, now: Date): Date {
  return new Date(now.getTime() + lifetimeMs);
}

export function isExpired(expiry: Date, now: Date): boolean {
  return expiry.getTime() <= now.getTime();
}

/* ========================================================================== *
 * PSEUDONIMIZAÇÃO (LGPD)
 * ========================================================================== */

/**
 * Chave pseudônima que acompanha os eventos de telemetria.
 *
 * `HMAC-SHA256(ANONYMIZATION_PEPPER, userId)`, com o pepper vivendo SÓ no
 * ambiente — nunca no banco, nunca no dump de backup.
 *
 * A irreversibilidade se apoia em três coisas, e as três precisam valer:
 *   1. HMAC-SHA256 é unidirecional;
 *   2. o pepper não está no banco nem no backup;
 *   3. na anonimização, `users.pseudonym_key` é APAGADA — some a ponte entre a
 *      chave e qualquer linha que identifique alguém.
 *
 * Sem o item 3, bastaria consultar `users` para religar os eventos a uma pessoa,
 * e a irreversibilidade seria retórica.
 *
 * ⚠️ O pepper NUNCA rotaciona depois do go-live: a função é determinística, e
 * trocar o segredo faria a mesma pessoa virar duas na contagem histórica.
 */
export function pseudonymKey(userId: string): string {
  const pepper = env.ANONYMIZATION_PEPPER;
  if (!pepper) {
    throw new Error(
      "ANONYMIZATION_PEPPER não configurada. Sem ela a pseudonimização da LGPD " +
        "não funciona e o funil não pode ser gravado.",
    );
  }
  return createHmac("sha256", pepper).update(userId).digest("hex");
}

/**
 * Hash de IP, para registro de segurança.
 *
 * Guardamos o hash e não o IP: serve para detectar anomalia (muitas tentativas
 * do mesmo lugar) sem armazenar um dado pessoal que não precisamos ler.
 * Usa o mesmo pepper, para não ser reversível por tabela arco-íris — o espaço
 * de IPv4 tem só 4 bilhões de valores e seria trivial de reverter com SHA-256 puro.
 */
export function hashIp(ip: string): string {
  const pepper = env.ANONYMIZATION_PEPPER ?? "";
  return createHmac("sha256", pepper).update(ip).digest("hex").slice(0, 64);
}
