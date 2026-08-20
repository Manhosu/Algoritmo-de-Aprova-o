import { describe, expect, it } from "vitest";

import { checkPasswordStrength } from "./password";

/**
 * Só a política de senha é testada aqui — ela é pura.
 *
 * `hashPassword` e `verifyPassword` chamam argon2 nativo com custo de memória
 * real: testá-los seria testar a biblioteca, e cada chamada levaria centenas de
 * milissegundos numa suíte que hoje roda inteira em 200 ms.
 */

describe("checkPasswordStrength", () => {
  it("aceita senha longa e comum de digitar", () => {
    // A orientação atual do NIST é comprimento, não composição.
    expect(checkPasswordStrength("meu cachorro come muito").ok).toBe(true);
  });

  it("recusa senha curta", () => {
    const resultado = checkPasswordStrength("abc123");
    expect(resultado.ok).toBe(false);
    expect(resultado.problems.join(" ")).toContain("10 caracteres");
  });

  it("RECUSA SENHA DE LISTA DE VAZAMENTO, mesmo que pareça complexa", () => {
    // É o risco real: senha que atende a toda regra de composição e está em
    // toda lista pública.
    for (const senha of ["senha123", "concurso123", "123456789", "brasil123"]) {
      expect(checkPasswordStrength(senha).ok).toBe(false);
    }
  });

  it("NÃO exige símbolo, número e maiúscula", () => {
    // Regras de composição empurram o usuário para "Senha@123" — que passa em
    // todas elas e está em qualquer dicionário de ataque.
    const resultado = checkPasswordStrength("cadeira amarela grande");
    expect(resultado.ok).toBe(true);
  });

  it("recusa a senha que contém o e-mail do próprio usuário", () => {
    const resultado = checkPasswordStrength("joaosilva2026", {
      email: "joaosilva@gmail.com",
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.problems.join(" ")).toContain("e-mail");
  });

  it("recusa a senha que contém o nome do próprio usuário", () => {
    const resultado = checkPasswordStrength("mariana123456", { name: "Mariana Souza" });
    expect(resultado.ok).toBe(false);
    expect(resultado.problems.join(" ")).toContain("nome");
  });

  it("nome curto não bloqueia senha à toa", () => {
    // "Ana" tem 3 letras; bloquear qualquer senha que contenha "ana" barraria
    // "banana" e "manancial" sem ganho de segurança.
    expect(checkPasswordStrength("bananas maduras", { name: "Ana Lima" }).ok).toBe(true);
  });

  it("recusa caractere único repetido", () => {
    expect(checkPasswordStrength("aaaaaaaaaaaa").ok).toBe(false);
  });

  it("recusa senha absurdamente longa", () => {
    expect(checkPasswordStrength("a".repeat(500)).ok).toBe(false);
  });

  it("acumula todos os problemas de uma vez", () => {
    // O usuário precisa ver tudo que está errado, não descobrir um por vez.
    const resultado = checkPasswordStrength("abc", { email: "abc@x.com" });
    expect(resultado.problems.length).toBeGreaterThanOrEqual(1);
  });

  it("ignora caixa ao comparar com lista e com dados do usuário", () => {
    expect(checkPasswordStrength("SENHA123").ok).toBe(false);
    expect(checkPasswordStrength("MARIANA123456", { name: "mariana souza" }).ok).toBe(false);
  });
});
