import type { Metadata } from "next";
import Link from "next/link";

import { CopyForm } from "@/components/admin/copy-form";
import { CopyHistory } from "@/components/admin/copy-history";
import { APP_TIMEZONE } from "@/config/app";
import { requireAdmin } from "@/server/auth/guards";
import { getLandingCopy, getLandingHistory } from "@/server/content/landing";

export const metadata: Metadata = { title: "Textos do site" };

/**
 * Onde a cliente edita a copy da página inicial.
 *
 * POR QUE UMA TELA, E NÃO UM ARQUIVO NO GITHUB
 * ----------------------------------------------------------------------------
 * A primeira ideia foi tirar a copy para um repositório separado que ela
 * editaria pelo GitHub. Funcionaria, e cobraria dela uma conta no GitHub, um
 * convite, e a espera de um deploy a cada frase trocada — para alguém que só
 * quer testar títulos.
 *
 * Aqui ela entra com a conta que já tem, muda o texto e vê no site em segundos.
 * E o acesso não passa nem perto do código.
 *
 * ⚠️ A LEITURA É SEMPRE A VERSÃO VIGENTE, não o texto de fábrica. Carregar o
 * formulário do arquivo faria com que publicar depois de uma edição anterior
 * desfizesse a anterior sem avisar.
 */
export const dynamic = "force-dynamic";

export default async function TextosPage() {
  await requireAdmin();

  const [copy, historico] = await Promise.all([getLandingCopy(), getLandingHistory()]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Textos do site</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          Tudo que aparece na página inicial. Mude o que quiser e clique em
          publicar — o site atualiza em alguns segundos.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          <Link href="/" className="text-primary underline-offset-4 hover:underline">
            Ver a página inicial
          </Link>
        </p>
      </header>

      {/*
        A data é formatada AQUI, no servidor, e atravessa como string.
        Mandar `Date` para um componente de cliente e formatar lá dá data
        diferente entre o HTML gerado e o que o navegador desenha, porque os
        dois estão em fusos diferentes — e o React reclama de hidratação.
      */}
      <CopyHistory
        versoes={historico.map((versao) => ({
          ...versao,
          createdAt: versao.createdAt.toLocaleDateString("pt-BR", {
            timeZone: APP_TIMEZONE,
          }),
        }))}
      />

      <CopyForm inicial={copy} />
    </div>
  );
}
