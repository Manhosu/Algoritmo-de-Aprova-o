import { describe, expect, it } from "vitest";

import { identifyMedia } from "./media";

/**
 * A identificação por BYTES é o que separa "o arquivo é isso" de "o nome diz que
 * é isso". Com o upload direto ao armazenamento, ela virou a única conferência
 * de tipo que acontece no servidor — o navegador declara o que quiser.
 */

function bytes(...valores: number[]): Uint8Array {
  /* 64 bytes de folga: as checagens exigem comprimento mínimo. */
  const buffer = new Uint8Array(64);
  buffer.set(valores);
  return buffer;
}

const FTYP = [0x66, 0x74, 0x79, 0x70];

describe("identifyMedia", () => {
  it("reconhece MP4 pelo ftyp no byte 4, não no começo", () => {
    /*
      O tamanho da primeira caixa vem ANTES da assinatura. Testar os primeiros
      bytes, como se faz com PNG, não encontra nada — foi o primeiro erro aqui.
    */
    const mp4 = bytes(0x00, 0x00, 0x00, 0x20, ...FTYP, 0x69, 0x73, 0x6f, 0x6d);
    expect(identifyMedia(mp4)?.mimeType).toBe("video/mp4");
  });

  it("separa M4A de MP4 pela marca do contêiner", () => {
    /*
      Áudio do iPhone e do WhatsApp usa o mesmo contêiner do vídeo. Sem olhar a
      marca, todo áudio desses entraria no acervo como videoaula e abriria num
      player de tela preta.
    */
    const m4a = bytes(0x00, 0x00, 0x00, 0x20, ...FTYP, 0x4d, 0x34, 0x41, 0x20);
    expect(identifyMedia(m4a)?.mimeType).toBe("audio/mp4");
  });

  it("reconhece WebM pelo cabeçalho EBML", () => {
    expect(identifyMedia(bytes(0x1a, 0x45, 0xdf, 0xa3))?.mimeType).toBe("video/webm");
  });

  it("reconhece MP3 com tag ID3 e sem ela", () => {
    expect(identifyMedia(bytes(0x49, 0x44, 0x33))?.mimeType).toBe("audio/mpeg");
    // Quadro cru: 0xff seguido dos três bits altos ligados.
    expect(identifyMedia(bytes(0xff, 0xfb, 0x90))?.mimeType).toBe("audio/mpeg");
  });

  it("continua reconhecendo PNG com a dimensão", () => {
    const png = new Uint8Array(64);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(png.buffer).setUint32(16, 1080);
    new DataView(png.buffer).setUint32(20, 1920);

    expect(identifyMedia(png)).toEqual({ mimeType: "image/png", width: 1080, height: 1920 });
  });

  it("devolve nulo para HTML — o caso do link do Drive", () => {
    /*
      ⚠️ ESTE É O TESTE QUE IMPORTA para o upload.

      Quem salva um link de compartilhamento do Drive baixa uma PÁGINA. Ela
      chega com nome ".mp4" e tipo declarado "video/mp4"; só os bytes contam a
      verdade, e sem eles esse arquivo entraria no acervo como vídeo.
    */
    const html = new TextEncoder().encode("<!DOCTYPE html><html><head><title>Drive");
    expect(identifyMedia(html)).toBeNull();
  });

  it("devolve nulo para arquivo curto demais para ter assinatura", () => {
    expect(identifyMedia(new Uint8Array([0x00, 0x01]))).toBeNull();
  });
});
