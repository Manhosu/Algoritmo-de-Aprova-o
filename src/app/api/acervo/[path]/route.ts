import { NextResponse } from "next/server";

import { requireApiUser } from "@/server/auth/guards";
import { getContentFile, isRemoteStorageConfigured } from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serve um arquivo do acervo guardado em disco — o outro lado do driver local.
 *
 * ⚠️ EXISTE PORQUE `signContentUrl` JÁ APONTAVA PARA CÁ e não havia nada aqui.
 *
 * Sem Supabase não há URL assinada, então a função devolve este endereço. A rota
 * nunca tinha sido escrita: em desenvolvimento, todo mapa mental e todo vídeo do
 * acervo abria em 404. Passava despercebido porque a máquina de desenvolvimento
 * costuma apontar para o mesmo Supabase da nuvem.
 *
 * Exige sessão, e o caminho é sempre um identificador aleatório: sem os dois,
 * o acervo pago ficaria a um endereço adivinhável de distância. A checagem de
 * plano acontece na tela que gerou o endereço — aqui ela seria tarde demais,
 * porque quem chega direto já tem o caminho.
 */
const TIPO_POR_EXTENSAO: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string }> },
): Promise<Response> {
  await requireApiUser();

  if (isRemoteStorageConfigured()) {
    return NextResponse.json(
      { error: "Este arquivo é servido pelo armazenamento remoto." },
      { status: 404 },
    );
  }

  const { path } = await params;

  if (!/^(loja\/)?[0-9a-zA-Z-]{1,64}\.[a-z0-9]{2,4}$/i.test(path)) {
    return NextResponse.json({ error: "Caminho inválido." }, { status: 400 });
  }

  try {
    const bytes = await getContentFile(path);
    const extensao = path.split(".").pop()?.toLowerCase() ?? "";

    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": TIPO_POR_EXTENSAO[extensao] ?? "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        /* `nosniff` já vem do next.config; aqui garantimos que nada é cacheado. */
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }
}
