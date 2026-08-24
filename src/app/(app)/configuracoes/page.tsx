import { AlertTriangle, KeyRound, Mail, Trash2, User } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ChangeEmailForm,
  ChangePasswordForm,
  DeleteAccountForm,
} from "@/components/account/account-forms";
import { SectionTitle, Surface } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import { LOGIN_ROUTE } from "@/config/routes";
import { getPendingDeletion } from "@/server/auth/account";
import { getStudentContext } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Configurações" };

/**
 * CONFIGURAÇÕES DA CONTA — item 12 do checklist de aceite.
 *
 * Alteração de senha, alteração de e-mail e exclusão de conta, mais o acesso à
 * disponibilidade de estudo (que muda o cronograma e por isso vive aqui, não
 * escondida no onboarding).
 */
export default async function SettingsPage() {
  const context = await getStudentContext();
  if (!context) redirect(LOGIN_ROUTE);

  const pendingDeletion = await getPendingDeletion(context.user.id);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 py-4">
      <header>
        <h1 className="text-xl font-bold text-foreground">Configurações</h1>
      </header>

      {/*
        Se há exclusão pendente, ela vem PRIMEIRO e diz como desistir. Enterrar
        esse aviso no fim da página seria esconder do aluno a informação mais
        importante que a tela tem para ele hoje.
      */}
      {pendingDeletion ? (
        <Surface className="border-warning/40 bg-warning/5 p-4 sm:p-5">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                Sua conta será excluída em {formatDate(pendingDeletion.scheduledFor)}
              </p>
              <p className="mt-1 text-sm text-pretty text-muted-foreground">
                Você já cancelou ao entrar agora — este aviso some no próximo acesso.
                Se quiser mesmo sair, é só refazer o pedido abaixo.
              </p>
            </div>
          </div>
        </Surface>
      ) : null}

      <Surface className="p-4 sm:p-5">
        <SectionTitle icon={<User className="size-4" />}>Seus dados</SectionTitle>
        <dl className="mt-4 flex flex-col gap-3 text-sm">
          <Row label="Nome" value={context.user.name ?? "—"} />
          <Row label="E-mail" value={context.user.email ?? "—"} />
        </dl>

        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/boas-vindas?editar=1">Ajustar meu tempo de estudo</Link>
        </Button>
      </Surface>

      <Surface className="p-4 sm:p-5">
        <SectionTitle icon={<KeyRound className="size-4" />}>Trocar senha</SectionTitle>
        <div className="mt-4">
          <ChangePasswordForm />
        </div>
      </Surface>

      <Surface className="p-4 sm:p-5">
        <SectionTitle icon={<Mail className="size-4" />}>Trocar e-mail</SectionTitle>
        <div className="mt-4">
          <ChangeEmailForm currentEmail={context.user.email ?? ""} />
        </div>
      </Surface>

      <Surface className="border-destructive/30 p-4 sm:p-5">
        <SectionTitle icon={<Trash2 className="size-4" />}>Excluir conta</SectionTitle>
        <div className="mt-4">
          <DeleteAccountForm />
        </div>
      </Surface>

      <p className="text-center text-xs text-muted-foreground">
        <Link href="/politica-de-privacidade" className="hover:underline">
          Política de Privacidade
        </Link>
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-foreground">{value}</dd>
    </div>
  );
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}
