/**
 * LEITURA DO FUNIL — módulo puro.
 * ============================================================================
 *
 * Vive em `modules/` e não em `server/admin/` porque não toca no banco: recebe
 * as etapas já contadas e responde onde as pessoas param. Assim o teste roda
 * sem `DATABASE_URL`, e a regra — que é o que pode dar errado — fica coberta.
 */

export type FunnelStage = {
  label: string;
  count: number;
  /** Percentual sobre o total de cadastrados. */
  percent: number;
};

export type DropOff = { stage: string; lost: number };

/**
 * Onde as pessoas param — a diferença entre duas etapas seguidas.
 *
 * ⚠️ NÃO é a mesma coisa que o percentual de cada etapa. O funil mostra quantos
 * chegaram; isto mostra entre quais dois passos a maior parte sumiu, que é o
 * lugar onde mexer rende mais.
 *
 * Perdas negativas são descartadas: as marcas de tempo são gravadas por eventos
 * independentes e não formam cadeia estrita, então uma etapa posterior pode
 * legitimamente ter mais gente que a anterior. "-4 pessoas pararam aqui" não é
 * leitura, é ruído.
 */
export function findDropOff(stages: FunnelStage[]): DropOff[] {
  const quedas: DropOff[] = [];

  for (let i = 1; i < stages.length; i += 1) {
    const perdidos = stages[i - 1].count - stages[i].count;

    if (perdidos > 0) {
      quedas.push({
        stage: `${stages[i - 1].label} → ${stages[i].label}`,
        lost: perdidos,
      });
    }
  }

  return quedas.sort((a, b) => b.lost - a.lost);
}

/** Monta uma etapa já com o percentual sobre o total. */
export function toStage(label: string, count: number, total: number): FunnelStage {
  return {
    label,
    count,
    percent: total === 0 ? 0 : Math.round((count / total) * 100),
  };
}
