import { describe, expect, it } from "vitest";

import { podeJogar, validarLinkDoJogo } from "./rules";

describe("validarLinkDoJogo", () => {
  it.each([
    "https://neural-glow-connect.lovable.app/",
    "https://neon-concept-chase.lovable.app",
    "  https://drag-and-sort-game.lovable.app/  ",
  ])("aceita o jogo do Lovable: %s", (link) => {
    expect(validarLinkDoJogo(link).ok).toBe(true);
  });

  it("⚠️ recusa outro endereço, que abriria como quadro em branco", () => {
    const resultado = validarLinkDoJogo("https://meujogo.com.br/");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.message).toMatch(/lovable\.app/);
  });

  it("recusa endereço que só se parece com o do Lovable", () => {
    expect(validarLinkDoJogo("https://lovable.app.golpe.com/").ok).toBe(false);
    expect(validarLinkDoJogo("https://golpelovable.app/").ok).toBe(false);
    expect(validarLinkDoJogo("https://lovable.app/").ok).toBe(false);
  });

  it("recusa http e texto que não é link", () => {
    expect(validarLinkDoJogo("http://jogo.lovable.app/").ok).toBe(false);
    expect(validarLinkDoJogo("jogo.lovable.app").ok).toBe(false);
  });
});

describe("podeJogar", () => {
  const GRATUITO = 1;
  const PREMIUM = 3;

  it("jogo sem plano mínimo é de todos", () => {
    expect(podeJogar(GRATUITO, null)).toBe(true);
  });

  it("quem está no plano mínimo, ou acima, joga; quem está abaixo, não", () => {
    expect(podeJogar(PREMIUM, PREMIUM)).toBe(true);
    expect(podeJogar(GRATUITO, PREMIUM)).toBe(false);
  });
});
