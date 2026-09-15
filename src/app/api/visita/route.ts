import { env } from "@/config/env";
import {
  caminhoDaVisita,
  ehRobo,
  tipoDeAparelho,
  truncarIp,
} from "@/modules/analytics/visits";
import { chaveDoVisitante, registrarBatida } from "@/server/analytics/visits";
import { readSessionToken, resolveSession } from "@/server/auth/session";

/**
 * A BATIDA DO VISITANTE (ver `components/analytics/visit-tracker`).
 *
 * ⚠️ SEMPRE 204, até no erro. Quem chama é um `sendBeacon` que ninguém lê, e
 * contar visita nunca pode virar erro na tela do aluno. O que não serve é
 * descartado em silêncio: robô, painel, admin, outra origem, corpo inválido.
 */
export const dynamic = "force-dynamic";

const ORIGEM = new URL(env.APP_URL).origin;

export async function POST(request: Request) {
  try {
    /* Outro site não empurra visita para o nosso painel. */
    const origem = request.headers.get("origin");
    if (origem && origem !== ORIGEM) return vazio();

    const userAgent = request.headers.get("user-agent");
    if (ehRobo(userAgent)) return vazio();

    const corpo = (await request.json().catch(() => null)) as {
      tipo?: unknown;
      path?: unknown;
    } | null;

    const tipo = corpo?.tipo === "pagina" || corpo?.tipo === "batida" ? corpo.tipo : null;
    const path = caminhoDaVisita(corpo?.path);
    if (!tipo || !path) return vazio();

    /* `touch: false`: ler a sessão aqui não pode renovar nem gravar nada nela. */
    const token = await readSessionToken();
    const sessao = token ? await resolveSession(token, { touch: false }) : null;

    /* A cliente testando o site com a conta de administração não é visitante. */
    if (sessao?.user.role === "admin") return vazio();

    const agora = new Date();

    await registrarBatida({
      visitorKey: chaveDoVisitante({
        userId: sessao?.user.id ?? null,
        ipTruncado: truncarIp(
          request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
        ),
        userAgent: userAgent ?? "",
        agora,
      }),
      authenticated: Boolean(sessao),
      tipo,
      path,
      device: tipoDeAparelho(userAgent),
      agora,
    });
  } catch {
    /* ver a nota acima */
  }

  return vazio();
}

function vazio() {
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
