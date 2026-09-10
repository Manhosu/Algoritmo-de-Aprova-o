import { describe, expect, it } from "vitest";

import { enderecosDeDownload, idDoGoogle, nomeDoArquivo } from "./google-link";

/**
 * O link colado vira um ID, e só o ID sai daqui.
 *
 * O ID abaixo é o do baralho de Colocação Pronominal da cliente, que ela
 * cadastrou com o link do Drive em 07/09/2026.
 */
const ID = "1CougnHjbg250wM1vsKVhADeFs5ykczkgOiZlML51lEI";

describe("idDoGoogle", () => {
  it.each([
    `https://docs.google.com/spreadsheets/d/${ID}/edit?usp=drive_link`,
    `https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`,
    `https://docs.google.com/spreadsheets/u/0/d/${ID}/edit`,
    `https://drive.google.com/file/d/${ID}/view?usp=drive_link`,
    `https://drive.google.com/open?id=${ID}`,
    `  https://docs.google.com/spreadsheets/d/${ID}/edit  `,
  ])("lê o ID de %s", (link) => {
    expect(idDoGoogle(link)).toBe(ID);
  });

  it("⚠️ recusa link de outro domínio, mesmo com o formato certo", () => {
    /*
      O servidor baixa a partir deste ID. Aceitar outro domínio seria a porta
      para ele buscar o que alguém quisesse.
    */
    expect(idDoGoogle(`https://evil.example/spreadsheets/d/${ID}/edit`)).toBeNull();
    expect(idDoGoogle(`https://docs.google.com.evil.example/spreadsheets/d/${ID}`)).toBeNull();
    expect(idDoGoogle(`http://docs.google.com/spreadsheets/d/${ID}`)).toBeNull();
  });

  it("recusa o que não é link, e ID que não tem forma de ID", () => {
    expect(idDoGoogle("minha planilha")).toBeNull();
    expect(idDoGoogle("https://docs.google.com/spreadsheets/d/curto/edit")).toBeNull();
    expect(idDoGoogle("https://docs.google.com/spreadsheets/d/../../etc/passwd")).toBeNull();
  });
});

describe("enderecosDeDownload", () => {
  it("monta os dois endereços do Google a partir do ID", () => {
    expect(enderecosDeDownload(ID)).toEqual([
      `https://docs.google.com/spreadsheets/d/${ID}/export?format=xlsx`,
      `https://drive.usercontent.google.com/download?id=${ID}&export=download&confirm=t`,
    ]);
  });

  it("não monta nada com um ID fora do formato", () => {
    expect(enderecosDeDownload("abc/../x")).toEqual([]);
  });
});

describe("nomeDoArquivo", () => {
  it("usa o nome com acento que o Google manda codificado", () => {
    expect(
      nomeDoArquivo(
        `attachment; filename="Coloca__o.xlsx"; filename*=UTF-8''Coloca%C3%A7%C3%A3o%20Pronominal.xlsx`,
        ID,
      ),
    ).toBe("Colocação Pronominal.xlsx");
  });

  it("sem cabeçalho, inventa um nome estável a partir do ID", () => {
    expect(nomeDoArquivo(null, ID)).toBe("planilha-1CougnHj.xlsx");
  });
});
