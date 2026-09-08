"use client";

import { Loader2, ShieldAlert } from "lucide-react";
import { useActionState, useState, useTransition } from "react";

import { Field, FormError } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import { PASSWORD_HINT } from "@/config/app";

import {
  changeEmailAction,
  changePasswordAction,
  deleteAccountAction,
  requestResetAction,
  resetPasswordAction,
  toggleRankingNameAction,
  updateProfileAction,
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
 * MEUS DADOS
 * ========================================================================== */

/**
 * Nome e WhatsApp (pedido da cliente em 08/09/2026).
 *
 * ⚠️ A AÇÃO É CHAMADA DE DENTRO DO `onSubmit`, e não por `action={}`.
 *
 * O React 19 limpa um formulário que ele governa pelo `action` assim que a ação
 * termina — inclusive quando ela termina RECUSANDO. Num formulário de EDIÇÃO o
 * efeito é pior que num de cadastro: os campos não ficam vazios, voltam ao valor
 * ANTIGO. A pessoa corrige o telefone, o servidor recusa por um dígito a menos,
 * e a tela mostra o telefone velho como se ela nunca tivesse digitado.
 */
export function ProfileForm({
  name,
  whatsapp,
}: {
  name: string | null;
  whatsapp: string | null;
}) {
  const [state, dispatch] = useActionState(updateProfileAction, IDLE);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(evento) => {
        evento.preventDefault();
        const dados = new FormData(evento.currentTarget);
        startTransition(() => dispatch(dados));
      }}
      className="flex flex-col gap-4"
    >
      <Field
        id="profile-name"
        name="name"
        label="Nome"
        autoComplete="name"
        defaultValue={name ?? ""}
        required
      />

      <Field
        id="profile-whatsapp"
        name="whatsapp"
        label="WhatsApp"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        /*
          O banco guarda "+5511999999999" e a tela mostra "(11) 99999-9999".
          Devolver o formato do banco no campo faria parecer que ela precisa
          digitar assim.
        */
        defaultValue={formatWhatsapp(whatsapp)}
        hint="Com DDD. Usamos para contato e suporte."
        required
      />

      <Feedback state={state} />

      <Submit pending={pending} label="Salvar dados" />
    </form>
  );
}

/** "+5511999999999" vira "(11) 99999-9999". */
function formatWhatsapp(valor: string | null): string {
  if (!valor) return "";

  const digitos = valor.replace(/\D/g, "").replace(/^55/, "");

  if (digitos.length === 11) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  }

  if (digitos.length === 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  }

  return valor;
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

/**
 * A chave de exibição do nome no Ranking.
 *
 * ⚠️ SALVA NA HORA DE MARCAR, sem botão "salvar".
 *
 * Uma preferência de privacidade com botão separado tem um estado intermediário
 * em que a tela mostra uma coisa e o banco guarda outra. O aluno desmarca,
 * fecha a página achando que resolveu, e o nome continua lá.
 */
export function RankingNameForm({ enabled }: { enabled: boolean }) {
  const [state, formAction] = useActionState(toggleRankingNameAction, IDLE);
  const [pending, startTransition] = useTransition();

  return (
    <form className="flex flex-col gap-3">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="showNameInRanking"
          defaultChecked={enabled}
          disabled={pending}
          onChange={(evento) => {
            const dados = new FormData();
            if (evento.target.checked) dados.set("showNameInRanking", "on");
            startTransition(() => formAction(dados));
          }}
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">
            Aparecer com meu nome no Ranking
          </span>
          <span className="block text-xs text-pretty text-muted-foreground">
            Os outros alunos veem seu primeiro nome ao lado da sua posição.
            Desligado, você aparece como “Aluno” e sua posição continua contando.
          </span>
        </span>
      </label>

      <Feedback state={state} />
    </form>
  );
}
