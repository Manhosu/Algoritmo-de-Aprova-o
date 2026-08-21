"use server";

import { redirect } from "next/navigation";

import { AFTER_ADMIN_LOGIN_REDIRECT, AFTER_LOGIN_REDIRECT } from "@/config/routes";
import { registerUser, signIn, type AuthFailure } from "@/server/auth/service";

/**
 * Server Actions de autenticação.
 *
 * ⚠️ TODA a validação e TODA a autorização acontecem aqui, no servidor. O que
 * existe no formulário do cliente é conveniência — `required` e `type="email"`
 * evitam uma ida e volta inútil, mas qualquer pessoa consegue enviar o
 * formulário direto, sem passar por eles.
 *
 * A documentação do Next.js 16 avisa que Server Functions escapam do matcher do
 * proxy. Por isso nada aqui depende dele.
 */

export type AuthFormState = {
  status: "idle" | "error";
  /** Erro do formulário inteiro (credencial inválida, falha de rede). */
  formError?: string;
  /** Erro por campo, para aparecer embaixo do campo certo. */
  fieldErrors?: Record<string, string>;
  /**
   * O que a pessoa digitou, MENOS a senha.
   *
   * Devolver isso é o que impede o formulário de esvaziar a cada erro — repetir
   * nome, e-mail e telefone porque a senha era fraca é o tipo de atrito que faz
   * a pessoa desistir na segunda tentativa.
   */
  values?: Record<string, string>;
};

/* ========================================================================== *
 * LOGIN
 * ========================================================================== */

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = String(formData.get("proximo") ?? "");

  const fieldErrors: Record<string, string> = {};
  if (!email) fieldErrors.email = "Informe seu e-mail.";
  if (!password) fieldErrors.password = "Informe sua senha.";

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", fieldErrors, values: { email } };
  }

  const result = await signIn({ email, password });

  if (!result.ok) {
    return {
      status: "error",
      formError: messageFor(result.reason),
      values: { email },
    };
  }

  // `redirect` lança por dentro — precisa ficar FORA de try/catch, senão o
  // fluxo de navegação é engolido como se fosse erro.
  redirect(safeRedirect(nextPath, result.user.role));
}

/* ========================================================================== *
 * CADASTRO
 * ========================================================================== */

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const whatsapp = String(formData.get("whatsapp") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const acceptedPrivacy = formData.get("privacidade") === "on";

  const values = { name, email, whatsapp };
  const fieldErrors: Record<string, string> = {};

  if (!name) fieldErrors.name = "Informe seu nome.";
  if (!email) fieldErrors.email = "Informe seu e-mail.";
  if (!whatsapp) fieldErrors.whatsapp = "Informe seu WhatsApp.";
  if (!password) fieldErrors.password = "Escolha uma senha.";

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", fieldErrors, values };
  }

  // O consentimento é exigência da LGPD e não pode ser marcado por padrão nem
  // presumido — por isso é checado aqui, e não só no atributo `required`.
  if (!acceptedPrivacy) {
    return {
      status: "error",
      formError: "É preciso aceitar a Política de Privacidade para criar a conta.",
      values,
    };
  }

  const result = await registerUser({ name, email, whatsapp, password });

  if (!result.ok) {
    return {
      status: "error",
      formError: result.fieldErrors ? undefined : messageFor(result.reason),
      fieldErrors: result.fieldErrors,
      values,
    };
  }

  redirect(AFTER_LOGIN_REDIRECT);
}

/* ========================================================================== *
 * APOIO
 * ========================================================================== */

function messageFor(reason: AuthFailure): string {
  switch (reason) {
    case "invalid_credentials":
      // Mensagem IDÊNTICA para e-mail inexistente e senha errada. Distinguir os
      // dois transformaria a tela de login num verificador de quem tem conta
      // na plataforma.
      return "E-mail ou senha incorretos.";
    case "email_taken":
      return "Já existe uma conta com este e-mail.";
    case "account_suspended":
      return "Esta conta está suspensa. Fale com o suporte.";
    case "google_only_account":
      return "Esta conta usa login com Google. Entre por lá, ou defina uma senha nas configurações.";
    case "rate_limited":
      return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
    case "weak_password":
      return "Escolha uma senha mais forte.";
    case "invalid_whatsapp":
      return "WhatsApp inválido. Use DDD e número, como (11) 99999-9999.";
    default:
      return "Não foi possível concluir. Tente novamente.";
  }
}

/**
 * Só aceita caminho interno como destino pós-login.
 *
 * Sem esta checagem, `?proximo=https://site-falso.com` transformaria a nossa
 * tela de login num trampolim de phishing: o link parece nosso, o login é
 * nosso, e o usuário termina em outro lugar já confiando.
 */
function safeRedirect(next: string, role: "student" | "admin"): string {
  const fallback = role === "admin" ? AFTER_ADMIN_LOGIN_REDIRECT : AFTER_LOGIN_REDIRECT;

  if (!next) return fallback;
  // Precisa começar com uma única barra: "//outro-site.com" é URL absoluta.
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  if (next.includes("\\")) return fallback;

  return next;
}
