import type { Metadata } from "next";
import Link from "next/link";

import { RegisterForm } from "@/components/auth/register-form";
import { Surface } from "@/components/shared/surface";

export const metadata: Metadata = {
  title: "Criar conta",
  description: "Crie sua conta grátis e monte seu plano de estudo a partir do edital.",
};

export default function RegisterPage() {
  return (
    <Surface className="p-6 sm:p-8">
      <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
        Criar sua conta
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Grátis para começar. Não pedimos cartão.
      </p>

      <RegisterForm />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-medium text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </Surface>
  );
}
