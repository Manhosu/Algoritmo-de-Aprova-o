import { Check, CircleDashed, CircleDot, Crown } from "lucide-react";
import Link from "next/link";

import { Surface } from "@/components/shared/surface";
import { cn } from "@/lib/utils";
import type { Trail, TrailTopic } from "@/server/engine/trails";

/**
 * Uma disciplina da trilha, com os assuntos na ordem do edital.
 *
 * ⚠️ VEM FECHADA, e o `<details>` é nativo de propósito.
 *
 * Um edital tem entre 40 e 200 assuntos. Abertas todas, a tela vira uma parede
 * de texto em que ninguém acha nada — e o que o aluno quer ver primeiro é o
 * quanto falta em cada disciplina, não o nome de cada tópico. A disciplina com
 * algum progresso abre por padrão, porque é onde ele está.
 *
 * `<details>` em vez de estado React porque funciona sem JavaScript, já vem com
 * a semântica de expansível para o leitor de tela, e o navegador cuida da
 * animação. Não há nada aqui que justifique um componente de cliente.
 */
export function TrailSection({ trilha }: { trilha: Trail }) {
  const emAndamento = trilha.startedCount > 0 && trilha.masteredCount < trilha.topics.length;

  return (
    <Surface className="overflow-hidden">
      <details open={emAndamento}>
        <summary className="flex cursor-pointer list-none items-center gap-3 p-4 transition-colors hover:bg-background/40">
          <div className="min-w-0 flex-1">
            <p className="text-pretty font-semibold text-foreground">
              {trilha.subjectName}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {trilha.masteredCount} de {trilha.topics.length} dominados
            </p>

            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-background"
              role="presentation"
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${trilha.progressPercent}%` }}
              />
            </div>
          </div>

          <span className="text-metric shrink-0 text-sm text-primary">
            {trilha.progressPercent}%
          </span>
        </summary>

        <ol className="flex flex-col gap-0.5 border-t border-border px-4 py-3">
          {trilha.topics.map((assunto) => (
            <li key={assunto.planTopicId}>
              <TopicRow assunto={assunto} />
            </li>
          ))}
        </ol>
      </details>
    </Surface>
  );
}

const ESTADO = {
  not_started: {
    rotulo: "Não iniciado",
    icone: <CircleDashed />,
    cor: "text-muted-foreground",
  },
  in_progress: { rotulo: "Em andamento", icone: <CircleDot />, cor: "text-warning" },
  studied: { rotulo: "Estudado", icone: <Check />, cor: "text-primary" },
  mastered: { rotulo: "Dominado", icone: <Crown />, cor: "text-success" },
} as const;

function TopicRow({ assunto }: { assunto: TrailTopic }) {
  const estado = ESTADO[assunto.status];

  const conteudo = (
    <>
      <span className={cn("shrink-0 [&>svg]:size-4", estado.cor)} aria-hidden>
        {estado.icone}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-pretty text-sm text-foreground">{assunto.name}</span>
        <span className="block text-xs text-muted-foreground">
          {estado.rotulo}
          {assunto.questionsAnswered > 0
            ? ` · ${assunto.accuracyPercent}% de acerto em ${assunto.questionsAnswered}`
            : ""}
          {assunto.reviewsCompleted > 0
            ? ` · ${assunto.reviewsCompleted} ${assunto.reviewsCompleted === 1 ? "revisão" : "revisões"}`
            : ""}
        </span>
      </span>
    </>
  );

  /*
    Só vira link quando o assunto casou com o catálogo. Sem `topicSlug` não há
    questão para oferecer, e um link que leva a uma lista vazia é pior que
    nenhum link: o aluno conclui que a plataforma não tem conteúdo, quando o que
    houve foi um assunto do edital dele que ainda não entrou no acervo.
  */
  const classe = cn(
    "flex items-start gap-3 rounded-lg py-2",
    // A indentação mostra a árvore do edital sem precisar repetir o nome do pai.
    assunto.depth > 0 && "pl-4",
    assunto.depth > 1 && "pl-8",
  );

  if (!assunto.topicSlug) {
    return <div className={classe}>{conteudo}</div>;
  }

  return (
    <Link
      href={`/questoes?assunto=${assunto.topicSlug}`}
      className={cn(
        classe,
        "px-2 transition-colors hover:bg-background/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
      )}
    >
      {conteudo}
    </Link>
  );
}
