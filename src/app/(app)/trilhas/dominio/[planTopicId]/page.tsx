import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { MasteryExam } from "@/components/trails/mastery-exam";
import { Button } from "@/components/ui/button";
import { LOGIN_ROUTE } from "@/config/routes";
import { MASTERY_MIN_QUESTIONS, MASTERY_PASS_PERCENT } from "@/modules/trails/mastery";
import { getStudentContext } from "@/server/auth/current-user";
import { buildMasteryExam } from "@/server/engine/mastery";

export const metadata: Metadata = { title: "Comprovar domínio" };

export const dynamic = "force-dynamic";

/**
 * COMPROVAR DOMÍNIO (pedido da cliente em 02/09/2026).
 *
 * ⚠️ A PROVA É SORTEADA A CADA ABERTURA, e isso é o ponto.
 *
 * Refazer traz outras questões do mesmo assunto. Sem o sorteio, um aluno
 * reprovado decoraria as vinte e passaria na segunda tentativa sem ter
 * aprendido nada — e o assunto sairia da fila do algoritmo do mesmo jeito.
 */
export default async function ProvaDeDominioPage({
  params,
}: {
  params: Promise<{ planTopicId: string }>;
}) {
  const context = await getStudentContext();
  if (!context) redirect(LOGIN_ROUTE);

  const { planTopicId } = await params;

  const prova = await buildMasteryExam({
    userId: context.user.id,
    planTopicId,
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 pb-bottom-nav">
      <Link
        href="/trilhas"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4 shrink-0" aria-hidden />
        Trilhas
      </Link>

      {prova.ok ? (
        <>
          <header>
            <p className="text-eyebrow">Comprovar domínio</p>
            <h1 className="mt-2 text-xl font-bold text-pretty text-foreground">
              {prova.topicName}
            </h1>
            <p className="mt-2 text-sm text-pretty text-muted-foreground">
              {prova.questions.length} questões sorteadas deste assunto. Você só
              vê o resultado no fim, e precisa de {MASTERY_PASS_PERCENT}% de
              acerto para comprovar o domínio.
            </p>
          </header>

          <MasteryExam
            planTopicId={planTopicId}
            topicName={prova.topicName}
            questions={prova.questions}
          />
        </>
      ) : (
        <div className="flex flex-col items-start gap-4 rounded-xl border border-border bg-card p-6">
          <h1 className="text-lg font-bold text-foreground">
            {prova.reason === "nao_e_seu"
              ? "Assunto não encontrado"
              : "Ainda não dá para provar este assunto"}
          </h1>

          {/*
            ⚠️ O NÚMERO APARECE, e é o que torna o aviso útil.

            "Não há questões suficientes" sem número deixa o aluno sem saber se
            faltam duas ou duzentas. Ela também vai ler isto: é o sinal de qual
            assunto produzir primeiro.
          */}
          <p className="text-pretty text-muted-foreground">
            {prova.reason === "nao_e_seu"
              ? "Este assunto não faz parte das suas preparações."
              : prova.reason === "sem_assunto"
              ? "Este assunto ainda não está ligado ao nosso catálogo de questões."
              : `O acervo tem ${prova.available} ${
                  prova.available === 1 ? "questão" : "questões"
                } deste assunto, e a prova precisa de pelo menos ${MASTERY_MIN_QUESTIONS}. Uma amostra menor mediria sorte, não domínio.`}
          </p>

          {/*
            A frase de apoio só cabe quando o problema é acervo. Para um assunto
            que não é do aluno, prometer "mais questões em breve" seria responder
            outra pergunta.
          */}
          {prova.reason !== "nao_e_seu" ? (
            <p className="text-sm text-pretty text-muted-foreground">
              Estamos produzindo mais questões. Assim que houver volume, o botão
              aparece sozinho na trilha.
            </p>
          ) : null}

          <Button asChild variant="outline">
            <Link href="/trilhas">Voltar às trilhas</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
