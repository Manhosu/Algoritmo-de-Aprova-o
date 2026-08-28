"use client";

import { Loader2, ShieldAlert } from "lucide-react";
import { useActionState, useState } from "react";

import { Field, FormError } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import { PASSWORD_HINT } from "@/config/app";

import {
  changeEmailAction,
  changePasswordAction,
  deleteAccountAction,
  requestResetAction,
  resetPasswordAction,
  type AccountFormState,
} from "./actions";

const IDLE: AccountFormState = { status: "idle" };

/** Mensagem de sucesso e de erro num componente só, para não divergirem. */
function Feedback({ state }: { state: AccountFormState }) {
  if (state.status === "idle") return null;

  if (state.status === "error") {
    return (
      <div>
        <FormError>{state.message}</FormError>
        {state.problems && state.problems.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1 pl-4">
            {state.problems.map((problem) => (
              <li key={problem} className="list-disc text-xs text-muted-foreground">
                {problem}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <p
      className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-pretty text-foreground"
      role="status"
    >
      {state.message}
    </p>
  );
}

function Submit({ pending, label }: { pending: boolean; label: string }) {
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          Salvando…
        </>
      ) : (
        label
      )}
    </Button>
  );
}

/* ========================================================================== *
 * ESQUECI MINHA SENHA
 * ========================================================================== */

export function RequestResetForm() {
  const [state, formAction, pending] = useActionState(requestResetAction, IDLE);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4" noValidate>
      <Feedback state={state} />

      {/* Some com o formulário depois do envio: reenviar não adianta nada, e o
          botão ali convida a tentar de novo achando que falhou. */}
      {state.status !== "ok" ? (
        <>
          <Field
            label="E-mail"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            hint="Enviamos um link para você escolher uma senha nova."
          />
          <Submit pending={pending} label="Enviar link de recuperação" />
        </>
      ) : null}
    </form>
  );
}

/* ========================================================================== *
 * REDEFINIR SENHA
 * ========================================================================== */

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, IDLE);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <Feedback state={state} />

      <Field
        label="Nova senha"
        name="senha"
        type="password"
        autoComplete="new-password"
        required
        hint={PASSWORD_HINT}
      />

      <Submit pending={pending} label="Salvar nova senha" />

      <p className="text-center text-xs text-pretty text-muted-foreground">
        Ao salvar, todos os aparelhos onde você estava logado são desconectados.
      </p>
    </form>
  );
}

/* ========================================================================== *
 * TROCAR SENHA
 * ========================================================================== */

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, IDLE);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Feedback state={state} />

      {/* A senha atual é exigida mesmo com sessão válida: um notebook aberto na
          padaria não prova que quem está ali é o dono da conta. */}
      <Field
        label="Senha atual"
        name="senhaAtual"
        type="password"
        autoComplete="current-password"
        required
      />
      <Field
        label="Nova senha"
        name="senhaNova"
        type="password"
        autoComplete="new-password"
        required
        hint={PASSWORD_HINT}
      />

      <Submit pending={pending} label="Alterar senha" />
    </form>
  );
}

/* ========================================================================== *
 * TROCAR E-MAIL
 * ========================================================================== */

export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, formAction, pending] = useActionState(changeEmailAction, IDLE);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Feedback state={state} />

      <p className="text-sm text-muted-foreground">
        E-mail atual: <span className="text-foreground">{currentEmail}</span>
      </p>

      <Field
        label="Novo e-mail"
        name="emailNovo"
        type="email"
        inputMode="email"
        required
        hint="Enviamos um link de confirmação para o endereço novo."
      />
      <Field
        label="Sua senha"
        name="senhaAtual"
        type="password"
        autoComplete="current-password"
        required
      />

      <Submit pending={pending} label="Trocar e-mail" />
    </form>
  );
}

/* ========================================================================== *
 * EXCLUIR CONTA
 * ========================================================================== */

/**
 * Exclusão de conta.
 *
 * A confirmação em dois passos existe para separar impulso de decisão. Não é
 * atrito gratuito: o botão só aparece depois de a pessoa dizer que quer, e o
 * texto diz exatamente o que acontece e como desistir.
 */
export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState(deleteAccountAction, IDLE);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-pretty text-muted-foreground">
          Seus dados pessoais são removidos de forma definitiva. Seu histórico de
          estudo deixa de ser ligado a você e continua apenas como número nas
          estatísticas gerais, sem nada que identifique quem estudou.
        </p>
        <Button variant="outline" onClick={() => setConfirming(true)} className="self-start">
          Quero excluir minha conta
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Feedback state={state} />

      <div className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        <p className="text-sm text-pretty text-muted-foreground">
          A exclusão acontece <strong className="text-foreground">7 dias</strong> depois
          do pedido. Até lá, basta entrar na plataforma para cancelar — o simples
          acesso já interrompe. Depois disso não há como recuperar.
        </p>
      </div>

      <Field
        label="Sua senha"
        name="senhaAtual"
        type="password"
        autoComplete="current-password"
        required
      />
      <Field
        label="Por que está saindo? (opcional)"
        name="motivo"
        hint="Ajuda a melhorar a plataforma. Não é obrigatório."
      />

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => setConfirming(false)}
        >
          Cancelar
        </Button>
        <Button type="submit" variant="destructive" className="flex-1" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              Enviando…
            </>
          ) : (
            "Confirmar exclusão"
          )}
        </Button>
      </div>
    </form>
  );
}
