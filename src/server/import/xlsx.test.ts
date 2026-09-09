import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ehArquivoXlsx, COMO_EXPORTAR_XLSX } from "./xlsx";

/**
 * ⚠️ A CHECAGEM POR EXTENSÃO CUSTOU UMA IMPORTAÇÃO QUE NÃO ACONTECEU.
 *
 * Palavras da cliente em 09/09/2026: "eu coloco pra selecionar no drive, e o
 * sistema não permite selecionar o excel". Arquivo escolhido pelo Google Drive
 * chega ao navegador sem extensão, e `nome.endsWith(".xlsx")` recusava a
 * planilha certa. É a mesma lição dos mapas mentais dela, que vieram do Drive
 * sem extensão nenhuma: o nome descreve, os bytes provam.
 */

function bytes(...valores: number[]): Uint8Array {
  const buffer = new Uint8Array(32);
  buffer.set(valores);
  return buffer;
}

describe("ehArquivoXlsx", () => {
  it("reconhece o ZIP que todo .xlsx é", () => {
    expect(ehArquivoXlsx(bytes(0x50, 0x4b, 0x03, 0x04))).toBe(true);
  });

  it("reconhece a planilha REAL da cliente, sem olhar o nome", () => {
    /*
      O arquivo de verdade, e não uma imitação. Se o formato mudar de um jeito
      que a assinatura não cubra, é aqui que aparece.
    */
    const caminho = "CraseFlashcards.xlsx";
    if (!existsSync(caminho)) return;

    expect(ehArquivoXlsx(new Uint8Array(readFileSync(caminho)))).toBe(true);
  });

  it("recusa HTML, que é o que um link do Drive baixa", () => {
    const html = new TextEncoder().encode("<!DOCTYPE html><html><head>");
    expect(ehArquivoXlsx(html)).toBe(false);
  });

  it("recusa PDF e arquivo curto demais para ter assinatura", () => {
    expect(ehArquivoXlsx(bytes(0x25, 0x50, 0x44, 0x46))).toBe(false);
    expect(ehArquivoXlsx(new Uint8Array([0x50, 0x4b]))).toBe(false);
  });

  it("a mensagem de recusa ensina a exportar do Google Drive", () => {
    /*
      "Precisa ser .xlsx" sozinho deixa a pessoa tentando de novo com o mesmo
      arquivo. Planilha Google não é arquivo: é documento no servidor deles, e
      o Drive só entrega um .xlsx depois de exportar.
    */
    expect(COMO_EXPORTAR_XLSX).toContain("Planilhas Google");
    expect(COMO_EXPORTAR_XLSX).toContain("Microsoft Excel");
  });
});
