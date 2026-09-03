import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyWebhookSignature } from "./webhook-signature";

/**
 * ⚠️ OS CASOS DE ATAQUE SÃO O MOTIVO DESTE ARQUIVO.
 *
 * "A assinatura correta passa" é o teste fácil e o menos útil: um `return
 * { valid: true }` também passaria nele. O que precisa estar coberto é tudo o
 * que um atacante tentaria — e cada um desses casos vale uma assinatura Premium
 * de graça se falhar.
 */

const SEGREDO = "segredo-de-teste";
const AGORA = new Date("2026-09-03T12:00:00.000Z");

function assinar(input: {
  dataId: string;
  requestId: string;
  ts?: number;
  secret?: string;
}) {
  const ts = input.ts ?? AGORA.getTime();
  const manifesto = `id:${input.dataId};request-id:${input.requestId};ts:${ts};`;
  const v1 = createHmac("sha256", input.secret ?? SEGREDO).update(manifesto).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

describe("assinatura do webhook do Mercado Pago", () => {
  const base = { dataId: "1234567890", requestId: "req-abc" };

  it("aceita uma notificação legítima", () => {
    const r = verifyWebhookSignature({
      signatureHeader: assinar(base),
      requestId: base.requestId,
      dataId: base.dataId,
      secret: SEGREDO,
      now: AGORA,
    });

    expect(r.valid).toBe(true);
  });

  it("recusa assinatura feita com outro segredo", () => {
    /* O ataque mais simples: adivinhar o segredo. */
    const r = verifyWebhookSignature({
      signatureHeader: assinar({ ...base, secret: "chute" }),
      requestId: base.requestId,
      dataId: base.dataId,
      secret: SEGREDO,
      now: AGORA,
    });

    expect(r).toEqual({ valid: false, reason: "assinatura não confere" });
  });

  it("recusa quando o data.id foi trocado depois de assinar", () => {
    /*
      ⚠️ O ATAQUE QUE MAIS IMPORTA.

      Capturar uma notificação legítima de um pagamento pequeno e trocar o id
      pelo de outro pagamento. Sem o `data.id` dentro do manifesto, a assinatura
      continuaria válida e o sistema iria buscar o pagamento errado no Mercado
      Pago — creditando a alguém uma cobrança que não foi dele.
    */
    const r = verifyWebhookSignature({
      signatureHeader: assinar(base),
      requestId: base.requestId,
      dataId: "9999999999",
      secret: SEGREDO,
      now: AGORA,
    });

    expect(r.valid).toBe(false);
  });

  it("recusa notificação antiga, mesmo com assinatura válida", () => {
    /*
      Repetição: a assinatura de ontem continua matematicamente correta para
      sempre, porque nada dentro dela envelhece sozinho.
    */
    const ontem = AGORA.getTime() - 25 * 60 * 60 * 1000;

    const r = verifyWebhookSignature({
      signatureHeader: assinar({ ...base, ts: ontem }),
      requestId: base.requestId,
      dataId: base.dataId,
      secret: SEGREDO,
      now: AGORA,
    });

    expect(r.valid).toBe(false);
    expect(r.valid === false && r.reason).toMatch(/fora da janela/);
  });

  it("recusa quando não há segredo configurado", () => {
    /*
      Segredo vazio não pode virar "então aceita tudo". Já vi essa porta em
      produto de gente grande: a variável de ambiente falta no deploy e o
      webhook passa a aceitar qualquer POST.
    */
    const r = verifyWebhookSignature({
      signatureHeader: assinar(base),
      requestId: base.requestId,
      dataId: base.dataId,
      secret: "",
      now: AGORA,
    });

    expect(r).toEqual({ valid: false, reason: "segredo não configurado" });
  });

  it("recusa cabeçalho ausente, vazio ou malformado", () => {
    for (const cabecalho of [null, "", "lixo", "ts=123", "v1=abc", "ts=,v1="]) {
      const r = verifyWebhookSignature({
        signatureHeader: cabecalho,
        requestId: base.requestId,
        dataId: base.dataId,
        secret: SEGREDO,
        now: AGORA,
      });

      expect(r.valid, `cabeçalho ${JSON.stringify(cabecalho)}`).toBe(false);
    }
  });

  it("recusa v1 que não é hexadecimal do tamanho certo", () => {
    /*
      `Buffer.from("zz", "hex")` devolve buffer VAZIO em vez de erro. Sem a
      conferência de tamanho, `timingSafeEqual` receberia dois buffers vazios e
      um lixo qualquer passaria como assinatura válida.
    */
    for (const v1 of ["zz", "", "abc"]) {
      const r = verifyWebhookSignature({
        signatureHeader: `ts=${AGORA.getTime()},v1=${v1}`,
        requestId: base.requestId,
        dataId: base.dataId,
        secret: SEGREDO,
        now: AGORA,
      });

      expect(r.valid, `v1 ${JSON.stringify(v1)}`).toBe(false);
    }
  });

  it("o request-id faz parte do que é assinado", () => {
    const r = verifyWebhookSignature({
      signatureHeader: assinar(base),
      requestId: "outro-request",
      dataId: base.dataId,
      secret: SEGREDO,
      now: AGORA,
    });

    expect(r.valid).toBe(false);
  });
});
