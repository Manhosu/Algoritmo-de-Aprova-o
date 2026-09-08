/**
 * A FAIXA DE XP DE CADA NÍVEL, editável pelo painel (pedido de 08/09/2026).
 *
 * Palavras da cliente: "na aba Algoritmo poderia dar para editar a faixa de XP
 * de cada nível".
 *
 * ⚠️ SÓ O `minXp` É EDITADO. O `maxXp` É DERIVADO.
 *
 * `levelProgress` decide o nível comparando o XP com os `minXp`, em ordem — o
 * `maxXp` existe só para a tela mostrar "0 a 999". Deixando os dois editáveis, a
 * primeira coisa que aconteceria é alguém salvar um teto que não encosta no piso
 * seguinte: a tela diria "até 999" enquanto o nível 2 começaria em 1500, e os
 * 501 XP no meio ficariam num nível que a tela nega existir.
 *
 * Derivando, essa contradição não tem como ser escrita.
 */

export type LevelRange = {
  levelNumber: number;
  name: string;
  minXp: number;
  /** Derivado: `minXp` do próximo menos um. Nulo no último — é o "10.000+". */
  maxXp: number | null;
};

export type LevelRangeInput = {
  levelNumber: number;
  name: string;
  minXp: number;
};

export type LevelRangeResult =
  | { ok: true; ranges: LevelRange[] }
  | { ok: false; problems: string[] };

/**
 * Valida a lista inteira e devolve as faixas com o teto já calculado.
 *
 * Valida TUDO antes de responder, em vez de parar no primeiro erro: quem está
 * ajustando cinco níveis de uma vez precisa saber quais linhas estão erradas, e
 * não descobrir uma por vez a cada tentativa de salvar.
 */
export function buildLevelRanges(entradas: LevelRangeInput[]): LevelRangeResult {
  const problems: string[] = [];

  if (entradas.length === 0) {
    return { ok: false, problems: ["Não há níveis para editar."] };
  }

  const ordenados = [...entradas].sort((a, b) => a.levelNumber - b.levelNumber);

  for (const entrada of ordenados) {
    if (!Number.isInteger(entrada.minXp) || entrada.minXp < 0) {
      problems.push(`${entrada.name}: o XP inicial precisa ser um número inteiro, a partir de 0.`);
    }
  }

  /*
    ⚠️ O PRIMEIRO NÍVEL COMEÇA EM ZERO, sempre.

    `levelProgress` toma o nível de menor `minXp` como padrão de quem não
    alcançou nenhum. Se o primeiro começasse em 100, um aluno com 40 XP cairia
    nele mesmo assim — a tela mostraria "Nível 1: 100 a 999" para quem tem 40 e
    a barra de progresso ficaria negativa.
  */
  if (ordenados[0].minXp !== 0) {
    problems.push(`${ordenados[0].name} precisa começar em 0 XP: é o nível de quem acabou de entrar.`);
  }

  for (let i = 1; i < ordenados.length; i++) {
    const anterior = ordenados[i - 1];
    const atual = ordenados[i];

    if (atual.minXp <= anterior.minXp) {
      problems.push(
        `${atual.name} precisa começar acima de ${anterior.name} (${anterior.minXp} XP). ` +
          `Dois níveis com o mesmo começo fazem um deles nunca ser alcançado.`,
      );
    }
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    ranges: ordenados.map((entrada, i) => ({
      levelNumber: entrada.levelNumber,
      name: entrada.name,
      minXp: entrada.minXp,
      /* O último não tem teto: é o que faz "10.000+" funcionar sem número mágico. */
      maxXp: i === ordenados.length - 1 ? null : ordenados[i + 1].minXp - 1,
    })),
  };
}

/** "0 a 999" ou "10.000+", do jeito que aparece na tela. */
export function formatLevelRange(faixa: LevelRange): string {
  const numero = (valor: number) => valor.toLocaleString("pt-BR");
  return faixa.maxXp === null
    ? `${numero(faixa.minXp)}+`
    : `${numero(faixa.minXp)} a ${numero(faixa.maxXp)}`;
}
