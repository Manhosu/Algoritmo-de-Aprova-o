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

  return (
    <Surface className="p-6 sm:p-8">
      <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
        Entrar na sua conta
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Sua tarefa de hoje já está pronta.
      </p>

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
