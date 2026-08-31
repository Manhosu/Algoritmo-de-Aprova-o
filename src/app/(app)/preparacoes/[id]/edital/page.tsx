import { AlertTriangle, FileUp, Loader2, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EditalUploadForm } from "@/components/preparations/edital-upload-form";
import { EmptyState, Surface } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth/guards";
import { getEditalStatus } from "@/server/preparations/edital";

export const metadata: Metadata = { title: "Enviar o edital" };

/**
 * A leitura do edital roda em `after()`, dentro desta invocação. O limite
 * precisa cobrir o pior caso — um edital de duzentas páginas em horário de
 * pico. Cinco minutos é o teto do plano Pro da Vercel.
 */
export const maxDuration = 300;

/**
 * PASSO 2 DO FLUXO DO "+".
 *
 * A tela tem quatro estados, e o que muda entre eles é o que o aluno PODE
 * fazer:
 *
 *   • sem edital        → enviar
 *   • lendo             → esperar (com a página se atualizando sozinha)
 *   • falhou            → entender o motivo e reenviar
 *   • já leu            → seguir para a revisão do conteúdo
 *
 * O quarto caso não é redirecionamento automático de propósito: quem chega aqui
 * por link ou botão "voltar" precisa ver onde está, não ser jogado para outra
 * tela sem explicação.
 */
export default async function EditalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireUser(`/preparacoes/${id}/edital`);
  const status = await getEditalStatus(id, session.user.id);

  if (!status) notFound();

  if (status.status === "active" || status.status === "archived") {
    redirect("/inicio");
  }

  return (
    <div className="mx-auto w-full max-w-lg py-4">
      <div className="mb-6">
        <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          Passo 2 de 4
        </p>
        <h1 className="mt-1 text-2xl font-bold text-balance text-foreground">
          Envie o edital
        </h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          A IA lê o conteúdo programático e monta a base do seu plano. Você confere
          tudo no passo seguinte, antes de valer.
        </p>
      </div>

      {status.status === "extracting" ? (
        <Reading attempts={status.attempts} />
      ) : status.status === "review_pending" || status.status === "diagnosis_pending" ? (
        <Done preparationId={id} />
      ) : (
        <Surface className="p-5 sm:p-6">
          {status.status === "failed" && status.lastError ? (
            <div className="mb-5 flex gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
              <AlertTriangle className="size-5 shrink-0 text-warning" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  A leitura anterior não deu certo
                </p>
                <p className="mt-1 text-sm text-pretty text-muted-foreground">
                  {status.lastError}
                </p>

                {/*
                  ⚠️ A SEGUNDA SAÍDA, no lugar onde a pessoa está travada.

                  Sem ela, quem tem um PDF que a IA não lê só pode tentar o
                  mesmo arquivo de novo — e vai falhar de novo. A cliente pediu
                  o cadastro manual exatamente aqui.
                */}
                <Link
                  href={`/preparacoes/${id}/manual`}
                  className="mt-3 inline-block text-sm text-primary underline-offset-4 hover:underline"
                >
                  Cadastrar o edital à mão
                </Link>
              </div>
            </div>
          ) : null}

          <EditalUploadForm preparationId={id} retry={status.status === "failed"} />

          <p className="mt-5 flex items-start gap-2 text-xs text-pretty text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            Seu edital fica guardado na sua conta e é usado só para montar o seu plano
            de estudo. Você pode apagá-lo junto com a conta a qualquer momento.
          </p>
        </Surface>
      )}
    </div>
  );
}

/**
 * Leitura em andamento.
 *
 * A página se recarrega a cada 6 segundos. É deliberadamente simples: montar
 * WebSocket ou polling em JavaScript para um evento que acontece uma vez por
 * preparação seria caro demais para o ganho, e `meta refresh` funciona mesmo
 * com a aba em segundo plano no celular.
 */
function Reading({ attempts }: { attempts: number }) {
  return (
    <Surface glow>
      <meta httpEquiv="refresh" content="6" />
      <EmptyState
        icon={<Loader2 className="animate-spin" />}
        title="Lendo seu edital"
        description="A IA está identificando as disciplinas e os assuntos. Costuma levar menos de um minuto — pode deixar esta tela aberta."
        action={
          attempts > 1 ? (
            <p className="text-xs text-muted-foreground">Tentativa {attempts}</p>
          ) : null
        }
      />
    </Surface>
  );
}

function Done({ preparationId }: { preparationId: string }) {
  return (
    <Surface glow>
      <EmptyState
        icon={<FileUp />}
        title="Edital lido"
        description="O conteúdo programático já foi extraído. O próximo passo é conferir o que a IA entendeu e corrigir o que estiver errado."
        action={
          <Button asChild size="lg" className="mt-2">
            <Link href={`/preparacoes/${preparationId}/conteudo`}>Revisar o conteúdo</Link>
          </Button>
        }
      />
    </Surface>
  );
}
