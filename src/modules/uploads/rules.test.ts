import { describe, expect, it } from "vitest";

import {
  ehTipoAceito,
  limiteDeBytes,
  motivoDaRecusa,
  tipoDeclarado,
  tipoDeMaterialPara,
} from "./rules";

/**
 * As regras do upload têm três leitores — navegador, servidor antes e servidor
 * depois — e o pior defeito possível aqui é eles discordarem. Estes testes
 * fixam o comportamento que os três compartilham.
 */

describe("tipoDeclarado", () => {
  it("aceita o que o navegador declara", () => {
    expect(tipoDeclarado({ mimeType: "video/mp4", fileName: "aula.mp4" })).toBe("video/mp4");
  });

  it("corrige image/jpg, que não é um tipo que existe", () => {
    // Alguns navegadores mandam isso; o registrado é image/jpeg.
    expect(tipoDeclarado({ mimeType: "image/jpg", fileName: "mapa.jpg" })).toBe("image/jpeg");
  });

  it("ignora o parâmetro de codificação", () => {
    expect(tipoDeclarado({ mimeType: "video/mp4; codecs=avc1", fileName: "a.mp4" })).toBe(
      "video/mp4",
    );
  });

  it("cai na extensão quando o navegador não sabe dizer", () => {
    // Foi o que aconteceu com os arquivos que vieram do Drive.
    expect(tipoDeclarado({ mimeType: "", fileName: "CF - Habeas Corpus.mp4" })).toBe("video/mp4");
    expect(tipoDeclarado({ mimeType: null, fileName: "resumo.PDF" })).toBe("application/pdf");
  });

  it("trata .mov como MP4, porque o contêiner é o mesmo", () => {
    expect(tipoDeclarado({ mimeType: null, fileName: "video.mov" })).toBe("video/mp4");
  });

  it("recusa o que não sabe identificar por nenhum dos dois caminhos", () => {
    expect(tipoDeclarado({ mimeType: "application/zip", fileName: "pasta.zip" })).toBeNull();
    expect(tipoDeclarado({ mimeType: null, fileName: "sem extensao" })).toBeNull();
  });
});

describe("motivoDaRecusa", () => {
  it("aprova um vídeo de 10 MB", () => {
    // O maior dos vídeos do Mind-X tem 10,7 MB. Se este teste falhar, metade da
    // pasta dela para de subir.
    expect(
      motivoDaRecusa({ tipo: "video/mp4", sizeBytes: 10.7 * 1024 * 1024 }),
    ).toBeNull();
  });

  it("recusa arquivo vazio", () => {
    expect(motivoDaRecusa({ tipo: "image/png", sizeBytes: 0 })).toBe("O arquivo está vazio.");
  });

  it("recusa formato desconhecido antes de olhar o tamanho", () => {
    expect(motivoDaRecusa({ tipo: null, sizeBytes: 10 })).toContain("Formato não aceito");
  });

  it("usa o teto da família, e não um número só", () => {
    const vinteMega = 20 * 1024 * 1024;

    // Imagem de 20 MB é grande demais para o celular do aluno...
    expect(motivoDaRecusa({ tipo: "image/png", sizeBytes: vinteMega })).toContain("limite");
    // ...e vídeo de 20 MB é o tamanho normal de um story.
    expect(motivoDaRecusa({ tipo: "video/mp4", sizeBytes: vinteMega })).toBeNull();
  });

  it("diz o tamanho do arquivo e o limite, não só 'muito grande'", () => {
    const mensagem = motivoDaRecusa({ tipo: "video/mp4", sizeBytes: 300 * 1024 * 1024 });
    expect(mensagem).toContain("300");
    expect(mensagem).toContain("200");
  });
});

describe("tipoDeMaterialPara", () => {
  it("acerta o tipo do material a partir do arquivo", () => {
    // Sem isto, um MP4 cadastrado com o seletor em "Resumo" abre como link.
    expect(tipoDeMaterialPara("video/mp4")).toBe("video");
    expect(tipoDeMaterialPara("audio/mpeg")).toBe("audio");
    expect(tipoDeMaterialPara("application/pdf")).toBe("pdf");
  });

  it("não opina sobre imagem", () => {
    // Uma imagem tanto pode ser mapa mental quanto ilustração de resumo.
    expect(tipoDeMaterialPara("image/png")).toBeNull();
  });
});

describe("coerência entre as três checagens", () => {
  it("todo tipo aceito tem extensão, limite e é reconhecido de volta", () => {
    for (const tipo of ["image/png", "video/mp4", "audio/mp4"] as const) {
      expect(ehTipoAceito(tipo)).toBe(true);
      expect(limiteDeBytes(tipo)).toBeGreaterThan(0);
      expect(motivoDaRecusa({ tipo, sizeBytes: 1024 })).toBeNull();
    }
  });
});
