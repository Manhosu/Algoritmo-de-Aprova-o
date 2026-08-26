import {
  ArrowRight,
  Brain,
  CalendarClock,
  ClipboardCheck,
  FileUp,
  RefreshCw,
  Target,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { StickyCta } from "@/components/marketing/sticky-cta";
import { Button } from "@/components/ui/button";
import { APP_DESCRIPTION, APP_TAGLINE } from "@/config/app";
import { socialMetadata } from "@/lib/metadata";

export const metadata: Metadata = {
  title: "Estude o que importa, na ordem certa",
  description: APP_DESCRIPTION,
  // ⚠️ `socialMetadata` e não um `openGraph` à mão — ver a nota em lib/metadata.
  ...socialMetadata({
    title: "Pare de decidir o que estudar. Comece a estudar.",
    path: "/",
  }),
};

/**
 * Landing page pública (README 1.3).
 *
 * A tarefa dela é comunicar o DIFERENCIAL, não listar recursos: o aluno não
 * monta o próprio planejamento — o sistema monta e reajusta conforme o
 * desempenho real. Uma landing que abrisse com "banco de questões comentadas"
 * venderia o produto errado, porque é isso que todo concorrente tem.
 *
 * O QUE MUDOU NA REPAGINAÇÃO DE 25/08/2026
 * ----------------------------------------------------------------------------
 * A versão anterior tinha quatro seções com `max-w-6xl px-4 py-14 sm:py-20`
 * idênticos, TODAS centralizadas, cada uma com uma fileira de cards iguais.
 * Era isso — e não a cor — que dava a ela cara de página gerada automaticamente:
 * ritmo uniforme e nenhum eixo de leitura.
 *
 * Três decisões concretas:
 *
 *   1. O olho passou a ter uma ESQUERDA. A primeira dobra e as chamadas de
 *      seção são alinhadas à esquerda; centralizado ficou só onde é encerramento.
 *   2. "Como funciona" virou uma SEQUÊNCIA, não uma grade. Quatro passos em
 *      ordem são uma escada; quatro cards lado a lado sugerem que dá para
 *      começar por qualquer um.
 *   3. O respiro vertical varia entre as seções, em vez de repetir o mesmo
 *      `py` quatro vezes.
 *
 * ⚠️ A PALETA NÃO MUDOU. Os seis valores são decisão fechada com a cliente e o
 * mockup dela é o painel neon. O ganho aqui é de tipografia, ritmo e hierarquia.
 */

const STEPS = [
  {
    icon: <FileUp />,
    title: "Você sobe o edital",
    body: "Um PDF. A IA lê o documento inteiro e organiza o conteúdo programático em disciplinas e assuntos.",
  },
  {
    icon: <ClipboardCheck />,
    title: "Você confere",
    body: "Corrige, acrescenta e remove o que quiser. Onde o edital informa o peso de cada tema, ele já vem preenchido.",
  },
  {
    icon: <Target />,
    title: "Faz o diagnóstico",
    body: "Marca o que domina e o que não domina. Leva poucos minutos e é o ponto de partida do algoritmo.",
  },
  {
    icon: <Brain />,
    title: "E abre o app todo dia",
    body: "A Tarefa do Dia já está pronta: o que estudar, com qual técnica e quais questões praticar.",
  },
];

export default function LandingPage() {
  return (
    <>
      {/* ==================================================================== *
       * PRIMEIRA DOBRA — proposta de valor e CTA, sem precisar rolar
       * ==================================================================== */}
      <section className="relative overflow-hidden border-b border-border">
        {/*
          Brilho de fundo deslocado para a direita. É o que quebra a simetria
          antes mesmo de o texto começar — e usa o ciano da marca, não um
          gradiente decorativo.
        */}
        <div
          className="pointer-events-none absolute -top-40 right-[-10%] size-[34rem] rounded-full bg-primary/10 blur-3xl"
          aria-hidden
        />

        <div className="relative mx-auto w-full max-w-6xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24 sm:pb-28">
          <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-7">
              <p className="text-eyebrow">Para quem estuda para concurso</p>

              <h1 className="mt-5 text-[2.5rem] leading-[1.05] font-bold tracking-[-0.03em] text-balance text-foreground sm:text-6xl lg:text-7xl">
                Pare de decidir o que estudar.
                <span className="block text-primary">Comece a estudar.</span>
              </h1>

              <p className="mt-6 max-w-xl text-lg text-pretty text-muted-foreground">
                Você sobe o edital do seu concurso. A partir dele, a plataforma
                monta seu plano de estudo e o reajusta a cada questão que você
                responde. Sem planilha, sem cronograma que envelhece na primeira
                semana.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link href="/cadastrar">
                    Começar agora, é grátis
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="lg" className="w-full sm:w-auto">
                  <Link href="#como-funciona">Ver como funciona</Link>
                </Button>
              </div>

              <p className="mt-5 text-sm text-muted-foreground">
                Não pedimos cartão para começar.
              </p>
            </div>

            {/*
              A prova visual da promessa: o que o aluno recebe pronto. Uma
              imagem de tela seria mais bonita e envelheceria a cada mudança de
              layout; este bloco é HTML e acompanha o produto.
            */}
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-border bg-card p-5 glow-ring">
                <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  Sua tarefa de hoje
                </p>

                <ul className="mt-4 flex flex-col gap-3">
                  {[
                    { label: "Estude", value: "Mapa Mental — Crase", done: true },
                    { label: "Pratique", value: "Questões — Crase", done: true },
                    { label: "Estude", value: "Concordância verbal", done: false },
                    { label: "Revise", value: "Atos administrativos", done: false },
                  ].map((item) => (
                    <li key={item.value} className="flex items-center gap-3">
                      <span
                        className={
                          item.done
                            ? "size-2 shrink-0 rounded-full bg-primary"
                            : "size-2 shrink-0 rounded-full bg-border"
                        }
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.65rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                          {item.label}
                        </span>
                        <span
                          className={
                            item.done
                              ? "block truncate text-sm text-muted-foreground line-through"
                              : "block truncate text-sm text-foreground"
                          }
                        >
                          {item.value}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>

                <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
                  Montada pelo algoritmo a partir do seu edital, do seu
                  diagnóstico e do tempo que você tem hoje.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== *
       * COMO FUNCIONA — uma escada, não uma grade
       * ==================================================================== */}
      <section id="como-funciona" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          {/*
            O título fica GRUDADO enquanto os passos rolam. Dá eixo à seção e
            mantém o contexto de "onde estou" durante a leitura da sequência.
          */}
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-28">
              <p className="text-eyebrow">Como funciona</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">
                Do PDF do edital à tarefa de hoje
              </h2>
              <p className="mt-4 text-pretty text-muted-foreground">
                Quatro passos, uma vez só. Depois disso o trabalho de decidir
                deixa de ser seu.
              </p>
            </div>
          </div>

          <ol className="lg:col-span-8">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="group flex gap-5 border-t border-border py-7 first:border-t-0 first:pt-0 sm:gap-8"
              >
                <span
                  className="text-metric shrink-0 text-2xl text-border transition-colors group-hover:text-primary sm:text-3xl"
                  aria-hidden
                >
                  {String(index + 1).padStart(2, "0")}
                </span>

                <div className="min-w-0">
                  <h3 className="flex items-center gap-2.5 text-lg font-semibold text-foreground">
                    <span className="text-primary [&>svg]:size-5" aria-hidden>
                      {step.icon}
                    </span>
                    {step.title}
                  </h3>
                  <p className="mt-2 max-w-xl text-pretty text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ==================================================================== *
       * DIFERENCIAL — um bloco grande e dois menores, larguras diferentes
       * ==================================================================== */}
      <section className="border-y border-border bg-surface/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="max-w-2xl">
            <p className="text-eyebrow">O diferencial</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">
              Não é um banco de questões com cronograma em cima
            </h2>
            <p className="mt-4 text-lg text-pretty text-muted-foreground">
              As questões são o sensor, não o produto. O que a plataforma faz é
              decidir por você — e mudar de ideia quando os seus resultados
              mudam.
            </p>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-12">
            {/* O bloco largo carrega o argumento central. */}
            <article className="rounded-2xl border border-primary/30 bg-card p-7 transition-colors hover:border-primary/60 lg:col-span-7 lg:p-9">
              <span className="text-primary [&>svg]:size-6" aria-hidden>
                <Target />
              </span>
              <h3 className="mt-5 text-xl font-semibold text-foreground sm:text-2xl">
                Dois motores, não um
              </h3>
              <p className="mt-3 max-w-lg text-pretty text-muted-foreground">
                Um decide o que estudar hoje cruzando cinco sinais: seu
                desempenho, o peso no edital, a proximidade da prova, há quanto
                tempo você não vê o assunto e onde estão suas lacunas. O outro
                cuida das revisões, em trilho próprio.
              </p>

              <dl className="mt-7 grid grid-cols-3 gap-4 border-t border-border pt-6">
                {[
                  ["5", "sinais de priorização"],
                  ["24h→90d", "ciclo de revisão"],
                  ["1", "decisão por dia"],
                ].map(([value, label]) => (
                  <div key={label}>
                    <dt className="text-metric text-lg text-primary sm:text-xl">{value}</dt>
                    <dd className="mt-1 text-xs leading-snug text-muted-foreground">
                      {label}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>

            <div className="flex flex-col gap-4 lg:col-span-5">
              {[
                {
                  icon: <RefreshCw />,
                  title: "Revisão que não depende da sua memória",
                  body: "Todo conteúdo estudado volta em 24 horas, 7, 30, 60 e 90 dias. Se você atrasar, ela não some — acumula, e o intervalo seguinte conta do dia em que você realmente revisou.",
                },
                {
                  icon: <CalendarClock />,
                  title: "Cronograma que se refaz sozinho",
                  body: "Ele muda quando você responde questões ou conclui um estudo. E avisa quando o conteúdo que falta não cabe no tempo que você tem até a prova.",
                },
              ].map((item) => (
                <article
                  key={item.title}
                  className="flex-1 rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/40"
                >
                  <span className="text-primary [&>svg]:size-5" aria-hidden>
                    {item.icon}
                  </span>
                  <h3 className="mt-4 font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm text-pretty text-muted-foreground">
                    {item.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== *
       * ENCERRAMENTO — aqui, sim, centralizado
       * ==================================================================== */}
      <section className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-lg font-medium text-balance text-primary sm:text-xl">
            {APP_TAGLINE}
          </p>

          <h2 className="mt-5 text-3xl font-bold tracking-tight text-balance text-foreground sm:text-5xl">
            Sua próxima sessão de estudo já está decidida.
          </h2>

          <div className="mt-9 flex justify-center">
            <Button asChild size="lg">
              <Link href="/cadastrar">
                Criar minha conta grátis
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            Leva menos de um minuto. Você pode apagar sua conta quando quiser.
          </p>
        </div>
      </section>

      <StickyCta />
    </>
  );
}
