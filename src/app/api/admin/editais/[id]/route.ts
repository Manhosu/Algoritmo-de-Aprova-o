import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";
import { preparationDocuments } from "@/server/db/schema";
import { getEditalFile } from "@/server/storage";

/**
 * SERVE O PDF DE UM EDITAL PARA O PAINEL (pedido de 02/09/2026).
 * ============================================================================
 *
 * Palavras da cliente: "gostaria de conseguir abrir e baixar os editais que os
 * alunos enviaram". A tela listava nome do arquivo, tamanho e páginas, e o nome
 * era texto morto.
 *
 * ⚠️ ESTE ENDPOINT LÊ DOCUMENTO PESSOAL DE OUTRA PESSOA.
 *
 * O edital foi enviado por um aluno e pode trazer o nome dele nos metadados do
 * PDF. Três coisas o cercam:
 *
 *   1. `requireAdmin` em toda requisição, antes de qualquer consulta;
 *   2. o id vem da URL e é usado só para buscar a linha — não há caminho de
 *      arquivo vindo do cliente, então não há travessia de diretório possível;
 *   3. `no-store`, porque um PDF de terceiro não deve ficar em cache de CDN.
 */

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();

  const { id } = await params;

  const [documento] = await db
    .select({
      fileName: preparationDocuments.fileName,
      storagePath: preparationDocuments.storagePath,
      mimeType: preparationDocuments.mimeType,
    })
    .from(preparationDocuments)
    .where(eq(preparationDocuments.id, id))
    .limit(1);

  if (!documento) {
    return NextResponse.json({ erro: "Edital não encontrado." }, { status: 404 });
  }

  let bytes: Uint8Array;
  try {
    bytes = await getEditalFile(documento.storagePath);
  } catch {
    /*
      O arquivo pode ter sumido do storage — um bucket recriado, um envio local
      que não subiu. A linha existe e o PDF não; dizer isso é mais útil que um
      500 cru.
    */
    return NextResponse.json(
      { erro: "O arquivo não está mais no armazenamento." },
      { status: 410 },
    );
  }

  /*
    `?baixar=1` força o download; sem ele o navegador abre o PDF na aba. São os
    dois verbos que a cliente pediu, e a diferença é só esta linha.
  */
  const baixar = new URL(request.url).searchParams.get("baixar") === "1";

  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": documento.mimeType || "application/pdf",
      "Content-Length": String(bytes.byteLength),
      /*
        O nome vai em `filename*` percent-encoded: editais têm acento e espaço
        ("Edital nº 1 - Auditor Fiscal.pdf"), e um byte fora de ASCII no
        cabeçalho quebra a resposta inteira em alguns servidores.
      */
      "Content-Disposition": `${baixar ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(
        documento.fileName,
      )}`,
      "Cache-Control": "no-store",
    },
  });
}
