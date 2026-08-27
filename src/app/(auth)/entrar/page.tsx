import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { Surface } from "@/components/shared/surface";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesse sua conta e veja a tarefa de hoje.",
};

export default async function LoginPage(props: PageProps<"/entrar">) {
  const params = await props.searchParams;
  const next = typeof params.proximo === "string" ? params.proximo : undefined;
  const passwordReset = params.senha === "redefinida";

  return (
    <Surface glass className="p-6 sm:p-8">
      <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
        Entrar na sua conta
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Sua tarefa de hoje já está pronta.
      </p>

      {/* Confirma o que acabou de acontecer. Sem isso, quem redefiniu a senha
          cai numa tela de login idêntica à anterior e não sabe se funcionou. */}
      {passwordReset ? (
        <p
          className="mt-4 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-pretty text-foreground"
          role="status"
        >
          Senha alterada. Entre com a nova.
        </p>
      ) : null}

      <LoginForm nextPath={next} />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link href="/cadastrar" className="font-medium text-primary hover:underline">
          Criar conta grátis
        </Link>
      </p>
    </Surface>
  );
}
