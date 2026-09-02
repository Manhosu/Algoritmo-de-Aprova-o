import { Mail, MessageSquare, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SectionTitle, Surface } from "@/components/shared/surface";
import { SUPPORT_EMAIL } from "@/config/app";
import { LOGIN_ROUTE } from "@/config/routes";
import { getStudentContext } from "@/server/auth/current-user";

export const metadata: Metadata = {
  title: "Feedback & Suporte",
  description: "Como falar com a equipe e o que fazer com os seus dados.",
};

/**
 * FEEDBACK & SUPORTE — item do menu do avatar.
 *
 * ⚠️ É UM CANAL, NÃO UM FORMULÁRIO, e a escolha é deliberada.
 *
 * Um formulário aqui exigiria fila, notificação para a equipe e uma promessa de
 * resposta que ninguém ainda se comprometeu a cumprir. Mensagem que cai numa
 * tabela sem alguém do outro lado é pior que não ter formulário: o aluno acha
 * que pediu ajuda.
 *
 * O e-mail chega a uma caixa que existe hoje. Quando houver equipe e prazo de
 * resposta acordado, a tabela `support_tickets` já está modelada.
 */
export const dynamic = "force-dynamic";

export default async function SuportePage() {
  const context = await getStudentContext();
  if (!context) redirect(LOGIN_ROUTE);

  /*
    O assunto do e-mail já vem preenchido com a conta.

    Sem isso, a primeira resposta da equipe é sempre "qual é o seu e-mail de
    cadastro?" — uma ida e volta inteira para uma informação que o navegador já
    tem em mãos.
  */
  const assunto = encodeURIComponent("Suporte — O Algoritmo da Aprovação");
  const corpo = encodeURIComponent(
    `\n\n---\nConta: ${context.user.email ?? "(sem e-mail)"}\n`,
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <MessageSquare className="size-5 shrink-0 text-primary" aria-hidden />
          Feedback &amp; Suporte
        </h1>
        <p className="mt-2 text-pretty text-sm text-muted-foreground">
          Achou um erro, tem uma sugestão ou algo não funcionou? Escreva para a
          gente.
        </p>
      </header>

      <Surface className="flex flex-col gap-3 p-5">
        <SectionTitle icon={<Mail className="size-4" />}>Fale com a equipe</SectionTitle>

        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=${assunto}&body=${corpo}`}
          className="text-metric text-primary underline-offset-4 hover:underline"
        >
          {SUPPORT_EMAIL}
        </a>

        <p className="text-pretty text-sm text-muted-foreground">
          Se for sobre um erro na plataforma, conte o que você estava fazendo e o
          que aconteceu. Isso costuma bastar para a gente reproduzir.
        </p>
      </Surface>

      <Surface className="flex flex-col gap-3 p-5">
        <SectionTitle icon={<ShieldCheck className="size-4" />}>
          Seus dados
        </SectionTitle>

        {/*
          ⚠️ Esta seção não é cortesia: a LGPD exige que o titular saiba como
          exercer os direitos dele, e o caminho precisa estar acessível de dentro
          do produto — não só escrito na política.
        */}
        <p className="text-pretty text-sm text-muted-foreground">
          Você pode corrigir seus dados, trocar o e-mail e pedir a exclusão da
          conta a qualquer momento, sem falar com ninguém.
        </p>

        <div className="flex flex-wrap gap-4 text-sm">
          <Link
            href="/configuracoes"
            className="text-primary underline-offset-4 hover:underline"
          >
            Configurações da conta
          </Link>
          <Link
            href="/politica-de-privacidade"
            className="text-primary underline-offset-4 hover:underline"
          >
            Política de Privacidade
          </Link>
          <Link
            href="/termos-de-uso"
            className="text-primary underline-offset-4 hover:underline"
          >
            Termos de Uso
          </Link>
        </div>
      </Surface>
    </div>
  );
}
