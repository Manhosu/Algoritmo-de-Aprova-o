"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { eq } from "drizzle-orm";

import { requireApiUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import {
  changePassword,
  confirmEmailChange,
  requestAccountDeletion,
  requestEmailChange,
  requestPasswordReset,
  resetPassword,
} from "@/server/auth/account";
import { normalizeWhatsapp } from "@/server/auth/service";
import { clearSessionCookie } from "@/server/auth/session";

export type AccountFormState = {
  status: "idle" | "ok" | "error";
  message?: string;
  problems?: string[];
};

/*
 * ⚠️ ESTE ARQUIVO SÓ PODE EXPORTAR FUNÇÃO ASSÍNCRONA.
 *
 * Num arquivo `"use server"`, tudo que é exportado vira endpoint chamável pelo
 * cliente. Encontrando um objeto, o Next.js falha em RUNTIME com "A 'use
 * server' file can only export async functions, found object" e derruba a
 * PÁGINA INTEIRA, não só a ação.
 *
 * Havia aqui um `const IDLE` exportado. Ele deixou a tela de Configurações
 * respondendo erro de servidor em produção — trocar senha, trocar e-mail e
 * excluir conta paravam juntos. O `npm run build` passa: o defeito só aparece
 * quando alguém abre a página. E nem era usado, porque `account-forms.tsx`
 * declara o próprio estado inicial.
 */

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

/**
 * Liga ou desliga a exibição do primeiro nome no Ranking.
 *
 * ⚠️ É O DIREITO DE OPOSIÇÃO DO ART. 18 DA LGPD, em forma de botão.
 *
 * A cliente autorizou mostrar nomes e a Política 1.2 descreve a prática na
 * seção 3.1. Isso torna a exibição legítima, e não dispensa dar ao aluno como
 * sair dela. Sem esta ação, quem não quer o nome exposto teria de apagar a
 * conta.
 */
/**
 * Nome e WhatsApp, editáveis pelo próprio aluno (pedido da cliente em
 * 08/09/2026: "no Meu Perfil poderia ter a opção de editar nome e telefone").
 *
 * ⚠️ E-MAIL NÃO ENTRA AQUI, de propósito.
 *
 * Ele é a credencial de acesso e a chave de recuperação: trocá-lo exige senha
 * atual e confirmação no endereço novo, e esse fluxo já existe em Configurações.
 * Juntar os três campos num formulário só faria a troca de e-mail parecer tão
 * corriqueira quanto corrigir um sobrenome.
 */
export async function updateProfileAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const session = await requireApiUser();

  const nome = String(formData.get("name") ?? "").trim();
  const whatsappBruto = String(formData.get("whatsapp") ?? "").trim();

  if (nome.length < 2) {
    return { status: "error", message: "Informe seu nome." };
  }

  if (nome.length > 160) {
    return { status: "error", message: "O nome é longo demais." };
  }

  /*
    O banco guarda em E.164 e tem um CHECK que garante o formato. Normalizar
    aqui é o que permite ela digitar "(11) 99999-9999" como digita em qualquer
    outro lugar — exigir o formato do banco seria transferir a nossa restrição
    para quem preenche.
  */
  const whatsapp = normalizeWhatsapp(whatsappBruto);

  if (!whatsapp) {
    return { status: "error", message: "WhatsApp inválido. Use DDD e número." };
  }

  await db
    .update(users)
    .set({ name: nome, whatsapp, updatedAt: new Date() })
    .where(eq(users.id, session.user.id));

  /* O nome aparece no cabeçalho, no perfil e no ranking. */
  revalidatePath("/perfil");
  revalidatePath("/inicio");
  revalidatePath("/ranking");

  return { status: "ok", message: "Dados atualizados." };
}

export async function toggleRankingNameAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const session = await requireApiUser();

  const mostrar = formData.get("showNameInRanking") === "on";

  await db
    .update(users)
    .set({ showNameInRanking: mostrar, updatedAt: new Date() })
    .where(eq(users.id, session.user.id));

  /* O ranking é `force-dynamic`, mas o cache de rota guarda o HTML anterior. */
  revalidatePath("/ranking");
  revalidatePath("/configuracoes");

  return {
    status: "ok",
    message: mostrar
      ? "Seu primeiro nome aparece no Ranking."
      : "Você aparece como “Aluno” no Ranking.",
  };
}
