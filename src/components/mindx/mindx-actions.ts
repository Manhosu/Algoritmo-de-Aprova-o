"use server";

import { requireUser } from "@/server/auth/guards";
import { markMindXSeen } from "@/server/engine/mindx";

/** ⚠️ Arquivo `"use server"`: só exporta `async function`. Tipo é apagado. */

/**
 * Marca um vídeo do Mind-X como visto.
 *
 * ⚠️ NÃO DEVOLVE NADA, e o cliente não espera resposta.
 *
 * A gravação existe para a rotação de amanhã, não para a tela de agora. Fazer o
 * player aguardar o servidor entre um vídeo e outro colocaria a latência do
 * banco no meio de um gesto que precisa ser instantâneo.
 *
 * Se falhar, o pior que acontece é o vídeo aparecer de novo amanhã. É barato o
 * suficiente para não valer um tratamento de erro na tela.
 */
export async function markSeenAction(contentItemId: string): Promise<void> {
  const session = await requireUser();

  await markMindXSeen({ userId: session.user.id, contentItemId });
}
