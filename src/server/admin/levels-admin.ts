import "server-only";

import { asc, eq } from "drizzle-orm";

import { buildLevelRanges, type LevelRange } from "@/modules/gamification/level-ranges";
import { db } from "@/server/db";
import { levels } from "@/server/db/schema";

/**
 * OS NÍVEIS, EDITÁVEIS PELO PAINEL (pedido da cliente em 08/09/2026).
 *
 * ⚠️ NÍVEL É TABELA, e não configuração versionada como o XP e os pesos.
 *
 * `user_gamification_states.current_level_id` aponta para a linha, e o painel do
 * aluno mostra o nome e o emoji dela. Publicar uma "versão nova" de níveis, como
 * se faz com `xp_values`, deixaria o aluno apontando para a versão antiga e a
 * tela mostrando a nova — duas verdades sobre o mesmo aluno.
 *
 * ⚠️ POR ISSO A EDIÇÃO É RETROATIVA, e isso é diferente do resto desta tela.
 *
 * Mudar a faixa muda o nível de quem já tem XP: um aluno com 900 XP pode acordar
 * no nível 2 se a cliente baixar o corte para 800. É o comportamento correto —
 * a faixa descreve o que o XP significa hoje, e o XP dele não mudou. Mas é bom
 * que fique escrito, porque é diferente do XP por atividade, que só vale daqui
 * em diante.
 */

export type AdminLevel = {
  id: string;
  levelNumber: number;
  name: string;
  emoji: string | null;
  minXp: number;
  maxXp: number | null;
  /** Quantos alunos estão neste nível agora — o custo de mexer, visível. */
  studentCount: number;
};

export async function listLevelsForAdmin(): Promise<AdminLevel[]> {
  const linhas = await db
    .select({
      id: levels.id,
      levelNumber: levels.levelNumber,
      name: levels.name,
      emoji: levels.emoji,
      minXp: levels.minXp,
      maxXp: levels.maxXp,
    })
    .from(levels)
    .where(eq(levels.isActive, true))
    .orderBy(asc(levels.levelNumber));

  /*
    A contagem sai do XP, e não de `current_level_id`.

    A coluna é um retrato do último cálculo e pode estar atrasada; a faixa é a
    regra. Contando pela regra, o número que a tela mostra é o número que valeria
    se o cálculo rodasse agora — que é o que interessa a quem vai mexer nela.
  */
  const porNivel = await contarAlunosPorFaixa(linhas);

  return linhas.map((linha) => ({
    ...linha,
    studentCount: porNivel.get(linha.levelNumber) ?? 0,
  }));
}

async function contarAlunosPorFaixa(
  faixas: Array<{ levelNumber: number; minXp: number }>,
): Promise<Map<number, number>> {
  const xps = await db.query.userGamificationStates.findMany({
    columns: { totalXp: true },
  });

  const ordenadas = [...faixas].sort((a, b) => b.minXp - a.minXp);
  const contagem = new Map<number, number>();

  for (const { totalXp } of xps) {
    const faixa = ordenadas.find((f) => totalXp >= f.minXp) ?? ordenadas.at(-1);
    if (!faixa) continue;
    contagem.set(faixa.levelNumber, (contagem.get(faixa.levelNumber) ?? 0) + 1);
  }

  return contagem;
}

export type SaveLevelsResult =
  | { ok: true; ranges: LevelRange[] }
  | { ok: false; problems: string[] };

/**
 * Grava as faixas.
 *
 * ⚠️ VALIDA A LISTA INTEIRA ANTES DE ESCREVER QUALQUER LINHA.
 *
 * Escrever nível a nível e parar no primeiro inválido deixaria a tabela num
 * estado que nenhuma tela consegue explicar: metade dos níveis com a faixa nova,
 * metade com a antiga, e uma sobreposição no meio. Gravar só depois de tudo
 * conferido é o que garante que a tabela nunca fica pela metade.
 */
export async function saveLevelRanges(
  entradas: Array<{ id: string; minXp: number }>,
): Promise<SaveLevelsResult> {
  const atuais = await listLevelsForAdmin();
  const porId = new Map(atuais.map((nivel) => [nivel.id, nivel]));

  const conhecidas = entradas.filter((entrada) => porId.has(entrada.id));
  if (conhecidas.length !== atuais.length) {
    return {
      ok: false,
      problems: ["O formulário não trouxe todos os níveis. Recarregue a página e tente de novo."],
    };
  }

  const validado = buildLevelRanges(
    conhecidas.map((entrada) => ({
      levelNumber: porId.get(entrada.id)!.levelNumber,
      name: porId.get(entrada.id)!.name,
      minXp: entrada.minXp,
    })),
  );

  if (!validado.ok) return validado;

  const agora = new Date();

  for (const faixa of validado.ranges) {
    const id = atuais.find((nivel) => nivel.levelNumber === faixa.levelNumber)!.id;

    await db
      .update(levels)
      .set({ minXp: faixa.minXp, maxXp: faixa.maxXp, updatedAt: agora })
      .where(eq(levels.id, id));
  }

  return { ok: true, ranges: validado.ranges };
}
