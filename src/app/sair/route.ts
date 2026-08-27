import { NextResponse } from "next/server";

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

  /*
   * ⚠️ VAI PARA A LANDING, NÃO PARA O LOGIN (pedido da cliente em 27/08/2026).
   *
   * Mandar para `/entrar` logo depois de sair parece que a saída não funcionou:
   * a pessoa clica em "Sair" e cai num formulário de entrar. A landing é a
   * porta de casa, e de lá o botão de login está à mão de quem quiser voltar.
   */
  return NextResponse.redirect(new URL("/", request.url));
}
