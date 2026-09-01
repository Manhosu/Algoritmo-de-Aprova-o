import type { FunnelStage } from "@/modules/admin/funnel";

/**
 * Um bloco do funil, com barra proporcional.
 *
 * ⚠️ A BARRA MEDE SOBRE O TOTAL DE CADASTRADOS, sempre — nunca sobre a etapa
 * anterior.
 *
 * Medir cada etapa contra a anterior produz o gráfico consolador: todas as
 * barras ficam quase cheias, porque quem chegou até ali já passou pelo filtro.
 * Contra o total, a barra encurta a cada passo e mostra o tamanho real da
 * perda, que é a única leitura que serve para decidir onde mexer.
 */
export function FunnelBlock({
  titulo,
  descricao,
  etapas,
  total,
}: {
  titulo: string;
  descricao: string;
  etapas: FunnelStage[];
  total: number;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-semibold text-foreground">{titulo}</h2>
      <p className="mt-1 text-sm text-pretty text-muted-foreground">{descricao}</p>

      {total === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Ainda não há cadastros para medir.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {etapas.map((etapa) => (
            <li key={etapa.label} className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 text-pretty text-sm text-foreground">
                  {etapa.label}
                </span>
                <span className="text-metric shrink-0 text-sm text-foreground">
                  {etapa.count}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {etapa.percent}%
                </span>
              </div>

              <div
                className="h-1.5 overflow-hidden rounded-full bg-background"
                role="presentation"
              >
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${etapa.percent}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Os números grandes do topo. */
export function MetricGrid({
  itens,
}: {
  itens: Array<{ rotulo: string; valor: number | null; sufixo?: string }>;
}) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {itens.map((item) => (
        <div
          key={item.rotulo}
          className="min-w-0 rounded-xl border border-border bg-card p-4"
        >
          <dt className="text-pretty text-xs text-muted-foreground">{item.rotulo}</dt>
          <dd className="text-metric mt-1 text-xl text-foreground">
            {/* Zero é resposta; ausência de dado não é. Um traço distingue os dois. */}
            {item.valor === null ? "—" : `${item.valor}${item.sufixo ?? ""}`}
          </dd>
        </div>
      ))}
    </dl>
  );
}
