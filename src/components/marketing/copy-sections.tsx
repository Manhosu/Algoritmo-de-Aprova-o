import {
  ArrowRight,
  BarChart3,
  Brain,
  Check,
  CircleHelp,
  Clock,
  Layers,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { LandingCopy } from "@/content/landing-schema";

/**
 * AS SEÇÕES DA COPY DE 04/09/2026.
 * ============================================================================
 *
 * A cliente escreveu uma copy completa e pediu para acomodá-la "sem comprometer
 * o layout e a experiência do usuário". Ela também disse: "não especifiquei
 * botões, mas pode incluir onde achar necessário".
 *
 * ⚠️ CADA SEÇÃO TEM RITMO PRÓPRIO, e isso é o que impede uma página de treze
 * blocos de virar uma parede.
 *
 * Alternam largura (contida e larga), fundo (transparente e `surface`) e
 * alinhamento. Treze seções com o mesmo `py` e o mesmo `max-w` cansam antes da
 * metade, e o leitor sai antes do preço.
 *
 * ⚠️ TODO TEXTO VEM POR PROP, nunca escrito aqui.
 *
 * A cliente edita a copy em Textos do site. Uma frase escrita neste arquivo
 * seria a única que ela não conseguiria mudar sozinha, e ninguém lembraria por
 * quê.
 */

/* ========================================================================== *
 * DORES
 * ========================================================================== */

export function PainsSection({ copy }: { copy: LandingCopy["pains"] }) {
  return (
    <section className="border-y border-border/70 bg-surface/30">
      <div className="mx-auto w-full max-w-4xl px-4 py-20 sm:px-6 sm:py-28">
        <h2 className="reveal text-2xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">
          {copy.title}
        </h2>

        <ul className="reveal mt-8 flex flex-col gap-3">
          {copy.items.map((item) => (
            <li key={item} className="flex items-start gap-3">
              {/*
                A cliente usou ☑ no documento. O ícone desenhado escala melhor
                que o caractere, que muda de forma e de tamanho em cada sistema.
              */}
              <Check className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <span className="text-pretty text-foreground sm:text-lg">{item}</span>
            </li>
          ))}
        </ul>

        <div className="reveal mt-10 border-l-2 border-primary/60 pl-5">
          <p className="text-pretty text-muted-foreground sm:text-lg">{copy.closing1}</p>
          <p className="text-pretty text-muted-foreground sm:text-lg">{copy.closing2}</p>
          <p className="mt-2 text-pretty font-semibold text-foreground sm:text-lg">
            {copy.closing3}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ========================================================================== *
 * PARA QUEM É
 * ========================================================================== */

export function AudienceSection({ copy }: { copy: LandingCopy["audience"] }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <h2 className="reveal max-w-2xl text-2xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">
        {copy.title}
      </h2>

      {/*
        ⚠️ CINCO CARDS EM GRADE DE SEIS COLUNAS.

        Com `grid-cols-3`, o quinto card ficaria sozinho numa fileira, alinhado
        à esquerda e com dois vazios do lado. Em `lg:grid-cols-6`, cada card
        ocupa duas colunas e os dois últimos recebem três: a última fileira
        fecha cheia.
      */}
      <ul className="reveal mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {copy.items.map((item, indice) => (
          <li
            key={item.title}
            className={
              indice >= 3
                ? "rounded-2xl border border-border bg-card p-6 lg:col-span-3"
                : "rounded-2xl border border-border bg-card p-6 lg:col-span-2"
            }
          >
            <p className="font-semibold text-pretty text-foreground">{item.title}</p>
            <p className="mt-2 text-pretty text-sm text-muted-foreground">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ========================================================================== *
 * COMPARATIVO
 * ========================================================================== */

export function ComparisonSection({ copy }: { copy: LandingCopy["comparison"] }) {
  return (
    <section className="border-y border-border/70 bg-surface/30">
      <div className="mx-auto w-full max-w-5xl px-4 py-20 sm:px-6 sm:py-28">
        <h2 className="reveal text-center text-2xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">
          {copy.title}
        </h2>

        {/*
          ⚠️ DUAS COLUNAS NO DESKTOP, PARES EMPILHADOS NO CELULAR.

          Uma tabela de verdade com 390px de largura obriga a rolar na
          horizontal, e comparar duas colunas rolando é impossível. Empilhado, o
          par fica junto: o problema e a resposta, um embaixo do outro.
        */}
        <div className="reveal mt-10 grid gap-3 lg:grid-cols-2 lg:gap-6">
          <div className="hidden lg:block">
            <p className="text-sm font-semibold text-muted-foreground">{copy.chaosLabel}</p>
            <p className="text-xs text-muted-foreground/70">{copy.chaosNote}</p>
          </div>
          <div className="hidden lg:block">
            <p className="text-sm font-semibold text-primary">{copy.smartLabel}</p>
            <p className="text-xs text-muted-foreground/70">{copy.smartNote}</p>
          </div>

          {copy.rows.map((linha) => (
            <div key={linha.smart} className="contents">
              <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/40 p-4">
                <X className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="text-pretty text-sm text-muted-foreground">
                  {linha.chaos}
                </span>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span className="text-pretty text-sm text-foreground">{linha.smart}</span>
              </div>
            </div>
          ))}
        </div>

        <p className="reveal mt-10 text-center text-pretty font-medium text-foreground sm:text-lg">
          {copy.closing}
        </p>
      </div>
    </section>
  );
}

/* ========================================================================== *
 * GAMIFICAÇÃO
 * ========================================================================== */

export function GameSection({
  copy,
  mission,
}: {
  copy: LandingCopy["game"];
  mission: LandingCopy["mission"];
}) {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="reveal lg:col-span-5">
          <h2 className="text-2xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">
            {copy.title}
          </h2>

          <ul className="mt-6 flex flex-wrap gap-2">
            {copy.badges.map((badge) => (
              <li
                key={badge}
                className="rounded-full border border-primary/40 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary"
              >
                {badge}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col gap-1">
            {copy.lines.map((linha, indice) => (
              <p
                key={linha}
                className={
                  indice === copy.lines.length - 1
                    ? "mt-3 text-pretty font-semibold text-foreground sm:text-lg"
                    : "text-pretty text-muted-foreground sm:text-lg"
                }
              >
                {linha}
              </p>
            ))}
          </div>
        </div>

        <div className="reveal lg:col-span-7">
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
            <Target className="size-6 text-primary" aria-hidden />

            <h3 className="mt-4 text-xl font-bold text-pretty text-foreground sm:text-2xl">
              {mission.title}
            </h3>
            <p className="mt-2 text-pretty text-muted-foreground">{mission.subtitle}</p>

            <ul className="mt-6 flex flex-col gap-3">
              {mission.items.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span className="text-pretty text-sm text-foreground">{item}</span>
                </li>
              ))}
            </ul>

            <p className="mt-6 text-pretty text-sm text-muted-foreground">
              {mission.closing1}
            </p>
            <p className="text-pretty text-sm font-medium text-foreground">
              {mission.closing2}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ========================================================================== *
 * SISTEMA ÚNICO
 * ========================================================================== */

export function SystemSection({ copy }: { copy: LandingCopy["system"] }) {
  return (
    <section className="border-y border-border/70 bg-surface/30">
      <div className="mx-auto w-full max-w-3xl px-4 py-20 text-center sm:px-6 sm:py-28">
        <Layers className="reveal mx-auto size-7 text-primary" aria-hidden />

        <h2 className="reveal mt-5 text-2xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">
          {copy.title}
        </h2>

        <ul className="reveal mt-8 flex flex-col gap-1.5">
          {copy.denials.map((linha) => (
            <li key={linha} className="text-pretty text-muted-foreground sm:text-lg">
              {linha}
            </li>
          ))}
        </ul>

        <p className="reveal mt-8 text-2xl font-bold text-balance text-primary sm:text-3xl">
          {copy.closing1}
        </p>
        <p className="reveal mt-2 text-pretty text-muted-foreground sm:text-lg">
          {copy.closing2}
        </p>
      </div>
    </section>
  );
}

/* ========================================================================== *
 * CIÊNCIA
 * ========================================================================== */

export function ScienceSection({ copy }: { copy: LandingCopy["science"] }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
        <div className="reveal lg:col-span-5">
          <Brain className="size-7 text-primary" aria-hidden />
          <h2 className="mt-5 text-2xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">
            {copy.title}
          </h2>
          <p className="mt-5 text-pretty text-muted-foreground">{copy.intro}</p>
        </div>

        <div className="reveal lg:col-span-7">
          <p className="text-pretty text-sm text-muted-foreground">{copy.subtitle}</p>

          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {copy.items.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-card/60 px-4 py-3"
              >
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span className="text-pretty text-sm text-foreground">{item}</span>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-pretty font-semibold text-foreground">{copy.closing}</p>
        </div>
      </div>
    </section>
  );
}

/* ========================================================================== *
 * MATERIAIS
 * ========================================================================== */

export function MaterialsSection({ copy }: { copy: LandingCopy["materials"] }) {
  return (
    <section className="border-y border-border/70 bg-surface/30">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="reveal max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">
            {copy.title}
          </h2>
          <p className="mt-4 text-pretty text-muted-foreground sm:text-lg">
            {copy.subtitle}
          </p>
        </div>

        {/* Cinco cards em dez colunas: dois de cada, e o último ocupa a fileira. */}
        <ul className="reveal mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-10">
          {copy.items.map((item, indice) => (
            <li
              key={item.title}
              className={
                indice < 3
                  ? "rounded-2xl border border-border bg-card p-6 lg:col-span-4"
                  : "rounded-2xl border border-border bg-card p-6 lg:col-span-6"
              }
            >
              <p className="font-semibold text-pretty text-foreground">{item.title}</p>
              <p className="mt-2 text-pretty text-sm text-muted-foreground">{item.body}</p>
            </li>
          ))}
        </ul>

        <p className="reveal mt-8 text-pretty font-medium text-foreground">{copy.closing}</p>
      </div>
    </section>
  );
}

/* ========================================================================== *
 * O CICLO
 * ========================================================================== */

export function CycleSection({ copy }: { copy: LandingCopy["cycle"] }) {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-20 sm:px-6 sm:py-28">
      <h2 className="reveal text-center text-2xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">
        {copy.title}
      </h2>

      {/*
        ⚠️ FLUXO EM LINHA QUE QUEBRA, e não uma coluna com setas.

        A cliente desenhou o ciclo vertical no documento, com nove setas para
        baixo. Nove blocos empilhados ocupam duas telas de celular e a pessoa
        rola tudo sem ver o ciclo. Em linha que quebra, o caminho inteiro cabe
        num olhar, e a última etapa volta ao começo por estar ao lado dele.
      */}
      <ol className="reveal mt-10 flex flex-wrap items-center justify-center gap-2">
        {copy.steps.map((etapa, indice) => (
          <li key={etapa} className="flex items-center gap-2">
            <span className="rounded-full border border-primary/40 bg-primary/5 px-4 py-2 text-sm font-medium text-foreground">
              {etapa}
            </span>
            {indice < copy.steps.length - 1 ? (
              <ArrowRight className="size-4 shrink-0 text-primary/60" aria-hidden />
            ) : null}
          </li>
        ))}
      </ol>

      <div className="reveal mt-10 text-center">
        <p className="text-lg font-semibold text-primary">{copy.closing1}</p>
        <p className="mt-2 text-pretty text-muted-foreground">{copy.closing2}</p>
        <p className="mt-1 text-pretty text-muted-foreground">{copy.closing3}</p>
      </div>
    </section>
  );
}

/* ========================================================================== *
 * EVOLUÇÃO
 * ========================================================================== */

export function EvolutionSection({ copy }: { copy: LandingCopy["evolution"] }) {
  return (
    <section className="border-y border-border/70 bg-surface/30">
      <div className="mx-auto w-full max-w-5xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="reveal">
          <BarChart3 className="size-7 text-primary" aria-hidden />
          <h2 className="mt-5 text-2xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">
            {copy.title}
          </h2>
          <p className="mt-3 text-pretty text-muted-foreground sm:text-lg">
            {copy.subtitle}
          </p>
        </div>

        <ul className="reveal mt-10 grid gap-4 sm:grid-cols-3">
          {copy.items.map((item) => (
            <li key={item.title} className="rounded-2xl border border-border bg-card p-6">
              <p className="font-semibold text-pretty text-foreground">{item.title}</p>
              <p className="mt-2 text-pretty text-sm text-muted-foreground">{item.body}</p>
            </li>
          ))}
        </ul>

        <p className="reveal mt-8 text-pretty font-medium text-foreground">{copy.closing}</p>
      </div>
    </section>
  );
}

/* ========================================================================== *
 * TEMPO E "ESTUDAR MELHOR"
 * ========================================================================== */

export function TimeSection({
  copy,
  better,
}: {
  copy: LandingCopy["time"];
  better: LandingCopy["better"];
}) {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="reveal lg:col-span-5">
          <Clock className="size-7 text-primary" aria-hidden />
          <h2 className="mt-5 text-2xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">
            {copy.title}
          </h2>

          <ul className="mt-6 flex flex-col gap-1">
            {copy.items.map((item) => (
              <li key={item} className="text-pretty text-muted-foreground sm:text-lg">
                {item}
              </li>
            ))}
          </ul>

          <p className="mt-6 text-pretty text-foreground">{copy.closing1}</p>
          <p className="text-pretty font-semibold text-foreground">{copy.closing2}</p>
        </div>

        <div className="reveal lg:col-span-7">
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 sm:p-8">
            <h3 className="text-xl font-bold text-balance text-foreground sm:text-2xl">
              {better.title}
            </h3>
            <p className="text-xl font-bold text-balance text-primary sm:text-2xl">
              {better.subtitle}
            </p>

            <ul className="mt-6 flex flex-col gap-2">
              {better.items.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span className="text-pretty text-foreground">{item}</span>
                </li>
              ))}
            </ul>

            <p className="mt-6 text-pretty text-sm font-medium text-muted-foreground">
              {better.closing}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ========================================================================== *
 * QUANTO VALE
 * ========================================================================== */

export function WorthSection({
  copy,
  cta,
}: {
  copy: LandingCopy["worth"];
  cta: string;
}) {
  return (
    <section className="border-y border-border/70 bg-surface/30">
      <div className="mx-auto w-full max-w-3xl px-4 py-20 text-center sm:px-6 sm:py-28">
        <h2 className="reveal text-2xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">
          {copy.title}
        </h2>

        <p className="reveal mt-5 text-pretty text-muted-foreground sm:text-lg">
          {copy.intro}
        </p>

        <ul className="reveal mt-8 flex flex-col gap-3">
          {copy.questions.map((pergunta) => (
            <li key={pergunta} className="text-pretty text-foreground sm:text-lg">
              {pergunta}
            </li>
          ))}
        </ul>

        <p className="reveal mt-10 text-pretty text-muted-foreground">{copy.closing1}</p>
        <p className="reveal text-pretty text-muted-foreground">{copy.closing2}</p>
        <p className="reveal mt-2 text-3xl font-bold text-primary sm:text-4xl">
          {copy.closing3}
        </p>

        {/*
          ⚠️ BOTÃO AQUI, e a cliente não pediu.

          Palavras dela: "não especifiquei botões, mas pode incluir onde achar
          necessário". Esta é a seção de maior intenção da página: quem acabou
          de pensar no que a aprovação vale está no melhor momento para começar,
          e mandá-lo rolar até o fim para achar o botão perde essa pessoa.
        */}
        <div className="reveal mt-9 flex justify-center">
          <Button asChild size="lg" className="glow-ring">
            <Link href="/cadastrar">
              {cta}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ========================================================================== *
 * PERGUNTAS FREQUENTES
 * ========================================================================== */

export function FaqSection({ copy }: { copy: LandingCopy["faq"] }) {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6 sm:py-28">
      <div className="reveal flex items-center gap-3">
        <CircleHelp className="size-6 shrink-0 text-primary" aria-hidden />
        <h2 className="text-2xl font-bold tracking-tight text-balance text-foreground sm:text-3xl">
          {copy.title}
        </h2>
      </div>

      {/*
        ⚠️ `<details>` NATIVO, sem JavaScript.

        Abrir e fechar é a única interação aqui. Um acordeão em React custaria
        estado, animação e um componente de cliente numa página que hoje é
        estática — e o `<details>` já vem com teclado e leitor de tela prontos.
      */}
      <ul className="reveal mt-8 flex flex-col gap-2">
        {copy.items.map((item) => (
          <li key={item.question}>
            <details className="group rounded-xl border border-border bg-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-pretty font-medium text-foreground">
                {item.question}
                <span
                  className="shrink-0 text-xl leading-none text-primary transition-transform group-open:rotate-45"
                  aria-hidden
                >
                  +
                </span>
              </summary>

              <p className="border-t border-border px-5 py-4 text-pretty text-sm text-muted-foreground">
                {item.answer}
              </p>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
