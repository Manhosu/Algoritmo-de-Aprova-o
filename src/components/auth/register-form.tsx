"use client";

import { Loader2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

import { registerAction, type AuthFormState } from "./actions";
import { Field, FormError } from "./field";

const INITIAL: AuthFormState = { status: "idle" };

/**
 * Cadastro.
 *
 * Os três campos obrigatórios do README 1.2 — nome, e-mail e WhatsApp — mais
 * senha e o consentimento da LGPD.
 *
 * O QUE **NÃO** ESTÁ AQUI, DE PROPÓSITO
 * ----------------------------------------------------------------------------
 * 1. Tempo de estudo e dias da semana. A cliente pediu esses campos "no
 *    cadastro do perfil", e a decisão foi capturá-los logo DEPOIS da conta
 *    existir, como primeiro passo do onboarding. É a tela onde mais se perde
 *    gente, e cada campo a mais aqui custa conversão.
 *
 * 2. Login com Google. Foi decidido, implementado no banco e depois RETIRADO a
 *    pedido da cliente em 21/08/2026: o Google não entrega telefone, e ela
 *    quer garantir o WhatsApp de todo mundo que entra. O e-mail e a senha
 *    passam a ser o único caminho.
 */
export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, INITIAL);
  const errors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <div className="mt-6 flex flex-col gap-5">
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        {state.status === "error" && state.formError ? (
          <FormError>{state.formError}</FormError>
        ) : null}

        <Field
          label="Nome completo"
          name="name"
          autoComplete="name"
          required
          defaultValue={state.values?.name}
          error={errors?.name}
        />

        <Field
          label="E-mail"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
          error={errors?.email}
        />

        <Field
          label="WhatsApp"
          name="whatsapp"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 99999-9999"
          required
          defaultValue={state.values?.whatsapp}
          hint="Usamos apenas para contato e suporte."
          error={errors?.whatsapp}
        />

        <Field
          label="Senha"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hint="Pelo menos 10 caracteres. Uma frase é mais segura e mais fácil de lembrar."
          error={errors?.password}
        />

        <div className="flex items-start gap-2.5 pt-1">
          <Checkbox id="privacidade" name="privacidade" className="mt-0.5" />
          <Label
            htmlFor="privacidade"
            className="text-sm leading-snug font-normal text-muted-foreground"
          >
            Li e aceito a{" "}
            <Link
              href="/politica-de-privacidade"
              target="_blank"
              className="text-primary hover:underline"
            >
              Política de Privacidade
            </Link>{" "}
            e os{" "}
            <Link href="/termos-de-uso" target="_blank" className="text-primary hover:underline">
              Termos de Uso
            </Link>
            .
          </Label>
        </div>

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              Criando conta…
            </>
          ) : (
            <>
              <UserPlus aria-hidden />
              Criar minha conta
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
