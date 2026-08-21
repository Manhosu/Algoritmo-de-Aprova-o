"use client";

import { Loader2, LogIn } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { Field, FormError } from "./field";
import { GoogleButton } from "./google-button";
import { loginAction, type AuthFormState } from "./actions";

const INITIAL: AuthFormState = { status: "idle" };

/**
 * Formulário de login.
 *
 * Usa `useActionState` com Server Action: o formulário funciona mesmo antes de
 * o JavaScript carregar, e o estado de erro volta do servidor sem precisar de
 * uma rota de API separada.
 *
 * ⚠️ A validação de verdade é do lado do servidor. O que existe aqui é
 * conveniência — `required` e `type="email"` evitam uma ida e volta inútil,
 * mas não são segurança: qualquer pessoa pode enviar o formulário direto.
 */
export function LoginForm({
  nextPath,
  googleEnabled,
}: {
  nextPath?: string;
  googleEnabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL);

  return (
    <div className="mt-6 flex flex-col gap-5">
      {googleEnabled ? (
        <>
          <GoogleButton label="Entrar com Google" nextPath={nextPath} />
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" aria-hidden />
            <span className="text-xs text-muted-foreground uppercase">ou</span>
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>
        </>
      ) : null}

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        {nextPath ? <input type="hidden" name="proximo" value={nextPath} /> : null}

        {state.status === "error" && state.formError ? (
          <FormError>{state.formError}</FormError>
        ) : null}

        <Field
          label="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state.values?.email}
          error={state.status === "error" ? state.fieldErrors?.email : null}
        />

        <div className="flex flex-col gap-1.5">
          <Field
            label="Senha"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            error={state.status === "error" ? state.fieldErrors?.password : null}
          />
          <Link
            href="/recuperar-senha"
            className="self-end text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Esqueci minha senha
          </Link>
        </div>

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              Entrando…
            </>
          ) : (
            <>
              <LogIn aria-hidden />
              Entrar
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
