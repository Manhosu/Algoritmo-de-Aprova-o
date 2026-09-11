import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A linguagem de card do produto, extraída do mockup da cliente.
 *
 * Três coisas se repetem em todos os blocos daquela tela e viraram componentes
 * aqui, em vez de classe copiada dezoito vezes:
 *
 *   1. o card: fundo #0f1826, borda #1c2b40, cantos arredondados;
 *   2. o título em caixa alta com espaçamento entre letras;
 *   3. o número grande com fonte tabular.
 *
 * O número tabular importa mais do que parece: sem `tabular-nums`, "5.740" e
 * "1.284" têm larguras diferentes e a faixa de métricas dança quando o valor
 * muda. Numa tela que atualiza a cada questão respondida, isso é visível.
 */

/* ========================================================================== *
 * CARD
 * ========================================================================== */

type SurfaceProps = ComponentProps<"section"> & {
  /** Aplica o brilho ciano. Reservado ao card em destaque da tela. */
  glow?: boolean;
  /**
   * Card de vidro: translúcido, desfocado, com borda que reflete luz.
   *
   * ⚠️ `backdrop-filter` é caro — reserve para superfícies grandes e poucas
   * por tela. Na área do aluno o card opaco continua sendo o padrão, porque
   * é o do mockup aprovado e porque são muitos por tela.
   */
  glass?: boolean;
};

export function Surface({
  className,
  glow = false,
  glass = false,
  ...props
}: SurfaceProps) {
  return (
    <section
      className={cn(
        // O vidro traz o próprio fundo, raio e borda iluminada; somar as
        // classes opacas por cima anularia os três.
        glass ? "glass-panel" : "rounded-2xl border border-border bg-card",
        glow && "glow-ring",
        className,
      )}
      {...props}
    />
  );
}

/* ========================================================================== *
 * TÍTULO DE SEÇÃO
 * ========================================================================== */

type SectionTitleProps = {
  children: ReactNode;
  /** Ícone em linha à esquerda, como no mockup ("🎯 MISSÕES DO DIA"). */
  icon?: ReactNode;
  /** Conteúdo à direita, como o seletor "7 DIAS" do gráfico de evolução. */
  action?: ReactNode;
  className?: string;
};

export function SectionTitle({ children, icon, action, className }: SectionTitleProps) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-[0.12em] text-foreground uppercase">
        {icon ? <span className="text-primary">{icon}</span> : null}
        {children}
      </h2>
      {action}
    </div>
  );
}

/* ========================================================================== *
 * MÉTRICA
 * ========================================================================== */

type MetricProps = {
  label: string;
  value: string;
  icon?: ReactNode;
  /** Linha de apoio embaixo ("+230 hoje", "80,7% acertos"). */
  hint?: ReactNode;
  /** Colore a linha de apoio como ganho. */
  hintTone?: "neutral" | "positive";
  className?: string;
};

export function Metric({
  label,
  value,
  icon,
  hint,
  hintTone = "neutral",
  className,
}: MetricProps) {
  return (
    <div className={cn("flex flex-col items-center gap-1.5 px-2 text-center", className)}>
      {icon ? <span className="text-primary [&>svg]:size-6" aria-hidden>{icon}</span> : null}
      <span className="text-[0.65rem] leading-tight font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </span>
      <span className="text-metric text-2xl text-foreground sm:text-3xl">{value}</span>
      {hint ? (
        <span
          className={cn(
            "text-xs",
            hintTone === "positive" ? "text-success" : "text-muted-foreground",
          )}
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/* ========================================================================== *
 * BARRA DE PROGRESSO COM RÓTULO
 * ========================================================================== */

type LabeledBarProps = {
  label: string;
  /** 0 a 100. */
  percent: number;
  className?: string;
};

/**
 * A linha de "Desempenho por Disciplina".
 *
 * Usa `<progress>` semanticamente? Não — o mockup pede uma barra decorativa com
 * o número ao lado, e o número já é o valor acessível. `aria-hidden` na barra
 * evita que o leitor de tela anuncie a mesma informação duas vezes.
 */
export function LabeledBar({ label, percent, className }: LabeledBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/*
        ⚠️ O NOME QUEBRA LINHA, e não é cortado (pedido da cliente em 11/09/2026:
        "quebrar em outra linha os textos do card Desempenho por Disciplina").

        Com `truncate`, "RACIOCÍNIO LÓGICO APLICADO À MATEMÁTICA" deixava de ter
        largura mínima: o card, que é item de grade, crescia até caber a frase
        numa linha só e empurrava a Home para fora da tela — o "espaço lateral"
        e a barra de baixo escondida que ela relatou. Quebrando, a largura
        mínima volta a ser a palavra mais longa.
      */}
      <span className="min-w-0 flex-1 text-sm text-pretty break-words text-foreground">
        {label}
      </span>
      <span
        className="hidden h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-secondary sm:block lg:w-36"
        aria-hidden
      >
        <span
          className="block h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${clamped}%` }}
        />
      </span>
      <span className="text-metric w-11 shrink-0 text-right text-sm text-foreground">
        {Math.round(clamped)}%
      </span>
    </div>
  );
}

/* ========================================================================== *
 * MEDIDOR CIRCULAR
 * ========================================================================== */

type GaugeProps = {
  /** 0 a 100. */
  value: number;
  label: string;
  caption?: string;
  size?: number;
};

/**
 * O anel do Índice de Preparação.
 *
 * SVG e não canvas: escala sem borrar, funciona sem JavaScript e o valor fica
 * no DOM para leitor de tela.
 *
 * ⚠️ O rótulo abaixo do número vem da configuração versionada
 * (`preparation_index.bands`), nunca de constante aqui. Foi decisão fechada:
 * "Índice de Preparação", nunca "de Aprovação", e nenhum rótulo pode sugerir
 * probabilidade de passar.
 */
export function Gauge({ value, label, caption, size = 176 }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // Deixa uma abertura embaixo, como no mockup.
  const arc = 0.78;
  const dash = circumference * arc;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-[125deg]"
          role="img"
          aria-label={`${label}: ${Math.round(clamped)} de 100`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--secondary)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash * (clamped / 100)} ${circumference}`}
            className="transition-[stroke-dasharray] duration-700"
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-metric text-5xl text-foreground">{Math.round(clamped)}</span>
          <span className="text-xs text-muted-foreground">/100</span>
        </div>
      </div>

      <div className="text-center">
        <p className="text-lg font-semibold tracking-wide text-primary uppercase">{label}</p>
        {caption ? <p className="mt-1 text-sm text-muted-foreground">{caption}</p> : null}
      </div>
    </div>
  );
}

/* ========================================================================== *
 * ESTADO VAZIO
 * ========================================================================== */

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

/**
 * Estado vazio.
 *
 * Existe como componente porque o produto vai ter MUITOS: aluno sem preparação,
 * sem revisão hoje, sem questão respondida, assunto sem material. Cada um
 * desses é um momento em que a pessoa pode achar que o sistema quebrou — e a
 * diferença entre "não há nada aqui" e "aqui está o que fazer" é o texto.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <span className="text-muted-foreground [&>svg]:size-8" aria-hidden>
          {icon}
        </span>
      ) : null}
      <p className="font-medium text-foreground">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-balance text-muted-foreground">{description}</p>
      ) : null}
      {action}
    </div>
  );
}
