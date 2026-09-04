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

import {
  AudienceSection,
  ComparisonSection,
  CycleSection,
  EvolutionSection,
  FaqSection,
  GameSection,
  MaterialsSection,
  PainsSection,
  ScienceSection,
  SystemSection,
  TimeSection,
  WorthSection,
} from "@/components/marketing/copy-sections";
import { StickyCta } from "@/components/marketing/sticky-cta";
import { Button } from "@/components/ui/button";
import { APP_DESCRIPTION, APP_TAGLINE } from "@/config/app";
import { socialMetadata } from "@/lib/metadata";
import { getLandingCopy } from "@/server/content/landing";

/**
 * ⚠️ ESTÁTICA, E ATUALIZADA POR INVALIDAÇÃO — não a cada visita.
 *
 * A copy vem do banco, mas a porta da rua não pode pagar uma consulta por
 * visitante. `force-static` faz a leitura acontecer na geração; publicar um
 * texto novo chama `revalidatePath("/")` e regenera a página.
 *
 * O resultado é o melhor dos dois: a cliente publica e vê a mudança em
 * segundos, e o visitante continua recebendo HTML do cache da borda.
 */
export const dynamic = "force-static";

export async function generateMetadata(): Promise<Metadata> {
  const copy = await getLandingCopy();

  return {
    title: copy.seo.title,
    description: APP_DESCRIPTION,
    // ⚠️ `socialMetadata` e não um `openGraph` à mão — ver a nota em lib/metadata.
    ...socialMetadata({ title: copy.seo.socialTitle, path: "/" }),
  };
}

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
 *
 * ONDE FICA O TEXTO
 * ----------------------------------------------------------------------------
 * Em `content/landing.ts`, e não aqui. A cliente pediu para poder testar copies
 * sem depender de mim, e ela edita pelo GitHub. Este arquivo ficou com o que é
 * DESENHO — ícone, largura de bloco, ordem — porque é isso que quebra a página
 * quando muda por engano.
 *
 * A separação não é por organização: é para que um erro de digitação na copy
 * não possa derrubar o layout, e para que o TypeScript recuse a publicação se
 * um texto obrigatório sumir.
 */

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
 *
 * O texto vem de `LANDING.howItWorks.steps`, casado pela CHAVE e não pela
 * posição: se fosse por índice, reordenar a copy trocaria os ícones de lugar
 * em silêncio.
 */
const STEPS = [
  { key: "upload", icon: <FileUp />, span: "lg:col-span-4" },
  { key: "review", icon: <ClipboardCheck />, span: "lg:col-span-2" },
  { key: "diagnosis", icon: <Target />, span: "lg:col-span-2" },
  { key: "daily", icon: <Brain />, span: "lg:col-span-4" },
] as const;

/** Os dois blocos menores do diferencial, também casados por chave. */
const DIFFERENTIAL_CARDS = [
  { key: "review", icon: <RefreshCw /> },
  { key: "schedule", icon: <CalendarClock /> },
] as const;

export default async function LandingPage() {
  // O nome curto mantém o resto do arquivo legível: são trinta referências.
  const LANDING = await getLandingCopy();

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
            <p className="rise rise-1 text-eyebrow">{LANDING.hero.eyebrow}</p>

            <h1 className="rise rise-2 mt-5 text-[2.5rem] leading-[1.02] font-extrabold tracking-[-0.035em] text-balance text-foreground sm:text-6xl lg:text-7xl">
              {LANDING.hero.titleLine1}
              {/* O degradê fica em UMA expressão — a promessa central. */}
              <span className="text-gradient block">{LANDING.hero.titleLine2}</span>
            </h1>

            {/*
              ⚠️ Centralizado só a partir de `sm`. Em 390px este parágrafo ocupa
              seis linhas, e texto corrido centralizado com seis linhas dá ao
              olho uma margem esquerda diferente a cada quebra — ele perde o
              ponto de retorno e relê a mesma linha. Centralizar é bonito em
              três linhas e hostil em seis.
            */}
            <p className="rise rise-3 mx-auto mt-6 max-w-2xl text-left text-lg text-pretty text-muted-foreground sm:text-center">
              {LANDING.hero.subtitle}
            </p>

            <div className="rise rise-4 mt-9 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button asChild size="lg" className="glow-ring w-full sm:w-auto">
                <Link href="/cadastrar">
                  {LANDING.hero.primaryCta}
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="lg" className="w-full sm:w-auto">
                <Link href="#como-funciona">{LANDING.hero.secondaryCta}</Link>
              </Button>
            </div>

            <p className="rise rise-4 mt-5 text-sm text-muted-foreground">
              {LANDING.hero.note}
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
                  {LANDING.mockup.title}
                </p>
                {/*
                  Etiqueta, não texto solto. Como texto cinza no canto ele
                  ficava sobre a parte mais clara do vidro e sumia; a borda e o
                  fundo próprio dão a ele um chão constante, independente do
                  que estiver passando por baixo.
                */}
                <span className="ml-auto shrink-0 rounded-full border border-border/70 bg-background/60 px-2 py-0.5 text-[0.65rem] font-medium text-foreground">
                  {LANDING.mockup.badge}
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
                {LANDING.mockup.tasks.map((item) => (
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
                {LANDING.mockup.footnote}
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
          <p className="text-eyebrow">{LANDING.howItWorks.eyebrow}</p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">
            {LANDING.howItWorks.title}
          </h2>
          <p className="mt-4 text-lg text-pretty text-muted-foreground">
            {LANDING.howItWorks.subtitle}
          </p>
        </div>

        <ol className="reveal mt-12 grid gap-4 lg:grid-cols-6">
          {STEPS.map((step, index) => (
            <li key={step.key} className={step.span}>
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
                  {LANDING.howItWorks.steps[step.key].title}
                </h3>
                <p className="mt-2 text-sm text-pretty text-muted-foreground">
                  {LANDING.howItWorks.steps[step.key].body}
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
            <p className="text-eyebrow">{LANDING.differential.eyebrow}</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">
              {LANDING.differential.title}
            </h2>
            <p className="mt-4 text-lg text-pretty text-muted-foreground">
              {LANDING.differential.subtitle}
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
                {LANDING.differential.engines.title}
              </h3>
              <p className="mt-3 max-w-lg text-pretty text-muted-foreground">
                {LANDING.differential.engines.body}
              </p>

              <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-border pt-6">
                {LANDING.differential.engines.metrics.map((metric) => (
                  <div key={metric.label}>
                    <dt className="text-metric text-lg text-primary sm:text-xl">
                      {metric.value}
                    </dt>
                    <dd className="mt-1 text-xs leading-snug text-muted-foreground">
                      {metric.label}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>

            {DIFFERENTIAL_CARDS.map((item) => (
              <article key={item.key} className="bento-card group p-6 lg:col-span-5">
                <span
                  className="flex size-9 items-center justify-center rounded-lg border border-border bg-background/60 text-primary transition-colors group-hover:border-primary/40 [&>svg]:size-4.5"
                  aria-hidden
                >
                  {item.icon}
                </span>
                <h3 className="mt-5 font-semibold text-balance text-foreground">
                  {LANDING.differential.cards[item.key].title}
                </h3>
                <p className="mt-2 text-sm text-pretty text-muted-foreground">
                  {LANDING.differential.cards[item.key].body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ==================================================================== *
       * A COPY DE 04/09/2026
       *
       * A ordem é a do documento dela: dor, para quem é, comparativo, jogo,
       * sistema, ciência, materiais, ciclo, evolução, tempo, quanto vale, FAQ.
       * ==================================================================== */}
      <PainsSection copy={LANDING.pains} />
      <AudienceSection copy={LANDING.audience} />
      <ComparisonSection copy={LANDING.comparison} />
      <GameSection copy={LANDING.game} mission={LANDING.mission} />
      <SystemSection copy={LANDING.system} />
      <ScienceSection copy={LANDING.science} />
      <MaterialsSection copy={LANDING.materials} />
      <CycleSection copy={LANDING.cycle} />
      <EvolutionSection copy={LANDING.evolution} />
      <TimeSection copy={LANDING.time} better={LANDING.better} />
      <WorthSection copy={LANDING.worth} cta={LANDING.closing.cta} />
      <FaqSection copy={LANDING.faq} />

      {/* ==================================================================== *
       * ENCERRAMENTO — aqui, sim, centralizado
       * ==================================================================== */}
      <section className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
        <div className="reveal mx-auto max-w-2xl text-center">
          <p className="text-lg font-medium text-balance text-primary sm:text-xl">
            {APP_TAGLINE}
          </p>

          <h2 className="mt-5 text-3xl font-bold tracking-tight text-balance text-foreground sm:text-5xl">
            {LANDING.closing.title}
          </h2>

          <div className="mt-9 flex justify-center">
            <Button asChild size="lg" className="glow-ring">
              <Link href="/cadastrar">
                {LANDING.closing.cta}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">{LANDING.closing.note}</p>
        </div>
      </section>

      {/* Componente de cliente: recebe o texto por prop, não consegue buscá-lo. */}
      <StickyCta label={LANDING.stickyCta.label} note={LANDING.stickyCta.note} />
    </>
  );
}
