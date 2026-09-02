"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { DailyLimit, QuestionView } from "@/server/questions/service";

import { QuestionCard } from "./question-card";

/**
 * A lista de questões e o contador do limite diário.
 *
 * O contador vive AQUI, no cliente, e não no servidor: ele muda a cada resposta,
 * e recarregar a página inteira a cada questão respondida seria uma tela
 * piscando o tempo todo. O número da carga inicial vem do servidor; daí em
 * diante o cliente desconta.
 *
 * ⚠️ Isto é só a exibição. Quem barra a resposta é o servidor, em
 * `answerQuestion` — a tela desabilitar os botões é conveniência, não regra.
 */
export function QuestionList({
  questions,
  limit,
  dailyTaskItemId,
}: {
  questions: QuestionView[];
  limit: DailyLimit;
  /** Item da Tarefa do Dia que trouxe o aluno, quando veio por lá. */
  dailyTaskItemId?: string | null;
}) {
  const [used, setUsed] = useState(limit.used);

  const remaining = limit.limit === null ? null : Math.max(0, limit.limit - used);
  const blocked = remaining !== null && remaining === 0;

  return (
    <div className="flex flex-col gap-4">
      {limit.limit !== null ? (
        <LimitBanner
          remaining={remaining ?? 0}
          limit={limit.limit}
          planCode={limit.planCode}
        />
      ) : null}

      {questions.map((question, index) => (
        <QuestionCard
          key={question.id}
          question={question}
          index={index}
          blocked={blocked && question.previousAttempt === null}
          dailyTaskItemId={dailyTaskItemId}
          /*
            ⚠️ NÃO RECARREGA A PÁGINA, e o comentário anterior aqui estava
            errado.

            Ele dizia que o `router.refresh()` atualizava o servidor "sem
            descartar o que já está na tela". Descartava: com "esconder questões
            resolvidas" ligado — que é o padrão — o servidor refazia a consulta,
            a questão recém-respondida saía do resultado e SUMIA antes de o
            aluno ler o comentário. A cliente relatou exatamente isso.

            O contador já é atualizado aqui do lado do cliente, que é a única
            coisa desta tela que depende da resposta. XP, sequência e Home se
            atualizam quando o aluno navegar até lá — e o recarregamento ainda
            custava um render inteiro da lista a cada questão.
          */
          onAnswered={() => setUsed((current) => current + 1)}
        />
      ))}
    </div>
  );
}

/**
 * O aviso do limite diário.
 *
 * Quando o teto é atingido, a mensagem diz o que ele JÁ FEZ, não o que perdeu.
 * "Você respondeu suas 10 de hoje" é um dia cumprido; "você atingiu o limite" é
 * uma porta fechada. O produto quer que ele volte amanhã.
 */
function LimitBanner({
  remaining,
  limit,
  planCode,
}: {
  remaining: number;
  limit: number;
  planCode: string;
}) {
  const reached = remaining === 0;
  const planLabel = planCode === "free" ? "Free" : planCode === "basic" ? "Intermediário" : planCode;

  return (
    <div
      className={
        reached
          ? "rounded-xl border border-primary/40 bg-primary-soft px-4 py-3"
          : "rounded-xl border border-border bg-surface/40 px-4 py-3"
      }
      role="status"
    >
      <p className="text-sm text-pretty text-muted-foreground">
        {reached ? (
          <>
            <strong className="font-medium text-foreground">
              Você respondeu suas {limit} questões de hoje.
            </strong>{" "}
            Amanhã liberam mais {limit}. Os comentários das que você já respondeu
            continuam abertos — no plano {planLabel}, o limite é por dia, não por
            conteúdo.
          </>
        ) : (
          <>
            <span className="text-metric text-foreground">{remaining}</span> de {limit}{" "}
            questões restantes hoje.
          </>
        )}
      </p>

      {reached ? (
        /*
          ⚠️ O CTA aparece SÓ no limite, e é um link comum.

          É o momento de maior intenção de assinar do produto inteiro: o aluno
          quer continuar e não pode. Mostrar "trocar de plano" antes disso seria
          vender para quem ainda está satisfeito.

          `Link` do Next navega no cliente, então a sessão não se perde — a
          cliente pediu explicitamente "SEM FAZER LOGOUT".
        */
        <Link
          href="/planos"
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Trocar de plano
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}
