import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  levels,
  questionAttempts,
  userGamificationStates,
  users,
} from "@/server/db/schema";

/**
 * RANKING — comparativo entre alunos por XP e consistência (README 2.4).
 * ============================================================================
 *
 * ⚠️ O PRIMEIRO NOME APARECE, E O CAMINHO ATÉ AQUI IMPORTA.
 *
 * Até 03/09/2026 este ranking era anônimo, porque a Política de Privacidade que
 * os alunos aceitaram não previa mostrar o nome de um aluno para outro. Exibir
 * nomes é uma finalidade de tratamento, e sob a LGPD ela precisa estar descrita
 * ANTES do primeiro nome chegar à tela, não depois.
 *
 * A cliente autorizou, e o que entrou junto foi:
 *
 *   • a seção 3.1 da Política de Privacidade 1.2, dizendo o que outros alunos
 *     veem (primeiro nome, posição, XP, nível, sequência) e o que não veem;
 *   • `users.show_name_in_ranking`, para quem não quiser aparecer.
 *
 * ⚠️ SÓ O PRIMEIRO NOME, e o sobrenome fica no servidor.
 *
 * "Ana" identifica o suficiente para a comparação ter graça. "Ana Carolina
 * Fernandes de Souza" identifica uma pessoa específica na internet, e o ranking
 * é visível para qualquer aluno da plataforma. O corte acontece AQUI, na
 * consulta: o sobrenome não entra no payload que vai para o navegador, então
 * nenhuma mudança de tela pode vazá-lo por acidente.
 */

export type RankingRow = {
  position: number;
  /**
   * O primeiro nome, ou `null` para quem desligou a exibição.
   *
   * ⚠️ NUNCA O NOME COMPLETO. Ver a nota do topo: o corte é feito na consulta,
   * não na tela.
   */
  firstName: string | null;
  totalXp: number;
  currentStreak: number;
  levelName: string;
  levelEmoji: string | null;
  /** Percentual de acerto do aluno. Nulo enquanto ele não respondeu nada. */
  accuracyPercent: number | null;
  /** Verdadeiro só na linha de quem está olhando. */
  isMe: boolean;
};

export type Ranking = {
  top: RankingRow[];
  /** A linha do próprio aluno, quando ele está fora do top exibido. */
  me: RankingRow | null;
  /** Quantos alunos entram na comparação. */
  totalStudents: number;
  /** Há mais gente além do que foi devolvido — a tela mostra "ver mais". */
  hasMore: boolean;
};

/**
 * O ranking, sem PII.
 *
 * ⚠️ ORDENA POR XP E DESEMPATA POR SEQUÊNCIA — nessa ordem, e o README pede as
 * duas ("XP e consistência"). XP mede volume acumulado; a sequência mede
 * constância. Duas pessoas com o mesmo XP não estão empatadas se uma estuda
 * todo dia e a outra maratonou num fim de semana.
 *
 * Contas inativas e a própria equipe ficam de fora: um admin no topo do ranking
 * de alunos não compara nada.
 */
export async function getRanking(input: {
  userId: string;
  limit?: number;
}): Promise<Ranking> {
  const limite = input.limit ?? 20;

  /*
    `rank()` e não `row_number()`: quem tem exatamente o mesmo XP e a mesma
    sequência ocupa a MESMA posição. Com `row_number` o desempate seria a ordem
    interna da tabela, e duas pessoas idênticas apareceriam em 7º e 8º por
    acaso — sem nada na tela que explicasse a diferença.
  */
  const posicao = sql<number>`rank() over (
    order by ${userGamificationStates.totalXp} desc,
             ${userGamificationStates.currentStreak} desc
  )`;

  const elegivel = and(eq(users.role, "student"), eq(users.status, "active"));

  const [linhas, totalRow] = await Promise.all([
    db
      .select({
        userId: users.id,
        /*
          `split_part(name, ' ', 1)` no BANCO, e não `name.split(" ")[0]` no
          servidor. O sobrenome nunca sai da tabela: se um dia alguém acrescentar
          um campo ao `select` sem pensar, não haverá nome completo em memória
          para vazar junto.

          `show_name_in_ranking` desligado devolve nulo, e a tela mostra "Aluno".
        */
        firstName: sql<string | null>`case
          when ${users.showNameInRanking} then nullif(split_part(coalesce(${users.name}, ''), ' ', 1), '')
          else null
        end`,
        position: posicao,
        totalXp: userGamificationStates.totalXp,
        currentStreak: userGamificationStates.currentStreak,
        levelName: levels.name,
        levelEmoji: levels.emoji,
        /*
          Acerto de cada aluno, em subconsulta e não em join: um `join` com
          `question_attempts` multiplicaria a linha do aluno por cada resposta,
          e `total_xp` — que é coluna, não agregado — passaria a ser somado uma
          vez por tentativa.
        */
        accuracyPercent: sql<number | null>`(
          select round(
            count(*) filter (where ${questionAttempts.isCorrect}) * 100.0
            / nullif(count(*), 0)
          )::int
          from ${questionAttempts}
          where ${questionAttempts.userId} = ${users.id}
        )`,
      })
      .from(userGamificationStates)
      .innerJoin(users, eq(users.id, userGamificationStates.userId))
      /**
       * ⚠️ O NÍVEL VEM DA FAIXA DE XP, NÃO DE `current_level_id`.
       *
       * Aquela coluna é um cache que NADA no produto preenche: está nula para
       * todos os alunos desde sempre. O join por ela devolvia nulo e a tela caía
       * no rótulo padrão, então TODO MUNDO aparecia como "Iniciante" — inclusive
       * quem tinha 1.660 XP e é Competitivo. A cliente reportou exatamente isso,
       * e a Home mostrava o nível certo ao lado, porque lá ele é calculado.
       *
       * A faixa é a fonte da verdade: nível é função pura do XP. Derivar aqui
       * também elimina a chance de duas telas discordarem sobre o mesmo aluno.
       */
      .leftJoin(
        levels,
        and(
          eq(levels.isActive, true),
          sql`${userGamificationStates.totalXp} >= ${levels.minXp}`,
          sql`(${levels.maxXp} is null or ${userGamificationStates.totalXp} <= ${levels.maxXp})`,
        ),
      )
      .where(elegivel)
      .orderBy(
        desc(userGamificationStates.totalXp),
        desc(userGamificationStates.currentStreak),
      ),

    db
      .select({ total: sql<number>`count(*)::int` })
      .from(userGamificationStates)
      .innerJoin(users, eq(users.id, userGamificationStates.userId))
      .where(elegivel),
  ]);

  const paraLinha = (
    linha: (typeof linhas)[number],
  ): RankingRow => ({
    position: Number(linha.position),
    firstName: linha.firstName,
    totalXp: linha.totalXp,
    currentStreak: linha.currentStreak,
    /*
      O nível vem de `levels`, mas `current_level_id` pode estar nulo em quem
      nunca ganhou XP — a linha de gamificação nasce antes do primeiro
      lançamento. "Iniciante" é o nível de 0 XP, então é o rótulo correto, não
      um placeholder.
    */
    levelName: linha.levelName ?? "Iniciante",
    levelEmoji: linha.levelEmoji ?? "🌱",
    accuracyPercent: linha.accuracyPercent,
    isMe: linha.userId === input.userId,
  });

  const top = linhas.slice(0, limite).map(paraLinha);
  const minha = linhas.find((l) => l.userId === input.userId);

  return {
    hasMore: linhas.length > limite,
    top,
    /*
      A própria linha vai junto quando o aluno está fora do top.

      Um ranking que mostra vinte desconhecidos e não diz onde VOCÊ está não
      compara nada — é um placar de outra pessoa. E quem está em 300º precisa
      justamente dessa informação para saber o que fazer.
    */
    me: minha && !top.some((l) => l.isMe) ? paraLinha(minha) : null,
    totalStudents: totalRow[0]?.total ?? 0,
  };
}
