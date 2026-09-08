import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { MindXPlayer } from "@/components/mindx/mindx-player";
import { Button } from "@/components/ui/button";
import { LOGIN_ROUTE } from "@/config/routes";
import { getStudentContext } from "@/server/auth/current-user";
import { getMindXFeed } from "@/server/engine/mindx";

export const metadata: Metadata = { title: "Mind-X" };

export const dynamic = "force-dynamic";

/**
 * MIND-X — dicas rápidas do mascote (pedido da cliente em 04/09/2026).
 *
 * ⚠️ O ESTADO VAZIO É O ESTADO MAIS PROVÁVEL HOJE, e por isso ele foi escrito
 * com cuidado.
 *
 * O acervo tem 1% de cobertura e nenhum vídeo cadastrado. Um feed que abre
 * preto e não toca nada faria a cliente concluir que o recurso quebrou, no
 * primeiro dia em que ela o abrisse. A tela diz o que falta e a quem pedir.
 */
export default async function MindXPage() {
  const context = await getStudentContext();
  if (!context) redirect(LOGIN_ROUTE);

  if (!context.currentPreparation) {
    /*
      Sem edital não há lacuna nem recorte: o feed inteiro depende do plano de
      estudo. Mandar para o cadastro é a única coisa útil a fazer aqui.
    */
    redirect("/preparacoes/nova");
  }

  const feed = await getMindXFeed({
    userId: context.user.id,
    preparationId: context.currentPreparation.id,
  });

  if (feed.items.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5 px-4 py-16 text-center">
        <Sparkles className="size-11 text-primary" aria-hidden />

        <h1 className="text-xl font-bold text-balance text-foreground">
          O Mind-X ainda não tem vídeo para você
        </h1>

        <p className="text-pretty text-muted-foreground">
          {feed.totalInPlan === 0
            ? "Assim que houver vídeos dos assuntos do seu edital, eles aparecem aqui, começando pelos que você mais erra."
            : "Você já viu todos os vídeos disponíveis hoje. Eles voltam amanhã, e os novos entram assim que forem publicados."}
        </p>

        <Button asChild size="lg">
          <Link href="/inicio">Voltar aos estudos</Link>
        </Button>
      </div>
    );
  }

  return <MindXPlayer items={feed.items} />;
}
