"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireApiUser } from "@/server/auth/guards";
import {
  changePassword,
  confirmEmailChange,
  requestAccountDeletion,
  requestEmailChange,
  requestPasswordReset,
  resetPassword,
} from "@/server/auth/account";
import { clearSessionCookie } from "@/server/auth/session";

export type AccountFormState = {
  status: "idle" | "ok" | "error";
  message?: string;
  problems?: string[];
};

const IDLE: AccountFormState = { status: "idle" };

/* ========================================================================== *
 * RECUPERAÇÃO DE SENHA
 * ========================================================================== */

/**
 * ⚠️ A resposta é a MESMA exista a conta ou não.
 *
 * Um formulário que diz "e-mail não encontrado" é uma lista de clientes aberta
 * para qualquer um enumerar — e num produto de concurso público, saber quem
 * está estudando para qual cargo tem valor para terceiros.
 */
export async function requestResetAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email.includes("@")) {
    return { status: "error", message: "Informe um e-mail válido." };
  }

  await requestPasswordReset({ email });

  return {
    status: "ok",
    message:
      "Se houver uma conta com esse e-mail, o link de recuperação já está a caminho. " +
      "Ele vale por 1 hora.",
  };
}

export async function resetPasswordAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const token = String(formData.get("token") ?? "");
  const senha = String(formData.get("senha") ?? "");

  const result = await resetPassword({ token, newPassword: senha });

  if (!result.ok) {
    if (result.reason === "weak_password") {
      return { status: "error", message: "Escolha uma senha mais forte.", problems: result.problems };
    }
    return {
      status: "error",
      message:
        "Este link não vale mais. Ele expira em 1 hora e só pode ser usado uma vez — " +
        "peça um novo na tela de recuperação.",
    };
  }

  redirect("/entrar?senha=redefinida");
}

/* ========================================================================== *
 * CONTA (aluno logado)
 * ========================================================================== */

export async function changePasswordAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const session = await requireApiUser();

  const result = await changePassword({
    userId: session.user.id,
    currentSessionId: session.sessionId,
    currentPassword: String(formData.get("senhaAtual") ?? ""),
    newPassword: String(formData.get("senhaNova") ?? ""),
  });

  if (!result.ok) {
    return result.reason === "weak_password"
      ? { status: "error", message: "Escolha uma senha mais forte.", problems: result.problems }
      : { status: "error", message: "A senha atual não confere." };
  }

  revalidatePath("/configuracoes");
  return {
    status: "ok",
    message: "Senha alterada. Os outros aparelhos onde você estava logado foram desconectados.",
  };
}

export async function changeEmailAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const session = await requireApiUser();

  const result = await requestEmailChange({
    userId: session.user.id,
    newEmail: String(formData.get("emailNovo") ?? ""),
    currentPassword: String(formData.get("senhaAtual") ?? ""),
  });

  if (!result.ok) {
    const messages = {
      wrong_password: "A senha não confere.",
      email_taken: "Este e-mail já está em uso por outra conta.",
      same_email: "Este já é o seu e-mail atual.",
    } as const;

    return { status: "error", message: messages[result.reason] };
  }

  return {
    status: "ok",
    message:
      "Enviamos um link de confirmação para o endereço novo. Até você confirmar, " +
      "o acesso continua pelo e-mail atual.",
  };
}

export async function deleteAccountAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const session = await requireApiUser();

  const result = await requestAccountDeletion({
    userId: session.user.id,
    currentPassword: String(formData.get("senhaAtual") ?? ""),
    reason: String(formData.get("motivo") ?? "").trim() || null,
  });

  if (!result.ok) {
    return {
      status: "error",
      message:
        result.reason === "already_requested"
          ? "Já existe um pedido de exclusão em andamento."
          : "A senha não confere.",
    };
  }

  // A sessão já foi revogada no banco; o cookie precisa ir junto, senão o
  // navegador continuaria mandando um token morto a cada requisição.
  await clearSessionCookie();
  redirect("/?conta=excluida");
}

export { IDLE };

/* ========================================================================== *
 * CONFIRMAÇÃO DE E-MAIL
 * ========================================================================== */

export async function confirmEmailAction(token: string): Promise<AccountFormState> {
  const result = await confirmEmailChange({ token });

  if (!result.ok) {
    return {
      status: "error",
      message:
        result.reason === "email_taken"
          ? "Este e-mail passou a ser usado por outra conta enquanto você não confirmava."
          : "Este link não vale mais. Peça a troca de novo em Configurações.",
    };
  }

  return { status: "ok", message: result.email };
}
