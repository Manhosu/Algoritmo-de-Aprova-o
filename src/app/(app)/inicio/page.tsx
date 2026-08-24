import { ArrowRight, CalendarClock, FileUp, Loader2, ListChecks, Target } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DailyMissions, type DailyMission } from "@/components/daily-task/daily-missions";
import { EmptyState, Metric, SectionTitle, Surface } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import { APP_TAGLINE } from "@/config/app";
import type { LinkableTechnique } from "@/lib/deep-links";
import { getStudentContext } from "@/server/auth/current-user";
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

  return (
    <div className="flex flex-col gap-4">
      <header className="sm:hidden">
        <h1 className="text-lg font-semibold text-foreground">
          {context.user.name?.trim().split(/\s+/)[0]
            ? `Olá, ${context.user.name.trim().split(/\s+/)[0]}!`
            : "Olá!"}
        </h1>
        <p className="text-sm text-balance text-muted-foreground">{APP_TAGLINE}</p>
      </header>

      {preparation === null ? (
        <NoPreparation />
      ) : preparation.status === "draft" ? (
        <ResumeStep
          title="Falta enviar o edital"
          body="Sua preparação foi criada, mas ainda não recebeu o PDF do edital. É a partir dele que o plano é montado."
          href={`/preparacoes/${preparation.id}/edital`}
          cta="Enviar o edital"
          icon={<FileUp />}
        />
      ) : preparation.status === "extracting" ? (
        <Processing preparationId={preparation.id} />
      ) : preparation.status === "review_pending" ? (
        <ResumeStep
          title="Confira o que a IA leu"
          body="O conteúdo programático foi extraído do seu edital. Antes de continuar, corrija o que estiver errado e preencha os pesos que faltarem."
          href={`/preparacoes/${preparation.id}/conteudo`}
          cta="Revisar o conteúdo"
          icon={<ListChecks />}
        />
      ) : preparation.status === "diagnosis_pending" ? (
        <ResumeStep
          title="Falta o diagnóstico"
          body="Diga o quanto você domina cada disciplina. São poucos cliques, e é o ponto de partida do algoritmo."
          href={`/preparacoes/${preparation.id}/diagnostico`}
          cta="Fazer o diagnóstico"
          icon={<Target />}
        />
      ) : preparation.status === "failed" ? (
        <ResumeStep
          title="Não conseguimos ler seu edital"
          body="A leitura do PDF falhou. Envie o arquivo de novo, de preferência a versão original do site da banca."
          href={`/preparacoes/${preparation.id}/edital`}
          cta="Enviar outro arquivo"
          icon={<FileUp />}
        />
      ) : (
        <ActiveDashboard
          preparationId={preparation.id}
          preparationTitle={preparation.title}
          userId={context.user.id}
        />
      )}
    </div>
  );
}

/* ========================================================================== *
 * ESTADOS
 * ========================================================================== */

function NoPreparation() {
  return (
    <Surface glow>
      <EmptyState
        icon={<FileUp />}
        title="Comece pelo edital"
        description="Suba o PDF do concurso que você vai fazer. A partir dele o sistema monta seu plano de estudo e passa a decidir o que você estuda cada dia."
        action={
          <Button asChild size="lg" className="mt-2">
            <Link href="/preparacoes/nova">
              Criar minha preparação
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        }
      />
    </Surface>
  );
}

function ResumeStep({
  title,
  body,
  href,
  cta,
  icon,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
  icon: React.ReactNode;
}) {
  return (
    <Surface glow>
      <EmptyState
        icon={icon}
        title={title}
        description={body}
        action={
          <Button asChild size="lg" className="mt-2">
            <Link href={href}>
              {cta}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
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
function Processing({ preparationId }: { preparationId: string }) {
  return (
    <Surface glow>
      <meta httpEquiv="refresh" content="6" />
      <EmptyState
        icon={<Loader2 className="animate-spin" />}
        title="Lendo seu edital"
        description="A IA está identificando as disciplinas e os assuntos. Costuma levar menos de um minuto — pode deixar esta tela aberta."
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
}: {
  preparationId: string;
  preparationTitle: string;
  userId: string;
}) {
  await ensureGamificationState(userId);
  const home = await getHomeData({ userId, preparationId });

  return (
    <>
      <Surface className="p-4 sm:p-5">
        <SectionTitle>{preparationTitle}</SectionTitle>
      </Surface>

      <Surface className="grid grid-cols-2 gap-y-5 py-5 sm:grid-cols-4">
        <Metric
          label="XP Total"
          value={formatNumber(home.stats.totalXp)}
          hint={`+${formatNumber(home.stats.xpToday)} hoje`}
          hintTone={home.stats.xpToday > 0 ? "positive" : "neutral"}
        />
        <Metric
          label="Questões"
          value={formatNumber(home.stats.questionsAnswered)}
          hint="respondidas"
        />
        <Metric
          label="Revisões"
          value={formatNumber(home.stats.reviewsPending)}
          hint="para hoje"
        />
        <Metric
          label="Sequência"
          value={formatNumber(home.stats.currentStreak)}
          hint={home.stats.currentStreak === 1 ? "dia" : "dias"}
        />
      </Surface>

      <MissionsCard home={home} />
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
    },
    practice: block.practice
      ? {
          status: block.practice.done ? "completed" : "pending",
          // O XP da prática é por questão respondida; mostrar o valor de UMA
          // resposta certa é honesto e não promete um total que depende de
          // quantas o aluno acerta.
          xp: home.xp.questionCorrect,
        }
      : undefined,
    reasonLabel: block.reasonLabel,
  }));

  return <DailyMissions missions={missions} completionBonusXp={home.xp.dailyGoal} />;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}
