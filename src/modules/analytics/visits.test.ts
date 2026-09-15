import { describe, expect, it } from "vitest";

import {
  caminhoDaVisita,
  ehRobo,
  formatarDuracao,
  lerPeriodo,
  segundosAContar,
  tipoDeAparelho,
  truncarIp,
} from "./visits";

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0 Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

describe("segundosAContar", () => {
  const base = new Date("2026-09-15T12:00:00Z");

  it("soma o tempo entre batidas próximas", () => {
    expect(segundosAContar(base, new Date(base.getTime() + 30_000))).toBe(30);
  });

  it("⚠️ não soma o tempo em que a aba ficou escondida", () => {
    expect(segundosAContar(base, new Date(base.getTime() + 20 * 60_000))).toBe(0);
  });

  it("relógio para trás não vira tempo negativo", () => {
    expect(segundosAContar(base, new Date(base.getTime() - 5_000))).toBe(0);
  });
});

describe("ehRobo", () => {
  it("navegador de gente passa", () => {
    expect(ehRobo(CHROME)).toBe(false);
    expect(ehRobo(IPHONE)).toBe(false);
  });

  it("⚠️ a pré-visualização do WhatsApp não conta como visitante", () => {
    expect(ehRobo("WhatsApp/2.23.20.0")).toBe(true);
    expect(ehRobo("Googlebot/2.1")).toBe(true);
    expect(ehRobo("Mozilla/5.0 HeadlessChrome/139.0")).toBe(true);
    expect(ehRobo(null)).toBe(true);
  });
});

describe("tipoDeAparelho", () => {
  it("separa celular, tablet e computador", () => {
    expect(tipoDeAparelho(IPHONE)).toBe("mobile");
    expect(tipoDeAparelho("Mozilla/5.0 (iPad; CPU OS 17_0)")).toBe("tablet");
    expect(tipoDeAparelho(CHROME)).toBe("desktop");
  });
});

describe("truncarIp", () => {
  it("guarda só o começo do endereço", () => {
    expect(truncarIp("189.40.12.201")).toBe("189.40.12.0");
    expect(truncarIp("189.40.12.201, 10.0.0.1")).toBe("189.40.12.0");
    expect(truncarIp("2804:14c:5bd0:8a21::1")).toBe("2804:14c:5bd0::");
    expect(truncarIp(null)).toBe("");
  });
});

describe("caminhoDaVisita", () => {
  it("aceita as páginas do site", () => {
    expect(caminhoDaVisita("/")).toBe("/");
    expect(caminhoDaVisita("/inicio")).toBe("/inicio");
  });

  it("⚠️ o painel da cliente não entra na conta", () => {
    expect(caminhoDaVisita("/admin")).toBeNull();
    expect(caminhoDaVisita("/admin/jogos")).toBeNull();
    expect(caminhoDaVisita("/administrar")).toBe("/administrar");
  });

  it("recusa o que não é caminho", () => {
    expect(caminhoDaVisita("https://outro.site")).toBeNull();
    expect(caminhoDaVisita(42)).toBeNull();
    expect(caminhoDaVisita(`/${"a".repeat(400)}`)).toBeNull();
  });
});

describe("lerPeriodo e formatarDuracao", () => {
  it("período desconhecido cai em 7 dias", () => {
    expect(lerPeriodo("30")).toBe("30");
    expect(lerPeriodo("999")).toBe("7");
    expect(lerPeriodo(undefined)).toBe("7");
  });

  it("segundos viram minutos a partir de um minuto", () => {
    expect(formatarDuracao(45)).toEqual({ valor: 45, sufixo: " s" });
    expect(formatarDuracao(200)).toEqual({ valor: 3, sufixo: " min" });
    expect(formatarDuracao(null)).toEqual({ valor: null, sufixo: "" });
  });
});
