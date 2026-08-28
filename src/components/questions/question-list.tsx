"use client";

import { useRouter } from "next/navigation";
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
  const router = useRouter();
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
          onAnswered={() => {
            setUsed((current) => current + 1);
            // Atualiza a Home e o contador do servidor sem descartar o que já
            // está na tela: o aluno continua vendo os comentários que abriu.
            router.refresh();
          }}
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
    </div>
  );
}
