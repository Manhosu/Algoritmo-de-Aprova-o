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
 * ⚠️ NINGUÉM APARECE COM NOME, E ISSO NÃO É TIMIDEZ DE PRODUTO.
 *
 * A Política de Privacidade que os alunos aceitaram no cadastro não prevê
 * exibir o nome de um aluno para outro. Publicar nomes seria uma finalidade de
 * tratamento nova, não informada — e sob a LGPD isso não se resolve com um
 * aviso depois, resolve-se com a política atualizada e o consentimento colhido
 * ANTES.
 *
 * Então o ranking mostra POSIÇÃO, XP, sequência e nível, e identifica só o
 * próprio aluno ("Você"). Todo mundo que quiser comparar consegue comparar; o
 * que ninguém consegue é descobrir quem é quem.
 *
 * Para virar um ranking com nomes: um parágrafo na política, um campo de
 * consentimento por aluno (opt-in, nunca marcado por padrão) e o nome só
 * aparece para quem marcou. É decisão da cliente, não minha — e é barata de
 * fazer depois, porque nada aqui depende do anonimato.
 */

export type RankingRow = {
  position: number;
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
