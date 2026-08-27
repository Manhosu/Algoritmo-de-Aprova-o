import type { Metadata } from "next";
import Link from "next/link";

import { RequestResetForm } from "@/components/account/account-forms";
import { Surface } from "@/components/shared/surface";

export const metadata: Metadata = {
  title: "Esqueci minha senha",
  description: "Receba um link para escolher uma senha nova.",
};

export default function ForgotPasswordPage() {
  return (
    <Surface glass className="p-6 sm:p-8">
      <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
        Esqueceu a senha?
      </h1>
      <p className="mt-1.5 text-sm text-pretty text-muted-foreground">
        Informe o e-mail da sua conta. Se houver uma, mandamos um link para você
        escolher uma senha nova.
      </p>

      <RequestResetForm />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Lembrou?{" "}
        <Link href="/entrar" className="font-medium text-primary hover:underline">
          Voltar para o login
        </Link>
      </p>
    </Surface>
  );
}
