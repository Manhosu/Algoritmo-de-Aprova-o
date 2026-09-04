import { Route } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TrailSection } from "@/components/trails/trail-section";
import { PendingStep } from "@/components/shared/pending-step";
import { EmptyState, Surface } from "@/components/shared/surface";
import { LOGIN_ROUTE } from "@/config/routes";
import { nextStep } from "@/modules/onboarding/next-step";
import { getStudentContext } from "@/server/auth/current-user";
import { getTrails, summarize } from "@/server/engine/trails";

export const metadata: Metadata = {
  title: "Trilhas",
  description: "O seu edital inteiro, disciplina por disciplina, e onde você está nele.",
};

/**
 * TRILHAS (README 2.4) — os percursos de estudo.
 *
 * ⚠️ NÃO É O CRONOGRAMA, e a diferença justifica as duas telas existirem.
 *
 * O Cronograma responde "o que fazer hoje" e muda todo dia, porque o motor
 * repriorizar é o trabalho dele. A Trilha responde "onde eu estou no edital" e é
 * estável: a ordem é a do edital, não a da prioridade. Quem abre o cronograma
 * três dias seguidos vê três listas diferentes e não consegue dizer se avançou.
 */
export const dynamic = "force-dynamic";

export default async function TrilhasPage() {
  const context = await getStudentContext();
  if (!context) redirect(LOGIN_ROUTE);

  const pendente = nextStep(context.currentPreparation);
  if (pendente) {
    return (
      <div className="mx-auto w-full max-w-2xl py-4">
        <PendingStep step={pendente} />
      </div>
    );
  }

  const trilhas = await getTrails(context.currentPreparation!.id);
  const total = summarize(trilhas);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <Route className="size-5 shrink-0 text-primary" aria-hidden />
          Trilhas
        </h1>
        <p className="mt-2 text-pretty text-sm text-muted-foreground">
          O seu edital inteiro, na ordem em que ele vem. Aqui você vê o caminho
          todo; o cronograma diz por onde andar hoje.
        </p>
      </header>

      {/*
        ⚠️ A LEGENDA DO CICLO (pergunta da cliente em 02/09/2026).

        Ela perguntou: "quando um assunto é estudado, ele sai do cronograma?" e
        "alguns sinais parecem considerar informações que deixam de fazer
        sentido depois que o assunto já foi estudado".

        A resposta estava correta no código e em lugar nenhum na tela. Os quatro
        estados já apareciam ao lado de cada assunto; o que faltava era dizer o
        que move um para o próximo — e por que estudar uma vez não basta para o
        assunto sair da fila.
      */}
      <details className="rounded-xl border border-border bg-card">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground">
          Como um assunto avança até sair do cronograma
        </summary>

        <ol className="flex flex-col gap-2 border-t border-border px-4 py-3 text-sm">
          <li className="text-pretty text-muted-foreground">
            <strong className="text-foreground">Não iniciado</strong> — ainda não
            entrou em nenhuma Tarefa do Dia.
          </li>
          <li className="text-pretty text-muted-foreground">
            <strong className="text-warning">Em andamento</strong> — você estudou
            pelo menos uma vez. O assunto continua no cronograma: uma leitura não
            é aprendizado, e é a revisão espaçada que fixa.
          </li>
          <li className="text-pretty text-muted-foreground">
            <strong className="text-primary">Estudado</strong> — você já fez ao
            menos uma revisão dele.
          </li>
          <li className="text-pretty text-muted-foreground">
            <strong className="text-success">Dominado</strong> — três revisões
            concluídas, ou prova de domínio aprovada. Só aqui o assunto sai da
            fila e deixa de aparecer no cronograma.
          </li>
        </ol>

        <p className="border-t border-border px-4 py-3 text-xs text-pretty text-muted-foreground">
          Enquanto isso, o algoritmo continua reordenando: quanto mais recente o
          seu contato com um assunto, mais para trás ele vai. Ele não some, mas
          para de disputar as primeiras posições do dia.
        </p>
      </details>

      {trilhas.length === 0 ? (
        <EmptyState
          title="Nenhuma disciplina no plano"
          description="Assim que o conteúdo do seu edital for confirmado, as trilhas aparecem aqui."
        />
      ) : (
        <>
          <Surface className="flex items-center gap-4 p-5">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-pretty text-muted-foreground">
                {total.mastered} de {total.topics}{" "}
                {total.topics === 1 ? "assunto dominado" : "assuntos dominados"}
              </p>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-background"
                role="presentation"
              >
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${total.percent}%` }}
                />
              </div>
              {/*
                A mesma explicação do card de Cobertura da Home. Sem ela, "0 de
                18 dominados" ao lado de "35%" parece contradição — e foi
                exatamente a leitura que a cliente teve na primeira versão.
              */}
              <p className="mt-2 text-xs text-pretty text-muted-foreground">
                Assunto em andamento conta meio ponto, por isso a barra anda
                antes de haver assunto dominado.
              </p>
            </div>

            <span className="text-metric shrink-0 text-2xl text-primary">
              {total.percent}%
            </span>
          </Surface>

          <ul className="flex flex-col gap-3">
            {trilhas.map((trilha) => (
              <li key={trilha.planSubjectId}>
                <TrailSection trilha={trilha} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
