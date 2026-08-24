import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "@/components/account/account-forms";
import { Surface } from "@/components/shared/surface";

export const metadata: Metadata = { title: "Escolher nova senha" };

/**
 * O token vem na URL, do link do e-mail.
 *
 * Ele NÃO é validado aqui, de propósito: validar na abertura da página
 * significaria consumir a checagem numa pré-visualização de link — vários
 * clientes de e-mail e antivírus corporativos abrem os links da mensagem antes
 * do usuário. A validação acontece no envio do formulário, que é uma ação
 * deliberada de quem está na tela.
 */
export default async function ResetPasswordPage(props: PageProps<"/redefinir-senha">) {
  const params = await props.searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  if (!token) {
    return (
      <Surface className="p-6 sm:p-8">
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
          Link incompleto
        </h1>
        <p className="mt-1.5 text-sm text-pretty text-muted-foreground">
          Abra o link direto do e-mail que você recebeu. Se ele não funcionar mais,
          peça um novo.
        </p>
        <p className="mt-6 text-center text-sm">
          <Link href="/recuperar-senha" className="font-medium text-primary hover:underline">
            Pedir um novo link
          </Link>
        </p>
      </Surface>
    );
  }

  return (
    <Surface className="p-6 sm:p-8">
      <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
        Escolha uma senha nova
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Ela passa a valer imediatamente.
      </p>

      <ResetPasswordForm token={token} />
    </Surface>
  );
}
