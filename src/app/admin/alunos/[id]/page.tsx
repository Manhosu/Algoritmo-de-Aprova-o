import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MetricGrid } from "@/components/admin/funnel";
import { StudentSchedule } from "@/components/admin/student-schedule";
import { PlanOverrideForm } from "@/components/admin/plan-override-form";
import { listAssignablePlans } from "@/server/admin/plan-override";
import { requireAdmin } from "@/server/auth/guards";
import { getStudentProfile } from "@/server/admin/student-detail";
import { getSchedule } from "@/server/engine/schedule";
import { getHomeData } from "@/server/home/dashboard";

export const metadata: Metadata = { title: "Aluno" };

export const dynamic = "force-dynamic";

/** Nomes em pt-BR do enum `study_technique`. */
const TECNICA: Record<string, string> = {
  reading: "Leitura",
  video: "Videoaula",
  mindx: "Mind-X",
  flashcard: "Flashcards",
  mind_map: "Mapa mental",
  summary: "Resumo",
  audio: "Áudio",
  questions: "Questões",
  other: "Outro",
};

const ROTULO_STATUS: Record<string, string> = {
  active: "Ativa",
  suspended: "Suspensa",
  anonymized: "Anonimizada",
};

/**
 * DASHBOARD DO ALUNO — VISÃO ADMINISTRATIVA (pedido de 02/09/2026).
 *
 * Palavras da cliente: "preciso conseguir visualizar praticamente tudo que o
 * próprio aluno consegue visualizar na Dashboard dele", com o cronograma
 * marcado como "muito importante" — é por ele que ela sabe quais assuntos vêm
 * nas próximas tarefas e consegue produzir material e questões na ordem certa.
 *
 * ⚠️ CHAMA AS MESMAS FUNÇÕES DA TELA DO ALUNO, com o id dele.
 *
 * `getHomeData` e `getSchedule` são as que a Home e o Cronograma usam. Reescrevê-las
 * aqui criaria duas implementações de "cobertura do edital" e de "índice de
 * preparação" — que divergiriam no primeiro ajuste e fariam o painel
 * contradizer a tela do aluno sem ninguém perceber.
 *
 * ⚠️ E ISTO É DADO PESSOAL DE OUTRA PESSOA. A rota é `requireAdmin`; nada aqui
 * aparece para aluno nenhum.
 */
export default async function AlunoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const perfil = await getStudentProfile(id);
  if (!perfil) notFound();

  /*
    Métricas e cronograma só existem com preparação ativa. Um aluno recém
    cadastrado tem ficha e nada mais — e a tela precisa dizer isso em vez de
    mostrar zeros que parecem desempenho ruim.
  */
  const planosDisponiveis = await listAssignablePlans();

  const [home, cronograma] = perfil.preparation
    ? await Promise.all([
        getHomeData({ userId: perfil.id, preparationId: perfil.preparation.id }),
        getSchedule({ userId: perfil.id, preparationId: perfil.preparation.id }),
      ])
    : [null, null];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <Link
        href="/admin/alunos"
        className="flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Todos os alunos
      </Link>

      <header>
        <p className="text-eyebrow">Aluno</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">
          {perfil.name ?? "Conta anonimizada"}
        </h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          {perfil.preparation
            ? `${perfil.preparation.title ?? perfil.preparation.targetPosition}${
                perfil.preparation.institution ? ` · ${perfil.preparation.institution}` : ""
              }`
            : "Ainda não criou uma preparação."}
        </p>
      </header>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">Cadastro</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <Dado rotulo="E-mail" valor={perfil.email} copiavel />
          <Dado rotulo="WhatsApp" valor={perfil.whatsapp} copiavel />
          <Dado rotulo="Plano" valor={perfil.planName ?? "Sem assinatura"} />
          <Dado
            rotulo="Status da conta"
            valor={ROTULO_STATUS[perfil.status] ?? perfil.status}
          />
          <Dado
            rotulo="Cadastrado em"
            valor={perfil.createdAt.toLocaleDateString("pt-BR")}
          />
          <Dado
            rotulo="Data da prova"
            valor={
              perfil.preparation?.examDate
                ? formatarData(perfil.preparation.examDate)
                : "Não informada"
            }
          />
        </dl>

        {/*
          A troca manual de plano (pedido da cliente em 04/09/2026: liberar
          Premium para a irmã sem cobrança). Fica no bloco do Cadastro porque é
          onde o plano atual aparece, e nasce fechada: é a única ação do painel
          que concede acesso pago de graça.
        */}
        <div className="mt-4 border-t border-border pt-4">
          <PlanOverrideForm
            userId={perfil.id}
            currentPlanName={perfil.planName}
            plans={planosDisponiveis}
          />
        </div>
      </section>

      {!home ? (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          As métricas aparecem quando o aluno tiver uma preparação ativa.
        </p>
      ) : (
        <>
          <MetricGrid
            itens={[
              { rotulo: "XP total", valor: home.stats.totalXp },
              { rotulo: "Moedas", valor: home.stats.coinBalance },
              { rotulo: "Sequência", valor: home.stats.currentStreak },
              {
                rotulo: "Índice de preparação",
                valor: home.preparationIndex?.value ?? null,
              },
              { rotulo: "Cobertura", valor: home.coverage.percent, sufixo: "%" },
              { rotulo: "Questões", valor: home.stats.questionsAnswered },
              /*
                ⚠️ ACERVO É MÉTRICA DA CLIENTE, não do aluno, e por isso está
                aqui também.

                Os outros números medem o que ESTE aluno fez. Este mede o que
                NÓS entregamos a ele: quanto do edital dele já tem questão, mapa,
                flashcard e resumo. É o número que diz para quem produzir material
                primeiro, que foi o motivo de esta tela existir.
              */
              {
                rotulo: "Acervo pronto",
                valor: home.catalogReadiness.totalPairs > 0
                  ? home.catalogReadiness.availablePercent
                  : null,
                sufixo: "%",
              },
            ]}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="min-w-0 rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold text-foreground">Desempenho por disciplina</h2>
              {home.subjects.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Ainda não respondeu questões suficientes.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2 text-sm">
                  {home.subjects.map((materia) => (
                    <li key={materia.name} className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 text-pretty text-foreground">
                        {materia.name}
                      </span>
                      <span className="text-metric shrink-0 text-muted-foreground">
                        {materia.accuracyPercent}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="min-w-0 rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold text-foreground">Onde ele mais erra</h2>
              {home.gaps.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Nenhuma lacuna com amostra suficiente ainda.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2 text-sm">
                  {home.gaps.map((lacuna) => (
                    <li key={lacuna.topicName} className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 text-pretty text-foreground">
                        {lacuna.topicName}
                      </span>
                      <span className="text-metric shrink-0 text-destructive">
                        {lacuna.errorPercent}% de erro
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="min-w-0 rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold text-foreground">Horário de ouro</h2>
              <p className="mt-3 text-pretty text-sm text-muted-foreground">
                {/*
                  ⚠️ `isReliable` é o que decide, não a presença do número. A
                  métrica exige 30 respostas: abaixo disso, apontar um "horário
                  de ouro" é chute com cara de dado.
                */}
                {home.goldenHour.isReliable ? (
                  <>
                    <span className="text-metric text-foreground">
                      {home.goldenHour.startHour}h–{home.goldenHour.endHour}h
                    </span>{" "}
                    · {home.goldenHour.accuracyPercent}% de acerto em{" "}
                    {home.goldenHour.sampleSize} questões
                  </>
                ) : (
                  <>
                    Ainda medindo — {home.goldenHour.sampleSize} de 30 respostas
                    necessárias.
                  </>
                )}
              </p>
            </section>

            <section className="min-w-0 rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold text-foreground">Melhor técnica</h2>
              <p className="mt-3 text-pretty text-sm text-muted-foreground">
                {home.bestTechnique.isReliable && home.bestTechnique.technique ? (
                  <>
                    <span className="text-foreground">
                      {TECNICA[home.bestTechnique.technique] ??
                        home.bestTechnique.technique}
                    </span>{" "}
                    · {home.bestTechnique.accuracyPercent}% em{" "}
                    {home.bestTechnique.sampleSize} questões
                  </>
                ) : (
                  "Ainda medindo — precisa de mais estudos comparáveis."
                )}
              </p>
            </section>
          </div>

          {/*
            ⚠️ O CRONOGRAMA É O ITEM QUE ELA MARCOU COMO "MUITO IMPORTANTE".
            É por ele que a operação sabe quais assuntos entram nas próximas
            tarefas de cada aluno, e consegue produzir material e questões nessa
            ordem em vez de adivinhar.
          */}
          {cronograma ? <StudentSchedule cronograma={cronograma} /> : null}
        </>
      )}
    </div>
  );
}

function Dado({
  rotulo,
  valor,
  copiavel = false,
}: {
  rotulo: string;
  valor: string | null;
  copiavel?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="shrink-0 text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 flex-1 truncate text-right text-foreground sm:text-left">
        {valor ? (
          /*
            E-mail e WhatsApp viram link de contatar — é para isso que a cliente
            pediu os dois. Um texto que ela teria que selecionar e copiar à mão
            desperdiça o motivo de o campo estar aqui.
          */
          copiavel && rotulo === "E-mail" ? (
            <a
              href={`mailto:${valor}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {valor}
            </a>
          ) : copiavel && rotulo === "WhatsApp" ? (
            <a
              href={`https://wa.me/${valor.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              {valor}
            </a>
          ) : (
            valor
          )
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </dd>
    </div>
  );
}

/** "2026-11-15" → "15/11/2026", sem passar por `new Date` e mudar de dia. */
function formatarData(data: string): string {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}
