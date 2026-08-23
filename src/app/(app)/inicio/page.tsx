import { ArrowRight, FileUp, Loader2, ListChecks, Target } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState, Metric, SectionTitle, Surface } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import { APP_TAGLINE } from "@/config/app";
import { getStudentContext } from "@/server/auth/current-user";
import { LOGIN_ROUTE } from "@/config/routes";

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
        <ActiveDashboard preparationTitle={preparation.title} />
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
 * Ainda mostra o esqueleto: as Missões do Dia e as métricas entram quando o
 * serviço que gera a tarefa estiver ligado. Deixar o card visível e vazio é
 * melhor que escondê-lo — o aluno vê onde a informação vai aparecer.
 */
function ActiveDashboard({ preparationTitle }: { preparationTitle: string }) {
  return (
    <>
      <Surface className="p-4 sm:p-5">
        <SectionTitle>{preparationTitle}</SectionTitle>
      </Surface>

      <Surface className="grid grid-cols-2 gap-y-5 py-5 sm:grid-cols-4">
        <Metric label="XP Total" value="0" hint="+0 hoje" hintTone="positive" />
        <Metric label="Questões" value="0" hint="—" />
        <Metric label="Revisões" value="0" hint="—" />
        <Metric label="Sequência" value="0" hint="dias" />
      </Surface>

      <Surface>
        <div className="px-4 pt-4 sm:px-5">
          <SectionTitle icon={<Target className="size-4" />}>Missões do Dia</SectionTitle>
        </div>
        <EmptyState
          title="Sua tarefa de hoje está sendo montada"
          description="Assim que o motor rodar pela primeira vez, as missões aparecem aqui."
        />
      </Surface>
    </>
  );
}
