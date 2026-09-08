import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/server/auth/guards";
import { isRemoteStorageConfigured, putContentFileLocal } from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Recebe o arquivo do acervo QUANDO NÃO HÁ SUPABASE — ou seja, em
 * desenvolvimento.
 *
 * ⚠️ RECUSA EXPLICITAMENTE QUANDO O SUPABASE ESTÁ CONFIGURADO.
 *
 * Em produção o upload vai direto do navegador para o bucket, por uma URL
 * assinada, justamente para não esbarrar no limite de 4,5 MB que a Vercel
 * aplica ao corpo de qualquer função. Deixar esta rota funcionando lá criaria
 * um segundo caminho, mais frágil, que passaria despercebido até o primeiro
 * vídeo de 10 MB ser recusado sem explicação.
 */
export async function POST(request: Request): Promise<Response> {
  await requireApiAdmin();

  if (isRemoteStorageConfigured()) {
    return NextResponse.json(
      { error: "Em produção o upload vai direto ao armazenamento." },
      { status: 400 },
    );
  }

  const path = new URL(request.url).searchParams.get("path") ?? "";

  /*
    O caminho vem de `createContentUploadUrl` e é sempre `<uuid>.<ext>` ou
    `loja/<uuid>.<ext>`. A checagem existe porque a rota é pública para qualquer
    administrador autenticado, e `resolveLocal` sozinho barraria a travessia mas
    deixaria escrever em qualquer nome dentro da pasta.
  */
  if (!/^(loja\/)?[0-9a-f-]{36}\.[a-z0-9]{2,4}$/i.test(path)) {
    return NextResponse.json({ error: "Caminho inválido." }, { status: 400 });
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: "Arquivo vazio." }, { status: 400 });
  }

  await putContentFileLocal(path, bytes);

  return NextResponse.json({ ok: true });
}
