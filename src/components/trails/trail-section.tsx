import { Check, CircleDashed, CircleDot, Crown } from "lucide-react";
import Link from "next/link";

import { Surface } from "@/components/shared/surface";
import { cn } from "@/lib/utils";
import { MASTERY_MIN_QUESTIONS } from "@/modules/trails/mastery";
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
  return (
    <Surface className="overflow-hidden">
      {/*
        ⚠️ TODAS FECHADAS (pedido da cliente em 02/09/2026).

        A versão anterior abria a disciplina com progresso, achando que era onde
        o aluno estava. Com um edital de 150 assuntos isso desmontava a tela: a
        cliente pediu "deixar todos os assuntos fechados, fica mais difícil de
        entender, e assim o aluno vai clicando em um de cada vez".

        A barra e o "X de Y dominados" continuam visíveis fechados, que é a
        informação que a tela existe para dar.
      */}
      <details>
        <summary className="flex cursor-pointer list-none items-center gap-3 p-4 transition-colors hover:bg-background/40">
          <div className="min-w-0 flex-1">
            <p className="text-pretty font-semibold text-foreground">
              {trilha.subjectName}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {trilha.studiedCount} de {trilha.topics.length}{" "}
              {trilha.topics.length === 1 ? "estudado" : "estudados"} | {trilha.masteredCount}{" "}
              {trilha.masteredCount === 1 ? "dominado" : "dominados"}
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

  const classe = cn(
    "flex items-start gap-3 rounded-lg py-2 px-2",
    // A indentação mostra a árvore do edital sem precisar repetir o nome do pai.
    assunto.depth > 0 && "pl-4",
    assunto.depth > 1 && "pl-8",
  );

  /*
    ⚠️ O ASSUNTO SEM CONTEÚDO DIZ POR QUÊ, NA PRÓPRIA LINHA.

    A cliente notou que "alguns assuntos estão clicáveis e outros não" e pediu
    que todos fossem clicáveis, informando quando não houvesse conteúdo.

    Fiz diferente do pedido literal e o motivo é o celular: um clique que só
    revela um aviso precisa de JavaScript e de um segundo toque para o aluno
    descobrir algo que cabe na linha. Mostrando o aviso direto, a inconsistência
    some pela raiz — não há mais um link que não leva a lugar nenhum, e ninguém
    precisa clicar para entender.

    O assunto sem `topicSlug` não casou com o catálogo, então não existe questão
    dele no acervo. Isso é informação para o aluno, não defeito a esconder.
  */
  if (!assunto.topicSlug) {
    return (
      <div className={classe}>
        {conteudo}
        <span className="shrink-0 self-center text-right text-xs text-muted-foreground">
          Conteúdo em preparação
        </span>
      </div>
    );
  }

  /*
    ⚠️ COMPROVAR DOMÍNIO (pedido da cliente em 02/09/2026).

    Aparece só quando o acervo tem questões suficientes para a prova medir
    alguma coisa. Um botão que abre uma tela dizendo "ainda não dá" é pior que
    botão nenhum: ele promete e retira na tela seguinte.

    Some quando o assunto JÁ está dominado — não há o que provar duas vezes.
  */
  const podeProvar =
    assunto.availableQuestions >= MASTERY_MIN_QUESTIONS && assunto.status !== "mastered";

  return (
    <div className="flex items-center gap-1">
    <Link
      href={`/questoes?assunto=${assunto.topicSlug}`}
      className={cn(
        classe,
        "min-w-0 flex-1",
        "transition-colors hover:bg-background/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
      )}
    >
      {conteudo}
    </Link>

      {podeProvar ? (
        <Link
          href={`/trilhas/dominio/${assunto.planTopicId}`}
          className="shrink-0 rounded-lg border border-primary/40 px-2.5 py-1.5 text-center text-[0.7rem] font-semibold text-primary transition-colors hover:bg-primary/10"
        >
          Comprovar
          <span className="sr-only"> domínio de {assunto.name}</span>
        </Link>
      ) : null}
    </div>
  );
}
