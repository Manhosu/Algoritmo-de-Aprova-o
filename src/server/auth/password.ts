import "server-only";

import { hash, verify } from "@node-rs/argon2";

import { PASSWORD_MIN_LENGTH } from "@/config/app";

/**
 * Hashing de senha.
 *
 * PARÂMETROS: recomendação da OWASP para argon2id — 19 MiB de memória, 2
 * iterações, paralelismo 1. Argon2id resiste tanto a ataque de canal lateral
 * quanto a GPU, que é o motivo de ser a escolha e não bcrypt.
 *
 * Não invente parâmetros "mais fortes" sem medir: memória alta demais torna o
 * login lento o suficiente para virar vetor de negação de serviço — o atacante
 * não precisa quebrar a senha, basta pedir mil logins.
 */

const ARGON2_OPTIONS = {
  memoryCost: 19_456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Hash de referência, usado quando o e-mail não existe.
 *
 * Sem isto, o login responderia rápido para e-mail inexistente e devagar para
 * e-mail existente — e essa diferença de tempo é um oráculo: dá para descobrir
 * quem tem conta na plataforma sem acertar uma senha sequer.
 *
 * Gerado uma vez, na primeira necessidade, e reaproveitado.
 */
let decoyHash: string | null = null;

async function getDecoyHash(): Promise<string> {
  decoyHash ??= await hash("senha-inexistente-para-igualar-o-tempo", ARGON2_OPTIONS);
  return decoyHash;
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/**
 * Confere a senha.
 *
 * `storedHash` nulo significa e-mail inexistente OU conta sem senha (só Google).
 * Nos dois casos gastamos o mesmo tempo de um verify real antes de recusar.
 */
export async function verifyPassword(
  password: string,
  storedHash: string | null,
): Promise<boolean> {
  if (storedHash === null) {
    await verify(await getDecoyHash(), password).catch(() => false);
    return false;
  }

  try {
    return await verify(storedHash, password);
  } catch {
    // Hash corrompido ou em formato desconhecido. Recusa em vez de estourar —
    // um erro aqui viraria 500 numa tela de login.
    return false;
  }
}

/* ========================================================================== *
 * POLÍTICA DE SENHA
 * ========================================================================== */

export type PasswordCheck = { ok: boolean; problems: string[] };

/**
 * Comprimento mínimo. Acima do mínimo, o tamanho vale mais que a complexidade.
 *
 * ⚠️ O NÚMERO VEM DE `config/app.ts`, e não daqui. Este arquivo é `server-only`
 * e as telas não conseguem importar dele — se o mínimo morasse aqui, o texto na
 * tela seria uma cópia escrita à mão, livre para discordar da regra.
 */
const MIN_LENGTH = PASSWORD_MIN_LENGTH;
const MAX_LENGTH = 200;

/**
 * Senhas que aparecem em qualquer lista de vazamento. Bloqueá-las remove a
 * maior parte do risco real de força bruta contra contas específicas.
 */
const COMMON_PASSWORDS = new Set([
  "123456", "123456789", "12345678", "senha123", "password", "123mudar",
  "qwerty", "abc123", "111111", "1234567890", "senha", "brasil123",
  "concurso", "concurso123", "mudar123", "admin123", "12345",
]);

/**
 * Valida a senha no cadastro e na troca.
 *
 * Segue a orientação atual do NIST: **comprimento mínimo e bloqueio de senha
 * conhecida**, sem exigir símbolo, número e maiúscula. Regras de composição
 * empurram o usuário para "Senha@123" — que atende a todas elas e está em toda
 * lista de vazamento.
 */
export function checkPasswordStrength(
  password: string,
  context: { email?: string; name?: string } = {},
): PasswordCheck {
  const problems: string[] = [];

  if (password.length < MIN_LENGTH) {
    problems.push(`A senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`);
  }
  if (password.length > MAX_LENGTH) {
    problems.push(`A senha pode ter no máximo ${MAX_LENGTH} caracteres.`);
  }

  const normalized = password.toLowerCase().trim();

  if (COMMON_PASSWORDS.has(normalized)) {
    problems.push("Esta senha é muito comum. Escolha outra.");
  }

  if (/^(.)\1+$/.test(password)) {
    problems.push("A senha não pode ser um único caractere repetido.");
  }

  const emailLocal = context.email?.split("@")[0]?.toLowerCase();
  if (emailLocal && emailLocal.length >= 4 && normalized.includes(emailLocal)) {
    problems.push("A senha não pode conter o seu e-mail.");
  }

  const firstName = context.name?.trim().split(/\s+/)[0]?.toLowerCase();
  if (firstName && firstName.length >= 4 && normalized.includes(firstName)) {
    problems.push("A senha não pode conter o seu nome.");
  }

  return { ok: problems.length === 0, problems };
}
