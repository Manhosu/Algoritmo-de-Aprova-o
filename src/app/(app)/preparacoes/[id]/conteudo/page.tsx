import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ContentReviewForm } from "@/components/preparations/content-review-form";
import { Surface } from "@/components/shared/surface";
import { requireUser } from "@/server/auth/guards";
import { getPlanContent } from "@/server/preparations/content";

export const metadata: Metadata = { title: "Revisar o conteúdo" };

/**
 * PASSO 3 DO FLUXO DO "+": conferência do conteúdo programático.
 *
 * README 1.4: o aluno corrige, apaga e acrescenta itens, e preenche o peso onde
 * o edital não informou. É o único momento em que uma pessoa olha para o plano
 * inteiro antes de o algoritmo passar a decidir em cima dele.
 */
export default async function ContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireUser(`/preparacoes/${id}/conteudo`);
  const content = await getPlanContent(id, session.user.id);

  if (!content) notFound();

  // Sem conteúdo extraído não há o que revisar — o passo anterior não terminou.
  if (content.subjects.length === 0) redirect(`/preparacoes/${id}/edital`);

  const { summary } = content;
  const acervoPercent =
    summary.topics === 0
      ? 0
      : Math.round((summary.withQuestions / summary.topics) * 100);

  return (
    <div className="mx-auto w-full max-w-2xl py-4">
      <div className="mb-5">
        <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          Passo 3 de 4
        </p>
        <h1 className="mt-1 text-2xl font-bold text-balance text-foreground">
          Confira o que a IA leu
        </h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          Corrija o que estiver errado, apague o que não cai no seu cargo e
          acrescente o que faltou. É esta lista que o algoritmo passa a usar.
        </p>
      </div>

      <Surface className="mb-4 grid grid-cols-3 divide-x divide-border py-4">
        <Stat value={String(summary.subjects)} label="Disciplinas" />
        <Stat value={String(summary.topics)} label="Assuntos" />
        <Stat value={`${acervoPercent}%`} label="Com questões" />
      </Surface>

      {/*
        ⚠️ O AVISO MAIS IMPORTANTE DESTA TELA.

        Quando o cargo digitado não existe no edital, a IA usa o mais parecido
        (é o que o prompt manda, e é melhor que falhar por causa de um erro de
        digitação). Só que antes ela fazia isso calada: a cliente digitou um
        cargo inexistente, recebeu o conteúdo de outro e concluiu que o sistema
        tinha misturado editais.

        Fica ANTES da lista, e não no fim, porque quem vê o conteúdo errado
        primeiro já começou a corrigir assunto por assunto.
      */}
      {content.positionMismatch ? (
        <div className="mb-4 rounded-xl border border-warning/50 bg-warning/10 px-4 py-3">
          <p className="text-sm text-pretty text-foreground">
            <strong className="font-semibold">
              Não encontramos “{content.targetPosition}” neste edital.
            </strong>{" "}
            O conteúdo abaixo é do cargo{" "}
            <strong className="font-semibold">{content.positionMismatch.used}</strong>.
          </p>

          {content.positionMismatch.available.length > 0 ? (
            <p className="mt-2 text-sm text-pretty text-muted-foreground">
              Os cargos deste edital são: {content.positionMismatch.available.join(" · ")}.
            </p>
          ) : null}

          <p className="mt-2 text-sm text-pretty text-muted-foreground">
            Se o seu cargo for outro, corrija em{" "}
            <Link href="/preparacoes" className="text-primary underline underline-offset-2">
              Minhas preparações
            </Link>{" "}
            e envie o edital de novo.
          </p>
        </div>
      ) : null}

      {summary.withoutWeight > 0 ? (
        <p className="mb-4 rounded-xl border border-border bg-surface/40 px-4 py-3 text-sm text-pretty text-muted-foreground">
          <strong className="font-medium text-foreground">
            {summary.withoutWeight} {summary.withoutWeight === 1 ? "assunto" : "assuntos"}{" "}
            sem peso.
          </strong>{" "}
          Seu edital não informou quantas questões cada tema tem. Se você souber,
          preencha — o algoritmo dá mais espaço ao que cai mais. Em branco, ele trata
          todos por igual.
        </p>
      ) : null}

      <ContentReviewForm content={content} />
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-2 text-center">
      <span className="text-metric text-xl text-foreground">{value}</span>
      <span className="text-[0.65rem] leading-tight font-semibold tracking-[0.1em] text-muted-foreground uppercase">
        {label}
      </span>
    </div>
  );
}
