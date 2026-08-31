import {
  ArrowRight,
  CalendarClock,
  ChevronRight,
  FileUp,
  ListChecks,
  Loader2,
  Target,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DailyMissions, type DailyMission } from "@/components/daily-task/daily-missions";
import {
  BestTechniqueCard,
  EvolutionCard,
  LevelCard,
  PreparationIndexCard,
  QuickAccess,
  ReviewsTodayCard,
  StatsStrip,
  StreakCard,
  SubjectPerformanceCard,
} from "@/components/home/dashboard-cards";
import { EmptyState, SectionTitle, Surface } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import { APP_TAGLINE, APP_TIMEZONE } from "@/config/app";
import { examCountdown } from "@/modules/metrics";
import { toCivilDate } from "@/modules/shared/dates";
import type { LinkableTechnique } from "@/lib/deep-links";
import {
  nextStep,
  type NextStep,
  type NextStepIcon,
} from "@/modules/onboarding/next-step";
import { getStudentContext } from "@/server/auth/current-user";
import { expireStuckExtraction } from "@/server/preparations/edital";
import { LOGIN_ROUTE } from "@/config/routes";
import { ensureGamificationState, getHomeData, type HomeData } from "@/server/home/dashboard";

export const metadata: Metadata = { title: "Home" };

/**
 * Home do aluno.
 *
 * A tela é ROTEADORA antes de ser painel: o que o aluno vê depende do estágio
 * em que ele está, e mostrar um painel de métricas zeradas para quem ainda não
 * subiu edital seria pior que não mostrar nada — passa a impressão de produto
 * vazio bem no primeiro contato.
 *
 * Os estágios seguem `preparations.status`, que é também o funil de ativação do
 * painel administrativo.
 */
export default async function HomePage() {
  const context = await getStudentContext();
  if (!context) redirect(LOGIN_ROUTE);

  // Sem disponibilidade, o motor não sabe dimensionar o dia. É o primeiro passo.
  if (!context.hasAvailability) redirect("/boas-vindas");

  const preparation = context.currentPreparation;
  const firstName = context.user.name?.trim().split(/\s+/)[0] || null;
  /*
    ⚠️ CURA ANTES DE DECIDIR O QUE MOSTRAR.

    Se a leitura do edital morreu no meio, a preparação fica em `extracting`
    para sempre e esta tela gira sem fim. `expireStuckExtraction` marca a
    leitura como falha depois do tempo limite, e aí o próximo `nextStep` já
    devolve "não conseguimos ler seu edital" com o botão de reenviar.

    Custa uma consulta, e SÓ nesse estado — que é o único em que o aluno pode
    estar preso.
  */
  if (preparation?.status === "extracting") {
    const curou = await expireStuckExtraction(preparation.id);
    if (curou) preparation.status = "failed";
  }

  const pendente = nextStep(preparation);

  const countdown = preparation
    ? examCountdown(
        toCivilDate(new Date(), APP_TIMEZONE),
        preparation.examDate,
        preparation.examDateIsEstimated,
      )
    : null;

  return (
    <div className="flex flex-col gap-4">
      {/*
        ⚠️ A CONTAGEM APARECE AQUI PORQUE O CABEÇALHO NÃO A MOSTRA NO CELULAR.

        Em 390px o cabeçalho fica só com o símbolo da marca — a saudação e a
        linha "faltam X dias" não cabem ao lado do streak e do avatar. A cliente
        notou a diferença: no computador a contagem aparecia, no celular não.

        A linha vive aqui, onde há largura inteira, e substitui a tagline quando
        existe data: quantos dias faltam é informação, a tagline é decoração.
      */}
      <header className="sm:hidden">
        <h1 className="text-lg font-semibold text-foreground">
          {firstName ? `Olá, ${firstName}!` : "Olá!"}
        </h1>
        <p className="text-sm text-balance text-muted-foreground">
          {countdown?.daysLeft !== null && countdown ? countdown.label : APP_TAGLINE}
        </p>
      </header>

      {/*
        ⚠️ O TEXTO VEM DE `modules/onboarding/next-step`, e a APRESENTAÇÃO fica
        aqui. A decisão de qual é o próximo passo era um `if` gigante só desta
        tela, e as outras (Cronograma, Revisões) não tinham como saber: quem
        clicava em Cronograma antes de subir o edital recebia um botão de volta
        para cá em vez do caminho.

        A Home mantém a apresentação própria porque ela é diferente de verdade:
        superfície acesa, botão grande e, no estado de leitura, uma tela que se
        atualiza sozinha.
      */}
      {pendente === null ? (
        <ActiveDashboard
          preparationId={preparation!.id}
          preparationTitle={preparation!.title}
          userId={context.user.id}
          firstName={firstName}
        />
      ) : pendente.icon === "processing" ? (
        <Processing step={pendente} preparationId={preparation!.id} />
      ) : (
        <ResumeStep step={pendente} />
      )}
    </div>
  );
}

/* ========================================================================== *
 * ESTADOS
 * ========================================================================== */

/** Os ícones que a Home usa para cada intenção de `nextStep`. */
const ICONES: Record<NextStepIcon, React.ReactNode> = {
  create: <FileUp />,
  upload: <FileUp />,
  review: <ListChecks />,
  diagnosis: <Target />,
  processing: <Loader2 className="animate-spin" />,
};

function ResumeStep({ step }: { step: NextStep }) {
  const { title, body, href, cta } = step;
  const icon = ICONES[step.icon];

  return (
    <Surface glow>
      <EmptyState
        icon={icon}
        title={title}
        description={body}
        action={
          <div className="mt-2 flex flex-col items-center gap-2">
            <Button asChild size="lg">
              <Link href={href}>
                {cta}
                <ArrowRight aria-hidden />
              </Link>
            </Button>

            {/* A segunda saída, quando existe: hoje só o cadastro à mão. */}
            {step.alternative ? (
              <Link
                href={step.alternative.href}
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                {step.alternative.label}
              </Link>
            ) : null}
          </div>
        }
      />
    </Surface>
  );
}

/**
 * Extração em andamento.
 *
 * A página recarrega sozinha a cada 6 segundos. É deliberadamente simples:
 * a leitura de um edital leva de trinta segundos a alguns minutos, e montar
 * WebSocket para um evento que acontece uma vez por preparação seria caro
 * demais para o ganho.
 */
function Processing({ step, preparationId }: { step: NextStep; preparationId: string }) {
  return (
    <Surface glow>
      <meta httpEquiv="refresh" content="6" />
      <EmptyState
        icon={<Loader2 className="animate-spin" />}
        title={step.title}
        description={`${step.body} Pode deixar esta tela aberta.`}
        action={
          <p className="mt-1 text-xs text-muted-foreground">
            Preparação {preparationId.slice(0, 8)}
          </p>
        }
      />
    </Surface>
  );
}

/**
 * Painel do aluno com preparação ativa.
 *
 * A Tarefa do Dia é gerada AQUI, na primeira visita do dia — não num job
 * noturno. Um job precisaria saber a virada do dia no fuso de cada aluno e
 * rodaria para quem talvez nem abra o app; gerando na visita, a tarefa reflete
 * também o que foi estudado ontem à noite. Ver `getHomeData`.
 */
async function ActiveDashboard({
  preparationId,
  preparationTitle,
  userId,
  firstName,
}: {
  preparationId: string;
  preparationTitle: string;
  userId: string;
  firstName: string | null;
}) {
  await ensureGamificationState(userId);
  const home = await getHomeData({ userId, preparationId });

  /*
   * O ARRANJO DO MOCKUP.
   *
   * Duas colunas a partir de `lg`: a larga carrega o que o aluno lê (nível,
   * métricas, desempenho, evolução) e a estreita carrega o que ele FAZ hoje
   * (sequência, missões, revisões).
   *
   * ⚠️ No celular vira uma coluna só, e a ORDEM MUDA: as missões sobem para
   * logo depois das métricas. O mockup é de tela grande, onde a coluna da
   * direita está sempre à vista; empilhado, seguir a ordem visual dele
   * empurraria a tarefa do dia — que é a razão de o aluno abrir o app — para
   * depois de dois gráficos.
   */
  return (
    <>
      {/* O título é o caminho para trocar de preparação (README 1.10). Era o
          lugar onde o aluno naturalmente tentaria clicar. */}
      <Surface className="p-0">
        <Link
          href="/preparacoes"
          className="flex items-center gap-3 p-4 transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-5"
        >
          <span className="min-w-0 flex-1">
            <SectionTitle>{preparationTitle}</SectionTitle>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      </Surface>

      <LevelCard level={home.level} firstName={firstName} />

      <StatsStrip stats={home.stats} />

      {/*
        ⚠️ `min-w-0` NAS DUAS COLUNAS — sem ele o painel inteiro estoura.

        Item de grid nasce com `min-width: auto`, ou seja, ele NÃO encolhe
        abaixo do conteúdo. Basta um texto com `truncate` (que impõe
        `white-space: nowrap`) para o conteúdo não ter largura mínima: a coluna
        cresce até caber a frase inteira numa linha só.

        Foi assim que um assunto de 190 caracteres numa revisão esticou a Home
        de 390px para 1402px. O `main` continuava com 390 e ficava espremido à
        esquerda de uma tela larguíssima; o menu lateral, que é `fixed inset-0`,
        cobria só os 390 da viewport e parecia "não se sobrepor ao conteúdo"; e
        o botão "+" da barra inferior nunca ficava centralizado.

        Três sintomas que a cliente relatou em telas diferentes, todos deste
        `min-width: auto`.
      */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-8">
          {/* No celular as missões vêm primeiro; no desktop, na coluna da direita. */}
          <div className="lg:hidden">
            <MissionsCard home={home} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SubjectPerformanceCard
              subjects={home.subjects}
              answersOutOfPlan={home.answersOutOfPlan}
            />
            <PreparationIndexCard index={home.preparationIndex} />
          </div>

          <EvolutionCard points={home.evolution} />
          <BestTechniqueCard best={home.bestTechnique} />
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:col-span-4">
          <StreakCard
            currentStreak={home.stats.currentStreak}
            longestStreak={home.stats.longestStreak}
            week={home.streakWeek}
          />

          <div className="hidden lg:block">
            <MissionsCard home={home} />
          </div>

          <ReviewsTodayCard reviews={home.reviewsToday} />
        </div>
      </div>

      <QuickAccess />
    </>
  );
}

/**
 * O card único de Missões do Dia (decisão da cliente em 21/08/2026).
 *
 * Quando não há missões, o card diz POR QUÊ. "Nenhuma missão hoje" sem
 * explicação faz o aluno concluir que o produto quebrou — e cada motivo aqui
 * tem uma ação diferente do lado dele.
 */
function MissionsCard({ home }: { home: HomeData }) {
  if (home.missions === null || home.missions.blocks.length === 0) {
    if (home.missionsSkippedReason === "no_availability") {
      return (
        <Surface>
          <EmptyState
            icon={<CalendarClock />}
            title="Hoje é seu dia de folga"
            description="Você marcou este dia da semana como sem estudo. Se mudou de ideia, é só ajustar sua disponibilidade."
            action={
              <Button asChild variant="outline" className="mt-2">
                {/* `editar=1` abre a tela mesmo com a disponibilidade já
                    preenchida; sem isso ela redirecionaria de volta para cá. */}
                <Link href="/boas-vindas?editar=1">Ajustar disponibilidade</Link>
              </Button>
            }
          />
        </Surface>
      );
    }

    return (
      <Surface>
        <div className="px-4 pt-4 sm:px-5">
          <SectionTitle icon={<Target className="size-4" />}>Missões do Dia</SectionTitle>
        </div>
        <EmptyState
          title="Nenhuma missão para hoje"
          description="Não encontramos assuntos ativos no seu plano. Confira o conteúdo da sua preparação."
        />
      </Surface>
    );
  }

  const missions: DailyMission[] = home.missions.blocks.map((block) => ({
    blockIndex: block.blockIndex,
    topicName: block.topicName,
    subjectName: block.subjectName,
    topicSlug: block.topicSlug,
    technique: block.study.technique as LinkableTechnique | null,
    contentItemId: block.study.contentItemId,
    materialCount: block.study.materialCount,
    study: {
      status: block.study.done ? "completed" : "pending",
      xp: home.xp.study,
      itemId: block.study.itemId,
    },
    practice: block.practice
      ? {
          status: block.practice.done ? "completed" : "pending",
          // O XP da prática é por questão respondida; mostrar o valor de UMA
          // resposta certa é honesto e não promete um total que depende de
          // quantas o aluno acerta.
          xp: home.xp.questionCorrect,
          /*
            ⚠️ SEM ESTE `itemId`, A LINHA "PRATIQUE" NUNCA SE RISCA.

            Ele é o que vai no `?tarefa=` do link e liga a resposta de volta à
            Tarefa do Dia. Faltava aqui — o `study` logo acima tinha, o
            `practice` não —, então o link saía sem o parâmetro e o XP da
            prática jamais entrava na soma do dia.

            O tipo o declarava OPCIONAL, então nada reclamou: nem o TypeScript,
            nem o teste do link, que checava a função e não quem a chama.
          */
          itemId: block.practice.itemId,
        }
      : undefined,
    reasonLabel: block.reasonLabel,
  }));

  return <DailyMissions missions={missions} completionBonusXp={home.xp.dailyGoal} />;
}

