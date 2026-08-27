import { CheckCircle2, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Surface } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import { confirmEmailChange } from "@/server/auth/account";

export const metadata: Metadata = { title: "Confirmar e-mail" };

/**
 * Confirmação da troca de e-mail.
 *
 * A confirmação acontece na abertura da página, e aqui isso é aceitável: o
 * token só troca o endereço para o que a própria pessoa pediu, e ela precisa
 * clicar no link recebido NO ENDEREÇO NOVO para chegar até aqui. Não há ação
 * destrutiva que uma pré-visualização de link possa causar.
 */
export default async function ConfirmEmailPage(props: PageProps<"/confirmar-email">) {
  const params = await props.searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  const result = token ? await confirmEmailChange({ token }) : null;

  if (result?.ok) {
    return (
      <Surface glass className="p-6 text-center sm:p-8">
        <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold text-foreground">E-mail confirmado</h1>
        <p className="mt-1.5 text-sm text-pretty text-muted-foreground">
          Sua conta agora usa <span className="text-foreground">{result.email}</span>.
          Entre de novo com o endereço novo.
        </p>
        <Button asChild size="lg" className="mt-6 w-full">
          <Link href="/entrar">Entrar</Link>
        </Button>
      </Surface>
    );
  }

  return (
    <Surface className="p-6 text-center sm:p-8">
      <XCircle className="mx-auto size-10 text-destructive" aria-hidden />
      <h1 className="mt-4 text-xl font-semibold text-foreground">Link inválido</h1>
      <p className="mt-1.5 text-sm text-pretty text-muted-foreground">
        {result?.ok === false && result.reason === "email_taken"
          ? "Este e-mail passou a ser usado por outra conta enquanto você não confirmava."
          : "Este link expirou ou já foi usado. Peça a troca de novo em Configurações."}
      </p>
      <Button asChild variant="outline" size="lg" className="mt-6 w-full">
        <Link href="/configuracoes">Ir para Configurações</Link>
      </Button>
    </Surface>
  );
}
