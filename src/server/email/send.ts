import "server-only";

import { Resend } from "resend";

import { env, isProduction } from "@/config/env";

/**
 * ENVIO DE E-MAIL TRANSACIONAL.
 * ============================================================================
 *
 * Dois drivers, escolhidos pelo ambiente:
 *
 *   • Resend, quando RESEND_API_KEY existe.
 *   • Log no terminal, quando não existe — com o LINK COMPLETO impresso.
 *
 * O driver de log não é preguiça: sem ele, testar recuperação de senha em
 * desenvolvimento exigiria uma conta de e-mail e uma chave de API por
 * desenvolvedor. Com ele, o link aparece no terminal e o fluxo inteiro roda
 * offline.
 *
 * ⚠️ Em produção a chave é obrigatória (`config/env` recusa subir sem ela).
 * Um "esqueci minha senha" que registra no log do servidor em vez de mandar o
 * e-mail é uma conta perdida com aparência de sucesso.
 */

export type EmailResult = { ok: true; id: string | null } | { ok: false; error: string };

export type SendEmailInput = {
  to: string;
  subject: string;
  /** Corpo em texto puro. Obrigatório — nem todo cliente renderiza HTML. */
  text: string;
  html?: string;
};

export async function sendEmail(input: SendEmailInput): Promise<EmailResult> {
  if (!env.RESEND_API_KEY) {
    if (isProduction) {
      return {
        ok: false,
        error: "RESEND_API_KEY não configurada. Nenhum e-mail foi enviado.",
      };
    }

    console.log(
      [
        "",
        "┌─ E-MAIL (driver de log — RESEND_API_KEY não configurada) ─────────",
        `│ para:    ${input.to}`,
        `│ assunto: ${input.subject}`,
        "│",
        ...input.text.split("\n").map((line) => `│ ${line}`),
        "└──────────────────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );

    return { ok: true, id: null };
  }

  try {
    const resend = new Resend(env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
    });

    if (result.error) {
      return { ok: false, error: result.error.message };
    }

    return { ok: true, id: result.data?.id ?? null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Falha ao enviar o e-mail.",
    };
  }
}

/* ========================================================================== *
 * MODELOS
 * ========================================================================== */

/**
 * Os textos ficam aqui, não espalhados pelos serviços.
 *
 * São a voz do produto num momento delicado — quem recebe um destes está
 * travado ou preocupado. Todos evitam duas coisas: jargão técnico e urgência
 * artificial ("aja agora ou perca o acesso"), que é o tom de e-mail de golpe e
 * treina o aluno a clicar sem ler.
 */

const SIGNATURE = "\n\n—\nO Algoritmo da Aprovação";

export function passwordResetEmail(link: string, expiresInMinutes: number) {
  return {
    subject: "Recuperar sua senha",
    text:
      "Você pediu para redefinir sua senha.\n\n" +
      `Abra este link para escolher uma nova: ${link}\n\n` +
      `Ele vale por ${expiresInMinutes} minutos e só pode ser usado uma vez.\n\n` +
      "Se não foi você que pediu, ignore esta mensagem. Sua senha atual continua valendo." +
      SIGNATURE,
  };
}

export function emailChangeEmail(link: string, expiresInHours: number) {
  return {
    subject: "Confirme seu novo e-mail",
    text:
      "Você pediu para trocar o e-mail da sua conta.\n\n" +
      `Confirme por este link: ${link}\n\n` +
      `Ele vale por ${expiresInHours} horas.\n\n` +
      "Enquanto você não confirmar, seu e-mail antigo continua sendo o de acesso." +
      SIGNATURE,
  };
}

/**
 * ⚠️ Enviado ao endereço ANTIGO, e é por isso que existe.
 *
 * Quem invade uma conta troca o e-mail primeiro. Sem este aviso, o dono só
 * descobriria ao tentar entrar — quando já não tem como recuperar. Com ele, a
 * pessoa é avisada no endereço que ainda controla, enquanto ainda dá tempo.
 */
export function emailChangeNoticeEmail(newEmail: string) {
  return {
    subject: "Pedido de troca de e-mail na sua conta",
    text:
      `Foi solicitada a troca do e-mail da sua conta para ${newEmail}.\n\n` +
      "Se foi você, não precisa fazer nada: basta confirmar no endereço novo.\n\n" +
      "Se NÃO foi você, entre na sua conta e troque a senha agora. Enquanto você " +
      "não confirmar no endereço novo, o acesso continua sendo por este e-mail." +
      SIGNATURE,
  };
}

export function passwordChangedEmail() {
  return {
    subject: "Sua senha foi alterada",
    text:
      "A senha da sua conta foi alterada agora há pouco, e todas as outras sessões " +
      "foram encerradas.\n\n" +
      "Se não foi você, use o \"Esqueci minha senha\" para recuperar o acesso " +
      "imediatamente." +
      SIGNATURE,
  };
}

export function accountDeletionScheduledEmail(scheduledFor: Date) {
  const date = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(scheduledFor);

  return {
    subject: "Sua conta será excluída",
    text:
      `Recebemos seu pedido de exclusão. Sua conta será apagada em ${date}.\n\n` +
      "Até lá, é só entrar na plataforma para cancelar — o simples acesso já " +
      "interrompe a exclusão.\n\n" +
      "Depois dessa data, seus dados pessoais são removidos de forma definitiva e " +
      "não há como recuperá-los." +
      SIGNATURE,
  };
}
