import { FileText, LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Administração" };

/**
 * A porta da área administrativa.
 *
 * ⚠️ ELA EXISTE PORQUE O LOGIN JÁ MANDAVA PARA CÁ. `AFTER_ADMIN_LOGIN_REDIRECT`
 * aponta para `/admin` desde antes de haver qualquer página aqui: quem entrasse
 * como admin caía num 404 logo depois de digitar a senha certa. É o pior
 * primeiro contato possível com uma área nova — parece que a conta quebrou.
 *
 * Por enquanto tem uma seção só. A lista cresce conforme o painel do Marco 2
 * for saindo; o que não pode é ela voltar a não existir.
 */
export const dynamic = "force-dynamic";

const SECOES = [
  {
    href: "/admin/textos",
    icon: <FileText />,
    titulo: "Textos do site",
    descricao:
      "A página inicial inteira: título, chamadas, os quatro passos e os botões. Publica na hora.",
  },
];

export default async function AdminPage() {
  const session = await requireAdmin();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <header>
        <p className="text-eyebrow">Administração</p>
        {/* `name` é anulável: a anonimização da LGPD o apaga e a conta continua. */}
        <h1 className="mt-2 text-2xl font-bold text-foreground">
          {session.user.name ? `Olá, ${session.user.name.split(" ")[0]}` : "Painel"}
        </h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          O que você pode editar sem depender de ninguém.
        </p>
      </header>

      <ul className="flex flex-col gap-3">
        {SECOES.map((secao) => (
          <li key={secao.href}>
            <Link
              href={secao.href}
              className="lift neon-hover flex items-start gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background/60 text-primary [&>svg]:size-5"
                aria-hidden
              >
                {secao.icon}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">{secao.titulo}</span>
                <span className="mt-1 block text-sm text-pretty text-muted-foreground">
                  {secao.descricao}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LayoutDashboard className="size-4 shrink-0" aria-hidden />
        <Link href="/inicio" className="text-primary underline-offset-4 hover:underline">
          Ir para a área de estudo
        </Link>
      </p>
    </div>
  );
}
