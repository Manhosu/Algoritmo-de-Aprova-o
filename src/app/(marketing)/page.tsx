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

import { Surface } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/config/app";

export const metadata: Metadata = {
  title: "Estude o que importa, na ordem certa",
  description: APP_DESCRIPTION,
};

/**
 * Landing page pública (README 1.3).
 *
 * A tarefa dela é comunicar o DIFERENCIAL, não listar recursos: o aluno não
 * monta o próprio planejamento — o sistema monta e reajusta conforme o
 * desempenho real. Uma landing que abrisse com "banco de questões comentadas"
 * venderia o produto errado, porque é isso que todo concorrente tem.
 *
 * Por isso a estrutura é: promessa → como funciona em 4 passos → o que torna
 * diferente → chamada.
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

const DIFFERENTIALS = [
  {
    icon: <Target />,
    title: "Dois motores, não um",
    body: "Um decide o que estudar hoje cruzando cinco sinais: seu desempenho, o peso no edital, a proximidade da prova, há quanto tempo você não vê o assunto e onde estão suas lacunas. O outro cuida das revisões, em trilho próprio.",
  },
  {
    icon: <RefreshCw />,
    title: "Revisão que não depende da sua memória",
    body: "Todo conteúdo estudado volta em 24 horas, 7, 30, 60 e 90 dias. Se você atrasar, ela não some — acumula, e o intervalo seguinte conta a partir do dia em que você realmente revisou.",
  },
  {
    icon: <CalendarClock />,
    title: "Cronograma que se refaz sozinho",
    body: "Ele muda quando você responde questões, conclui um estudo, adianta ou atrasa um dia. E avisa quando o conteúdo que falta não cabe no tempo que você tem até a prova.",
  },
];

export default function LandingPage() {
  return (
    <>
      {/* ------------------------------------------------------------------ */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-eyebrow">{APP_NAME}</p>

          <h1 className="mt-4 text-3xl font-bold tracking-tight text-balance text-foreground sm:text-5xl">
            Pare de decidir o que estudar.{" "}
            <span className="text-primary">Comece a estudar.</span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">
            Você sobe o edital do seu concurso. A partir dele, a plataforma monta
            seu plano de estudo e o reajusta a cada questão que você responde.
            Sem planilha, sem cronograma que envelhece na primeira semana.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/cadastrar">
                Começar agora, é grátis
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <Link href="#como-funciona">Ver como funciona</Link>
            </Button>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            Não pedimos cartão para começar.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      <section
        id="como-funciona"
        className="border-y border-border bg-surface/40 py-14 sm:py-20"
      >
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-eyebrow">Como funciona</p>
            <h2 className="mt-3 text-2xl font-bold text-balance text-foreground sm:text-3xl">
              Do PDF do edital à tarefa de hoje
            </h2>
          </div>

          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <Surface className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/40 bg-primary-soft text-primary [&>svg]:size-5"
                      aria-hidden
                    >
                      {step.icon}
                    </span>
                    <span className="text-metric text-sm text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="font-semibold text-foreground">{step.title}</h3>
                  <p className="text-sm text-pretty text-muted-foreground">{step.body}</p>
                </Surface>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-eyebrow">O diferencial</p>
          <h2 className="mt-3 text-2xl font-bold text-balance text-foreground sm:text-3xl">
            Não é um banco de questões com cronograma em cima
          </h2>
          <p className="mt-4 text-pretty text-muted-foreground">
            As questões são o sensor, não o produto. O que a plataforma faz é
            decidir por você — e mudar de ideia quando os seus resultados mudam.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {DIFFERENTIALS.map((item) => (
            <Surface key={item.title} className="flex flex-col gap-3 p-6">
              <span
                className="flex size-11 items-center justify-center rounded-xl border border-primary/40 bg-primary-soft text-primary [&>svg]:size-5"
                aria-hidden
              >
                {item.icon}
              </span>
              <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
              <p className="text-sm text-pretty text-muted-foreground">{item.body}</p>
            </Surface>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
        <Surface glow className="flex flex-col items-center gap-5 px-6 py-12 text-center">
          <p className="text-lg font-medium text-balance text-primary sm:text-xl">
            {APP_TAGLINE}
          </p>
          <h2 className="max-w-xl text-2xl font-bold text-balance text-foreground sm:text-3xl">
            Sua próxima sessão de estudo já está decidida.
          </h2>
          <Button asChild size="lg">
            <Link href="/cadastrar">
              Criar minha conta
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </Surface>
      </section>
    </>
  );
}
