import { BookOpen, Check, ChevronRight, Lock, Target, Trophy } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { SectionTitle, Surface } from "@/components/shared/surface";
import { CompleteStudyButton } from "./complete-study-button";
import { practiceLink, studyLabel, studyLink, type LinkableTechnique } from "@/lib/deep-links";
import { cn } from "@/lib/utils";

/**
 * MISSÕES DO DIA — um card só.
 *
 * Definição da cliente em 21/08/2026:
 *
 *   "Sobre os cards Tarefas do Dia e Missões do Dia é a mesma coisa. É um card
 *    só com as Missões do dia, todas valendo XP, com as duplinhas de Estude e
 *    Pratique. Todas clicáveis. Conforme vai cumprindo ele vai riscando."
 *
 * O QUE ISSO MUDA
 * ----------------------------------------------------------------------------
 * O mockup tinha DOIS cards: a Tarefa do Dia (saída do motor) e as Missões do
 * Dia (metas genéricas de gamificação, tipo "Resolver 30 questões"). Agora é
 * um só: as duplas que o motor gerou SÃO as missões, e cada uma vale XP.
 *
 * Isso simplifica o produto e some com uma pergunta difícil de responder — "por
 * que a missão manda resolver 30 questões se a minha tarefa pede 12?". Duas
 * listas de afazeres na mesma tela competem entre si; uma só, não.
 *
 * O catálogo genérico de missões (`missions`) fica sem uso por enquanto. As
 * tabelas continuam no banco: apagar exigiria migration e o custo de manter é
 * zero.
 *
 * O XP mostrado é a SOMA do que aquela dupla vai render, calculado a partir da
 * configuração versionada (`xp_values`) — nunca de constante em código.
 */

export type MissionItemState = {
  status: "pending" | "in_progress" | "completed" | "skipped";
  closedByPlanLimit?: boolean;
  /**
   * Id do item no banco. O de ESTUDO precisa dele para o botão "já estudei",
   * que é o gatilho do Motor 2; o de prática se completa sozinho conforme o
   * aluno responde questões.
   */
  itemId?: string;
};

export type DailyMission = {
  blockIndex: number;
  topicName: string;
  subjectName: string;
  topicSlug?: string | null;
  technique: LinkableTechnique | null;
  contentItemId?: string | null;
  /** Quantos materiais existem — decide entre ir direto e abrir a lista. */
  materialCount?: number;

  study: MissionItemState & { xp: number };
  /**
   * Ausente quando o assunto não casou com o catálogo ou não há questão.
   *
   * ⚠️ `itemId` É OBRIGATÓRIO AQUI, e o de `study` não precisa ser. É ele que
   * viaja no link até a tela de questões e fecha a tarefa quando o aluno
   * responde. Ele já foi esquecido uma vez: o tipo o deixava opcional, o
   * mapeamento na Home não o passava, e a linha "Pratique" mostrava "+10 XP"
   * que nunca entrava na soma do dia.
   */
  practice?: MissionItemState & { xp: number; itemId: string };

  reasonLabel?: string | null;
};

export type DailyMissionsProps = {
  missions: DailyMission[];
  /** XP extra por concluir o dia inteiro (`xp_values.dailyGoalCompleted`). */
  completionBonusXp: number;
};

export function DailyMissions({ missions, completionBonusXp }: DailyMissionsProps) {
  /**
   * ⚠️ CONTA MISSÕES, NÃO ITENS — e essa era a origem de "3 de 4 concluídas"
   * numa tela com três missões.
   *
   * Cada missão é um bloco com estudo e, quando há questões do assunto no
   * acervo, prática. A contagem antiga somava os ITENS: um bloco sem prática
   * valia 1 e um bloco com prática valia 2, então o denominador dependia de
   * quanto conteúdo existia e nunca batia com o que estava na tela. Três
   * missões, uma delas com prática, davam quatro.
   *
   * A missão está cumprida quando o estudo está feito e, se houver prática, ela
   * também. É o que o aluno entende por "concluí a missão".
   */
  const done = missions.filter(
    (mission) =>
      mission.study.status === "completed" &&
      (!mission.practice || mission.practice.status === "completed"),
  ).length;

  const total = missions.length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const allDone = total > 0 && done === total;

  return (
    <Surface className="overflow-hidden">
      <div className="px-4 pt-4 sm:px-5">
        <SectionTitle icon={<Target className="size-4" />}>Missões do Dia</SectionTitle>

        <p className="mt-3 text-sm text-muted-foreground">
          {total === 0 ? "Nenhuma missão para hoje." : `${done}/${total} concluídas`}
        </p>

        <span
          className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-secondary"
          aria-hidden
        >
          <span
            className="block h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${percent}%` }}
          />
        </span>
      </div>

      <ul className="mt-4 flex flex-col">
        {missions.map((mission) => (
          <li key={mission.blockIndex} className="border-t border-border">
            <p className="px-4 pt-3 text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase sm:px-5">
              {mission.subjectName}
            </p>

            <MissionRow
              icon={<BookOpen />}
              action="Estude"
              label={studyLabel(mission.technique, mission.topicName)}
              href={studyLink({
                technique: mission.technique,
                contentItemId: mission.contentItemId,
                topicSlug: mission.topicSlug,
                materialCount: mission.materialCount,
              })}
              item={mission.study}
              /*
                Concluir o estudo é o que FAZ NASCER a série de revisões. O
                botão é um alvo de toque separado do link: misturar os dois
                faria o aluno concluir por engano ao tentar abrir o material, e
                a série nasceria de um clique que ele não quis dar.
              */
              trailing={
                mission.study.itemId ? (
                  <CompleteStudyButton
                    itemId={mission.study.itemId}
                    done={mission.study.status === "completed"}
                    topicName={mission.topicName}
                  />
                ) : null
              }
            />

            {mission.practice ? (
              <MissionRow
                icon={<Target />}
                action="Pratique"
                label={`Questões — ${mission.topicName}`}
                href={practiceLink(mission.topicSlug, mission.practice.itemId)}
                item={mission.practice}
              />
            ) : (
              <p className="flex items-center gap-2.5 px-4 pb-3 text-sm text-muted-foreground sm:px-5">
                <Target className="size-4 shrink-0" aria-hidden />
                Ainda não temos questões deste assunto no acervo.
              </p>
            )}
          </li>
        ))}
      </ul>

      {completionBonusXp > 0 && total > 0 ? (
        <div
          className={cn(
            "flex items-center gap-3 border-t border-border px-4 py-3 sm:px-5",
            allDone && "bg-success/10",
          )}
        >
          <Trophy
            className={cn("size-5 shrink-0", allDone ? "text-success" : "text-warning")}
            aria-hidden
          />
          <span className="flex-1 text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            Recompensa {allDone ? "conquistada" : "bônus"}
          </span>
          <span
            className={cn(
              "text-metric text-sm",
              allDone ? "text-success" : "text-warning",
            )}
          >
            +{completionBonusXp} XP
          </span>
        </div>
      ) : null}
    </Surface>
  );
}

function MissionRow({
  icon,
  action,
  label,
  href,
  item,
  trailing,
}: {
  icon: ReactNode;
  action: string;
  label: string;
  href: string | null;
  item: MissionItemState & { xp: number };
  /** Controle próprio à direita, fora do link. */
  trailing?: ReactNode;
}) {
  const done = item.status === "completed";
  const closedByLimit = item.closedByPlanLimit === true;

  const content = (
    <>
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg border [&>svg]:size-4",
          done
            ? "border-success/40 bg-success/10 text-success"
            : "border-primary/40 bg-primary-soft text-primary",
        )}
        aria-hidden
      >
        {done ? <Check /> : icon}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[0.65rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          {action}
        </span>
        <span
          className={cn(
            // ⚠️ SEM `truncate` (pedido da cliente em 27/08/2026).
            //
            // Assunto de edital é longo: "Governo digital, processo eletrônico,
            // assinatura digital, transparência e proteção de dados pessoais"
            // virava "Governo digital, proc…" e o aluno não sabia o que estudar.
            // Cortar economizava uma linha e custava a informação inteira.
            "block text-sm text-pretty",
            // "Conforme vai cumprindo ele vai riscando" — palavras da cliente.
            done ? "text-muted-foreground line-through" : "text-foreground",
          )}
        >
          {label}
        </span>
      </span>

      <span
        className={cn(
          "text-metric shrink-0 text-xs",
          done ? "text-success" : "text-muted-foreground",
        )}
      >
        +{item.xp} XP
      </span>

      {closedByLimit ? (
        <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      ) : href && !done ? (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : (
        <span className="size-4 shrink-0" aria-hidden />
      )}
    </>
  );

  const shared = "flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left";
  const rowClass = "flex items-center gap-2 px-4 sm:px-5";

  const body =
    !href || done ? (
      <div className={shared}>{content}</div>
    ) : (
      <Link
        href={href}
        className={cn(
          shared,
          "rounded-lg transition-colors hover:bg-accent/60",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:-outline-offset-2",
        )}
      >
        {content}
      </Link>
    );

  return (
    <div className={rowClass}>
      {body}
      {trailing}
    </div>
  );
}
