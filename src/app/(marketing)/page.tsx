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

const DAILY_TASK_PREVIEW = [
  { label: "Estude", value: "Mapa Mental — Crase", done: true },
  { label: "Pratique", value: "Questões — Crase", done: true },
  { label: "Estude", value: "Concordância verbal", done: false },
  { label: "Revise", value: "Atos administrativos", done: false },
];

/**
 * Os quatro passos, em bento.
 *
 * `span` é a largura que cada um ocupa numa grade de 6 colunas. Não é enfeite:
 * o primeiro e o último passos são os que decidem se a pessoa entende o
 * produto — "eu subo um PDF" e "eu abro o app e já está pronto" —, então
 * ocupam 4 de 6. Os dois do meio são etapas de conferência e cabem em 2.
 *
 * ⚠️ A ORDEM CONTINUA IMPORTANDO. Por isso a lista é um `<ol>` com número
 * visível em cada card: bento costuma sugerir que dá para começar por
 * qualquer bloco, e aqui não dá — é uma sequência.
 */
const STEPS = [
  {
    icon: <FileUp />,
    title: "Você sobe o edital",
    body: "Um PDF. A IA lê o documento inteiro e organiza o conteúdo programático em disciplinas e assuntos.",
    span: "lg:col-span-4",
  },
  {
    icon: <ClipboardCheck />,
    title: "Você confere",
    body: "Corrige, acrescenta e remove o que quiser. Onde o edital informa o peso de cada tema, ele já vem preenchido.",
    span: "lg:col-span-2",
  },
  {
    icon: <Target />,
    title: "Faz o diagnóstico",
    body: "Marca o que domina e o que não domina. Leva poucos minutos e é o ponto de partida do algoritmo.",
    span: "lg:col-span-2",
  },
  {
    icon: <Brain />,
    title: "E abre o app todo dia",
    body: "A Tarefa do Dia já está pronta: o que estudar, com qual técnica e quais questões praticar.",
    span: "lg:col-span-4",
  },
];

export default function LandingPage() {
  return (
    <>
      {/* ==================================================================== *
       * PRIMEIRA DOBRA — proposta de valor e CTA, sem precisar rolar
       * ==================================================================== */}
      <section className="grid-texture relative overflow-hidden border-b border-border">
        {/*
          Dois focos de luz atrás do título, um em cada diagonal. Com a malha
          fina do `grid-texture` por baixo, eles é que fazem a textura aparecer
          no centro e sumir nas pontas.
        */}
        <div
          className="pointer-events-none absolute -top-32 left-1/2 size-[42rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
          aria-hidden
        />

        <div className="relative mx-auto w-full max-w-6xl px-4 pt-16 pb-16 sm:px-6 sm:pt-24 sm:pb-20">
          {/*
            Entrada escalonada: sobrancelha, título, texto e botões surgem em
            sequência, com uns 80ms entre eles. É o suficiente para o olho
            perceber ordem de leitura, e curto o bastante para não virar espera.
          */}
          <div className="mx-auto max-w-3xl text-center">
            <p className="rise rise-1 text-eyebrow">Para quem estuda para concurso</p>

            <h1 className="rise rise-2 mt-5 text-[2.5rem] leading-[1.02] font-extrabold tracking-[-0.035em] text-balance text-foreground sm:text-6xl lg:text-7xl">
              Pare de decidir o que estudar.
              {/* O degradê fica em UMA expressão — a promessa central. */}
              <span className="text-gradient block">Comece a estudar.</span>
            </h1>

            {/*
              ⚠️ Centralizado só a partir de `sm`. Em 390px este parágrafo ocupa
              seis linhas, e texto corrido centralizado com seis linhas dá ao
              olho uma margem esquerda diferente a cada quebra — ele perde o
              ponto de retorno e relê a mesma linha. Centralizar é bonito em
              três linhas e hostil em seis.
            */}
            <p className="rise rise-3 mx-auto mt-6 max-w-2xl text-left text-lg text-pretty text-muted-foreground sm:text-center">
              Você sobe o edital do seu concurso. A partir dele, a plataforma
              monta seu plano de estudo e o reajusta a cada questão que você
              responde. Sem planilha, sem cronograma que envelhece na primeira
              semana.
            </p>

            <div className="rise rise-4 mt-9 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button asChild size="lg" className="glow-ring w-full sm:w-auto">
                <Link href="/cadastrar">
                  Começar agora, é grátis
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="lg" className="w-full sm:w-auto">
                <Link href="#como-funciona">Ver como funciona</Link>
              </Button>
            </div>

            <p className="rise rise-4 mt-5 text-sm text-muted-foreground">
              Não pedimos cartão para começar.
            </p>
          </div>

          {/*
            O MOCKUP.

            A prova visual da promessa: o que o aluno recebe pronto. Uma imagem
            de tela seria mais bonita e envelheceria a cada mudança de layout;
            este bloco é HTML e acompanha o produto.

            ⚠️ Sem `drift` agora. Um card estreito ao lado do texto podia
            flutuar sem incomodar; um painel largo logo abaixo do título, com
            8px de sobe-e-desce contínuo, puxa o olho justamente enquanto a
            pessoa lê a promessa. Ele ganha presença pela largura e pela borda
            iluminada, não por se mexer.
          */}
          <div className="rise rise-4 mt-14 sm:mt-16">
            <div className="glass-panel mx-auto w-full max-w-4xl p-4 sm:p-6">
              {/* Barra da janela: três pontos e o título, como no app real. */}
              <div className="flex items-center gap-3 border-b border-border/70 pb-4">
                <span className="flex gap-1.5" aria-hidden>
                  <span className="size-2.5 rounded-full bg-border" />
                  <span className="size-2.5 rounded-full bg-border" />
                  <span className="size-2.5 rounded-full bg-primary/50" />
                </span>
                <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  Sua tarefa de hoje
                </p>
                {/*
                  Etiqueta, não texto solto. Como texto cinza no canto ele
                  ficava sobre a parte mais clara do vidro e sumia; a borda e o
                  fundo próprio dão a ele um chão constante, independente do
                  que estiver passando por baixo.
                */}
                <span className="ml-auto shrink-0 rounded-full border border-border/70 bg-background/60 px-2 py-0.5 text-[0.65rem] font-medium text-foreground">
                  1h disponível
                </span>
              </div>

              {/*
                No celular vira uma coluna. Quatro tarefas lado a lado em 390px
                dariam quatro colunas de 80px — o nome do assunto não caberia
                em nenhuma delas.

                ⚠️ Rótulo e assunto na MESMA linha, não empilhados. Empilhados,
                cada tarefa virava um bloco de duas linhas com respiro em volta,
                e as quatro juntas deixavam o painel comprido e vazio no
                celular — parecia lista de espera, não tarefa de um dia.
              */}
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {DAILY_TASK_PREVIEW.map((item) => (
                  <li
                    key={item.value}
                    className="flex items-center gap-2.5 rounded-lg border border-border/70 bg-background/40 px-3 py-2.5"
                  >
                    <span
                      className={
                        item.done
                          ? "size-1.5 shrink-0 rounded-full bg-primary"
                          : "size-1.5 shrink-0 rounded-full bg-border"
                      }
                      aria-hidden
                    />
                    <span className="shrink-0 text-[0.6rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                      {item.label}
                    </span>
                    <span
                      className={
                        item.done
                          ? "min-w-0 flex-1 truncate text-sm text-muted-foreground line-through"
                          : "min-w-0 flex-1 truncate text-sm text-foreground"
                      }
                    >
                      {item.value}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="mt-4 border-t border-border/70 pt-3.5 text-xs text-pretty text-muted-foreground">
                Montada pelo algoritmo a partir do seu edital, do seu
                diagnóstico e do tempo que você tem hoje.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== *
       * COMO FUNCIONA — bento de quatro blocos, larguras 4/2/2/4
       * ==================================================================== */}
      <section
        id="como-funciona"
        className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28"
      >
        <div className="reveal max-w-2xl">
          <p className="text-eyebrow">Como funciona</p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">
            Do PDF do edital à tarefa de hoje
          </h2>
          <p className="mt-4 text-lg text-pretty text-muted-foreground">
            Quatro passos, uma vez só. Depois disso o trabalho de decidir deixa
            de ser seu.
          </p>
        </div>

        <ol className="reveal mt-12 grid gap-4 lg:grid-cols-6">
          {STEPS.map((step, index) => (
            <li key={step.title} className={step.span}>
              <article className="bento-card group flex h-full flex-col p-6 sm:p-7">
                <div className="flex items-center gap-3">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background/60 text-primary transition-colors group-hover:border-primary/40 [&>svg]:size-4.5"
                    aria-hidden
                  >
                    {step.icon}
                  </span>
                  {/* O número mantém visível que isto é uma sequência. */}
                  <span className="text-metric text-sm text-border" aria-hidden>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>

                <h3 className="mt-5 text-lg font-semibold text-balance text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm text-pretty text-muted-foreground">
                  {step.body}
                </p>
              </article>
            </li>
          ))}
        </ol>
      </section>

      {/* ==================================================================== *
       * DIFERENCIAL — um bloco grande e dois menores, larguras diferentes
       * ==================================================================== */}
      <section className="border-y border-border/70 bg-surface/30">
        <div className="reveal mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
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

          {/*
            Bento de três blocos: um alto à esquerda ocupando as duas linhas, e
            dois empilhados à direita. O bloco alto é o argumento central —
            ganha o dobro de altura porque é o que precisa ser lido inteiro.
          */}
          <div className="mt-12 grid gap-4 lg:grid-cols-12">
            <article className="bento-card group p-7 lg:col-span-7 lg:row-span-2 lg:p-9">
              <span
                className="flex size-11 items-center justify-center rounded-xl border border-border bg-background/60 text-primary transition-colors group-hover:border-primary/40 [&>svg]:size-5"
                aria-hidden
              >
                <Target />
              </span>
              <h3 className="mt-6 text-xl font-semibold text-balance text-foreground sm:text-2xl">
                Dois motores, não um
              </h3>
              <p className="mt-3 max-w-lg text-pretty text-muted-foreground">
                Um decide o que estudar hoje cruzando cinco sinais: seu
                desempenho, o peso no edital, a proximidade da prova, há quanto
                tempo você não vê o assunto e onde estão suas lacunas. O outro
                cuida das revisões, em trilho próprio.
              </p>

              <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-border pt-6">
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
              <article key={item.title} className="bento-card group p-6 lg:col-span-5">
                <span
                  className="flex size-9 items-center justify-center rounded-lg border border-border bg-background/60 text-primary transition-colors group-hover:border-primary/40 [&>svg]:size-4.5"
                  aria-hidden
                >
                  {item.icon}
                </span>
                <h3 className="mt-5 font-semibold text-balance text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-pretty text-muted-foreground">
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ==================================================================== *
       * ENCERRAMENTO — aqui, sim, centralizado
       * ==================================================================== */}
      <section className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
        <div className="reveal mx-auto max-w-2xl text-center">
          <p className="text-lg font-medium text-balance text-primary sm:text-xl">
            {APP_TAGLINE}
          </p>

          <h2 className="mt-5 text-3xl font-bold tracking-tight text-balance text-foreground sm:text-5xl">
            Sua próxima sessão de estudo já está decidida.
          </h2>

          <div className="mt-9 flex justify-center">
            <Button asChild size="lg" className="glow-ring">
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
