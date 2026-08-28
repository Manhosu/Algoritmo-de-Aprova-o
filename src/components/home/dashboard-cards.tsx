import { ArrowRight, Coins, Flame, RotateCcw, Target, Timer, Trophy } from "lucide-react";
import Link from "next/link";

import { Gauge, LabeledBar, SectionTitle, Surface } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import { reviewLink } from "@/lib/deep-links";
import { cn } from "@/lib/utils";
import type { BestTechnique, EvolutionPoint } from "@/modules/metrics";
import type { LevelProgress } from "@/modules/gamification";
import type { HomeData, StreakDay, SubjectPerformance } from "@/server/home/dashboard";

/**
 * OS CARDS DO PAINEL DO ALUNO.
 * ============================================================================
 *
 * Recorte fiel ao mockup da cliente: card de nível, faixa de métricas,
 * desempenho por disciplina, o medidor, sequência, revisões de hoje, evolução
 * e melhor técnica.
 *
 * ⚠️ NENHUM CARD INVENTA NÚMERO. Cada um recebe dado real de `getHomeData` e
 * some — ou explica — quando o dado ainda não existe. Um painel que mostra
 * "78/100" no primeiro dia de uso, antes de qualquer questão respondida, é
 * mais grave do que um painel incompleto: ele ensina o aluno a não confiar nos
 * números, e o produto inteiro depende de ele confiar.
 */

/* ========================================================================== *
 * NÍVEL E XP
 * ========================================================================== */

/**
 * O card de nível, no topo do mockup.
 *
 * ⚠️ O nome do nível vem da TABELA `levels`, não de constante. O mockup diz
 * "NÍVEL 4 AVANÇADO"; a escada atual do produto é outra, e vai mudar de novo
 * sem deploy. Escrever "AVANÇADO" aqui deixaria a tela mentindo no dia da
 * primeira mudança.
 */
export function LevelCard({
  level,
  firstName,
}: {
  level: LevelProgress;
  firstName: string | null;
}) {
  return (
    <Surface glow className="relative overflow-hidden p-5 sm:p-6">
      {/* O brilho ocupa o lugar da ilustração de cérebro do mockup. */}
      <div
        className="pointer-events-none absolute -top-16 -right-16 size-64 rounded-full bg-primary/10 blur-3xl"
        aria-hidden
      />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
        <span
          className="flex size-20 shrink-0 items-center justify-center rounded-full border-2 border-primary/60 bg-primary-soft text-2xl sm:size-24 sm:text-3xl"
          aria-hidden
        >
          {level.current.emoji ?? "🎯"}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Nível {level.current.levelNumber}
          </p>
          <p className="text-2xl font-bold tracking-tight text-primary uppercase sm:text-4xl">
            {level.current.name}
          </p>

          <div
            className="mt-4 h-2 w-full overflow-hidden rounded-full bg-secondary"
            aria-hidden
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-700"
              style={{ width: `${level.percentToNext}%` }}
            />
          </div>

          <p className="text-metric mt-2.5 text-sm text-foreground">
            {formatNumber(level.current.minXp + level.xpIntoLevel)}
            {level.next ? ` / ${formatNumber(level.next.minXp)} XP` : " XP"}
          </p>

          <p className="mt-1 text-sm text-muted-foreground">
            {level.next ? (
              <>
                Faltam{" "}
                <span className="text-primary">
                  {formatNumber(level.xpToNextLevel ?? 0)} XP
                </span>{" "}
                para o próximo nível
              </>
            ) : (
              // Sem isto, quem chega ao topo vê uma barra cheia sem explicação.
              "Você chegou ao último nível."
            )}
          </p>
        </div>
      </div>

      {firstName ? (
        <p className="relative mt-5 border-t border-border pt-4 text-sm text-muted-foreground">
          Continue assim, {firstName}. O plano de hoje está logo abaixo.
        </p>
      ) : null}
    </Surface>
  );
}

/* ========================================================================== *
 * FAIXA DE MÉTRICAS
 * ========================================================================== */

/**
 * A faixa de cinco números do mockup.
 *
 * ⚠️ "Moedas" aparece SEM o "use na loja" do mockup: a loja é Marco 2 e não
 * existe. Um atalho para uma tela inexistente é pior que atalho nenhum — e
 * prometer troca de moedas que ninguém pode fazer queima a confiança no
 * primeiro clique.
 */
export function StatsStrip({ stats }: { stats: HomeData["stats"] }) {
  const accuracy =
    stats.questionsAnswered > 0
      ? Math.round((stats.questionsCorrect / stats.questionsAnswered) * 100)
      : null;

  const items = [
    {
      label: "XP Total",
      value: formatNumber(stats.totalXp),
      // "comece hoje" ao lado de 5.740 XP e 30 dias de sequência soava como se
      // o sistema não conhecesse o aluno. O que falta é XP DE HOJE, só isso.
      hint: stats.xpToday > 0 ? `+${formatNumber(stats.xpToday)} hoje` : "nada ainda hoje",
      positive: stats.xpToday > 0,
    },
    {
      label: "Horas estudadas",
      value: formatHours(stats.studyMinutesTotal),
      hint:
        stats.studyMinutesToday > 0
          ? `+${formatHours(stats.studyMinutesToday)} hoje`
          : "nada ainda hoje",
      positive: stats.studyMinutesToday > 0,
    },
    {
      label: "Questões resolvidas",
      value: formatNumber(stats.questionsAnswered),
      // Percentual só depois de existir amostra: "0% de acertos" em quem nunca
      // respondeu é uma acusação, não uma métrica.
      hint: accuracy === null ? "nenhuma ainda" : `${accuracy}% de acertos`,
      positive: accuracy !== null && accuracy >= 70,
    },
    {
      label: "Revisões feitas",
      value: formatNumber(stats.reviewsCompleted),
      hint:
        stats.reviewsCompletedToday > 0
          ? `+${stats.reviewsCompletedToday} hoje`
          : `${formatNumber(stats.reviewsPending)} para hoje`,
      positive: stats.reviewsCompletedToday > 0,
    },
    {
      label: "Moedas",
      value: formatNumber(stats.coinBalance),
      hint: "acumulando",
      positive: false,
    },
  ];

  return (
    <Surface className="grid grid-cols-2 gap-y-5 py-5 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex flex-col items-center gap-1 px-2 text-center"
        >
          <span className="text-[0.6rem] leading-tight font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {item.label}
          </span>
          <span className="text-metric text-2xl text-foreground sm:text-3xl">
            {item.value}
          </span>
          <span
            className={cn(
              "text-xs",
              item.positive ? "text-success" : "text-muted-foreground",
            )}
          >
            {item.hint}
          </span>
        </div>
      ))}
    </Surface>
  );
}

/* ========================================================================== *
 * DESEMPENHO POR DISCIPLINA
 * ========================================================================== */

export function SubjectPerformanceCard({ subjects }: { subjects: SubjectPerformance[] }) {
  return (
    <Surface className="flex flex-col p-4 sm:p-5">
      <SectionTitle icon={<Target className="size-4" />}>
        Desempenho por disciplina
      </SectionTitle>

      {subjects.length === 0 ? (
        <p className="mt-4 flex-1 text-sm text-pretty text-muted-foreground">
          Assim que você responder questões, cada disciplina aparece aqui com seu
          percentual de acerto.
        </p>
      ) : (
        <div className="mt-4 flex flex-1 flex-col gap-3">
          {subjects.map((subject) => (
            <LabeledBar
              key={subject.name}
              label={subject.name}
              percent={subject.accuracyPercent}
            />
          ))}
        </div>
      )}

      <Button asChild variant="outline" className="mt-5 w-full">
        <Link href="/questoes">
          Praticar questões
          <ArrowRight aria-hidden />
        </Link>
      </Button>
    </Surface>
  );
}

/* ========================================================================== *
 * ÍNDICE DE PREPARAÇÃO
 * ========================================================================== */

/**
 * O medidor circular do mockup.
 *
 * ⚠️ "ÍNDICE DE PREPARAÇÃO", e o mockup diz "ÍNDICE DE APROVAÇÃO".
 *
 * A troca é deliberada e foi decisão fechada: o número mede o ESTADO DA
 * PREPARAÇÃO — cobertura do edital, acerto, aderência às revisões e conclusão
 * das tarefas. Ele não é, e não tem como ser, uma probabilidade de passar no
 * concurso. Chamá-lo de "índice de aprovação" prometeria ao aluno uma
 * previsão que nenhum dado aqui sustenta.
 */
export function PreparationIndexCard({
  index,
}: {
  index: { value: number; label: string } | null;
}) {
  return (
    <Surface className="flex flex-col items-center p-4 text-center sm:p-5">
      <div className="w-full text-left">
        <SectionTitle>Índice de Preparação</SectionTitle>
      </div>

      {index === null ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8">
          <p className="text-metric text-5xl text-border">—</p>
          <p className="max-w-xs text-sm text-pretty text-muted-foreground">
            O índice aparece depois dos seus primeiros dias de estudo. Ele cruza
            sua cobertura do edital, seu acerto, suas revisões em dia e as
            tarefas concluídas.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center py-4">
          <Gauge value={index.value} label={index.label} size={168} />
        </div>
      )}

      <p className="mt-3 text-xs text-pretty text-muted-foreground">
        Mede o estado da sua preparação. Não é previsão de aprovação.
      </p>
    </Surface>
  );
}

/* ========================================================================== *
 * SEQUÊNCIA
 * ========================================================================== */

export function StreakCard({
  currentStreak,
  longestStreak,
  week,
}: {
  currentStreak: number;
  longestStreak: number;
  week: StreakDay[];
}) {
  return (
    <Surface className="p-4 sm:p-5">
      <SectionTitle icon={<Flame className="size-4" />}>Sequência atual</SectionTitle>

      <p className="mt-3 flex items-baseline gap-2">
        <span className="text-metric text-5xl text-foreground">{currentStreak}</span>
        <span className="text-lg font-semibold text-muted-foreground">
          {currentStreak === 1 ? "dia" : "dias"}
        </span>
      </p>

      <p className="mt-1 text-sm text-muted-foreground">
        Seu recorde: {longestStreak} {longestStreak === 1 ? "dia" : "dias"}
      </p>

      {/*
        A faixa "S T Q Q S S D" do mockup. Cada ponto é um dia real, e o de hoje
        ganha um anel — sem ele, o aluno não sabe onde a semana está.
      */}
      <ul className="mt-5 flex items-center justify-between">
        {week.map((day) => (
          <li key={day.date} className="flex flex-col items-center gap-2">
            <span className="text-[0.65rem] font-semibold text-muted-foreground uppercase">
              {day.initial}
            </span>
            <span
              className={cn(
                "size-3 rounded-full",
                day.hadActivity
                  ? "bg-primary"
                  : day.isFuture
                    ? // Dia que ainda vem: mais apagado que "não estudou", para
                      // a semana não parecer cheia de falhas na segunda-feira.
                      "bg-secondary/40"
                    : "bg-secondary",
                day.isToday && "ring-2 ring-primary/50 ring-offset-2 ring-offset-card",
              )}
              // O estado já está no texto abaixo, para leitor de tela.
              aria-hidden
            />
            <span className="sr-only">
              {day.hadActivity ? "estudou" : day.isFuture ? "ainda vem" : "sem estudo"}
              {day.isToday ? ", hoje" : ""}
            </span>
          </li>
        ))}
      </ul>
    </Surface>
  );
}

/* ========================================================================== *
 * REVISÕES PARA HOJE
 * ========================================================================== */

export function ReviewsTodayCard({ reviews }: { reviews: HomeData["reviewsToday"] }) {
  // Três no card, como no mockup. O resto fica atrás do "ver todas" — a Home
  // não é a tela de revisões.
  const shown = reviews.slice(0, 3);

  return (
    <Surface className="p-4 sm:p-5">
      <SectionTitle icon={<RotateCcw className="size-4" />}>
        Revisões para hoje
      </SectionTitle>

      {shown.length === 0 ? (
        <p className="mt-4 text-sm text-pretty text-muted-foreground">
          Nenhuma revisão vencendo hoje. As próximas aparecem conforme você
          conclui os estudos.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-border">
          {shown.map((review) => {
            const href = reviewLink(review.occurrenceId);

            return (
              <li
                key={review.occurrenceId}
                className="flex items-center gap-3 py-3 first:pt-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {review.topicName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {review.subjectName}
                    {review.isLate ? (
                      // Atrasada acumula, não some. Dizer há quantos dias é o
                      // que transforma a lista em prioridade.
                      <span className="text-destructive">
                        {" "}
                        · {review.daysLate}{" "}
                        {review.daysLate === 1 ? "dia atrasada" : "dias atrasada"}
                      </span>
                    ) : null}
                  </span>
                </span>

                {href ? (
                  <Button asChild size="sm" variant="outline" className="shrink-0">
                    <Link href={href}>Revisar</Link>
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <Button asChild variant="outline" className="mt-4 w-full">
        <Link href="/revisoes">
          Ver todas
          <ArrowRight aria-hidden />
        </Link>
      </Button>
    </Surface>
  );
}

/* ========================================================================== *
 * EVOLUÇÃO
 * ========================================================================== */

/**
 * O gráfico de linha do mockup.
 *
 * SVG desenhado à mão, sem biblioteca: são poucos pontos, uma polilinha e um
 * preenchimento. Uma biblioteca de gráficos custaria dezenas de KB e um limite
 * de cliente para desenhar o que aqui são duas funções de mapeamento — e este
 * componente continua sendo Server Component.
 */
export function EvolutionCard({ points }: { points: EvolutionPoint[] }) {
  return (
    <Surface className="p-4 sm:p-5">
      <SectionTitle>Evolução</SectionTitle>

      {points.length < 2 ? (
        <p className="mt-4 text-sm text-pretty text-muted-foreground">
          Com alguns dias de prática, seu percentual de acerto aparece aqui em
          forma de curva.
        </p>
      ) : (
        <>
          <EvolutionChart points={points} />
          <p className="mt-3 text-xs text-muted-foreground">
            Percentual de acerto por dia, nos últimos {points.length} dias com
            questões respondidas.
          </p>
        </>
      )}
    </Surface>
  );
}

function EvolutionChart({ points }: { points: EvolutionPoint[] }) {
  const width = 640;
  const height = 180;
  // 44 e não 32: com 32 o rótulo "100%" era cortado pela borda esquerda do SVG.
  const padding = { top: 12, right: 8, bottom: 24, left: 44 };

  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const x = (index: number) =>
    padding.left + (index / (points.length - 1)) * plotWidth;
  // O eixo é fixo em 0–100: escalar ao mínimo/máximo do aluno faria uma
  // oscilação de 3 pontos parecer uma montanha.
  const y = (percent: number) => padding.top + (1 - percent / 100) * plotHeight;

  const line = points.map((p, i) => `${x(i)},${y(p.accuracyPercent)}`).join(" ");
  const area = `${padding.left},${padding.top + plotHeight} ${line} ${x(points.length - 1)},${padding.top + plotHeight}`;

  const last = points[points.length - 1];

  /**
   * Até cinco datas, sempre incluindo a primeira e a última.
   *
   * O passo é calculado sobre os índices para as marcas ficarem espaçadas por
   * igual; com menos de cinco pontos, todas aparecem.
   */
  const MAX_MARCAS = 5;
  const passo = Math.max(1, Math.ceil((points.length - 1) / (MAX_MARCAS - 1)));
  const datasVisiveis = [
    ...new Set([
      ...Array.from({ length: points.length }, (_, i) => i).filter((i) => i % passo === 0),
      points.length - 1,
    ]),
  ].sort((a, b) => a - b);

  return (
    <figure className="mt-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Evolução do acerto. Último dia medido: ${last.accuracyPercent}% de acerto em ${last.answered} questões.`}
      >
        <defs>
          <linearGradient id="evolution-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 50, 100].map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text
              x={padding.left - 8}
              y={y(tick) + 4}
              textAnchor="end"
              className="fill-[var(--muted-foreground)] text-[11px]"
            >
              {tick}%
            </text>
          </g>
        ))}

        <polygon points={area} fill="url(#evolution-fill)" />
        <polyline
          points={line}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((point, index) => (
          <circle
            key={point.date}
            cx={x(index)}
            cy={y(point.accuracyPercent)}
            r={index === points.length - 1 ? 5 : 3.5}
            fill="var(--primary)"
          />
        ))}

        {/*
          ⚠️ AS DATAS, MAS NÃO TODAS.

          A cliente pediu a data de cada ponto. Com trinta dias, trinta rótulos
          de "28/08" em 640px se sobrepõem e viram um borrão — que é pior que
          não ter data. Então aparecem no máximo cinco, espaçadas por igual, e
          a última é sempre uma delas: é a que o olho procura.

          `datasVisiveis` decide quais; o resto do eixo fica limpo.
        */}
        {datasVisiveis.map((index) => (
          <text
            key={points[index].date}
            x={x(index)}
            y={height - 6}
            textAnchor={
              index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"
            }
            className="fill-[var(--muted-foreground)] text-[10px]"
          >
            {formatEixo(points[index].date)}
          </text>
        ))}
      </svg>
    </figure>
  );
}

/** "28/08" — só dia e mês; o ano não muda dentro de trinta dias. */
function formatEixo(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

/* ========================================================================== *
 * MELHOR TÉCNICA
 * ========================================================================== */

const TECHNIQUE_NAMES: Record<string, string> = {
  reading: "Leitura",
  video: "Videoaula",
  flashcard: "Flash Cards",
  mind_map: "Mapas Mentais",
  summary: "Resumo",
  audio: "Texto para Áudio",
  questions: "Questões",
  other: "Outra",
};

/**
 * "Melhor técnica de estudo" do mockup.
 *
 * ⚠️ Só mostra o vencedor quando a amostra é confiável (`isReliable`, com o
 * mínimo vindo da configuração). Coroar uma técnica com cinco questões de
 * amostra faria o aluno mudar como estuda por causa de ruído.
 */
export function BestTechniqueCard({ best }: { best: BestTechnique }) {
  const name = best.technique ? (TECHNIQUE_NAMES[best.technique] ?? best.technique) : null;

  return (
    <Surface className="flex flex-col items-center p-5 text-center sm:p-6">
      <span className="text-primary [&>svg]:size-9" aria-hidden>
        <Trophy />
      </span>

      {best.isReliable && name ? (
        <>
          <p className="mt-4 text-sm text-muted-foreground">
            Sua melhor técnica de estudo:
          </p>
          <p className="mt-1 text-xl font-bold text-primary sm:text-2xl">{name}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {best.accuracyPercent}% de acerto na prática que veio logo depois,
            em {best.sampleSize} questões.
          </p>
        </>
      ) : (
        <>
          <p className="mt-4 font-medium text-foreground">
            Ainda medindo sua melhor técnica
          </p>
          <p className="mt-2 max-w-xs text-sm text-pretty text-muted-foreground">
            O sistema alterna as técnicas nos seus estudos e compara o acerto na
            prática seguinte. Com mais questões respondidas, ele diz qual
            funciona melhor para você.
          </p>
        </>
      )}
    </Surface>
  );
}

/* ========================================================================== *
 * ACESSO RÁPIDO
 * ========================================================================== */

/**
 * Os atalhos do rodapé do mockup.
 *
 * ⚠️ SÓ O QUE EXISTE. O mockup traz sete: Banco de Questões, Mapas Mentais,
 * Flash Cards, Texto para Áudio, Videoaulas, Treinamento Cognitivo e Mentoria.
 * As três últimas são Marco 2 e não foram construídas — atalho para tela
 * inexistente é 404 com a marca do produto em cima, que é pior do que a
 * ausência do atalho.
 */
export function QuickAccess() {
  const shortcuts = [
    { label: "Banco de Questões", href: "/questoes", icon: <Target /> },
    { label: "Revisões", href: "/revisoes", icon: <RotateCcw /> },
    { label: "Cronograma", href: "/cronograma", icon: <Timer /> },
    { label: "Minhas preparações", href: "/preparacoes", icon: <Coins /> },
  ];

  return (
    <Surface className="p-4 sm:p-5">
      <SectionTitle>Acesso rápido</SectionTitle>

      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {shortcuts.map((shortcut) => (
          <li key={shortcut.href}>
            <Link
              href={shortcut.href}
              className="flex h-full flex-col items-center gap-2 rounded-xl border border-border bg-background/40 px-3 py-4 text-center transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="text-primary [&>svg]:size-5" aria-hidden>
                {shortcut.icon}
              </span>
              <span className="text-xs leading-tight font-medium text-balance text-foreground">
                {shortcut.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Surface>
  );
}

/* ========================================================================== *
 * FORMATAÇÃO
 * ========================================================================== */

function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

/**
 * Minutos como o mockup mostra: "87h".
 *
 * Abaixo de uma hora vira "45min" — "0h" faria quem estudou meia hora achar
 * que o registro não contou.
 */
function formatHours(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  return `${Math.floor(minutes / 60)}h`;
}
