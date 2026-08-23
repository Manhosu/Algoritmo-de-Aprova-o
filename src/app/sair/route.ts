import { NextResponse } from "next/server";

import { LOGIN_ROUTE } from "@/config/routes";
import {
  clearSessionCookie,
  getCurrentSession,
  revokeSession,
} from "@/server/auth/session";

/**
 * Logout.
 *
 * REVOGA A SESSÃO NO BANCO, além de apagar o cookie.
 *
 * Apagar só o cookie deixaria o token válido no servidor — quem tivesse
 * copiado o valor continuaria entrando. É justamente essa diferença que
 * justificou termos sessão em banco em vez de JWT.
 *
 * É GET porque o item "Sair" do menu é um link. Isso normalmente seria
 * problema (um GET não deveria mudar estado, e prefetch dispararia logout
 * sozinho), e por isso o link usa `prefetch={false}`. O dano de um logout
 * indevido é o aluno ter que entrar de novo — aceitável, diferente de uma
 * ação destrutiva.
 */
export async function GET(request: Request) {
  const session = await getCurrentSession();

  if (session) {
    await revokeSession(session.sessionId, "logout");
  }

  await clearSessionCookie();

  return NextResponse.redirect(new URL(LOGIN_ROUTE, request.url));
}
