import "server-only";

import { eq, inArray, sql } from "drizzle-orm";

import { APP_TIMEZONE } from "@/config/app";
import {
  ACHIEVEMENT_CATALOG,
  evaluateAchievements,
  type AchievementSnapshot,
} from "@/modules/gamification/achievements";
import { toCivilDate } from "@/modules/shared/dates";
import { db } from "@/server/db";
import {
  achievements,
  coinLedger,
  userAchievements,
  userGamificationStates,
} from "@/server/db/schema";

import { awardXp } from "./progress";

/**
 * CONQUISTAS — a parte que toca o banco (README 2.3).
 * ============================================================================
 *
 * ⚠️ RODA DEPOIS DA ATIVIDADE, FORA DA TRANSAÇÃO DELA.
 *
 * Conferir conquista é uma leitura de contadores e, quando algo é desbloqueado,
 * duas escritas. Nada disso pode desfazer a resposta do aluno se falhar: uma
 * conquista perdida se recupera na próxima questão, porque o critério é sempre
 * "contador >= alvo" e o contador não some. Uma resposta perdida, não.
 *
 * ⚠️ E É IDEMPOTENTE POR CONSTRUÇÃO. O `unlocked_at` só é gravado quando está
 * nulo, e o XP e a moeda são chaveados pelo id da conquista. Rodar isto a cada
 * questão respondida não paga a mesma conquista duas vezes.
 */

export type UnlockedAchievement = {
  code: string;
  name: string;
  icon: string | null;
  xpReward: number;
  coinReward: number;
};

/**
 * Confere as conquistas do aluno e devolve as que ACABARAM de ser desbloqueadas.
 *
 * A lista de retorno é o que a tela usa para comemorar. Vazia na esmagadora
 * maioria das chamadas, que é o caso normal.
 */
export async function checkAchievements(input: {
  userId: string;
  now?: Date;
}): Promise<UnlockedAchievement[]> {
  const now = input.now ?? new Date();

  const [retrato, catalogo, jaTem] = await Promise.all([
    loadSnapshot(input.userId),

    db.select().from(achievements).where(eq(achievements.isActive, true)),

    db
      .select({
        achievementId: userAchievements.achievementId,
        unlockedAt: userAchievements.unlockedAt,
      })
      .from(userAchievements)
      .where(eq(userAchievements.userId, input.userId)),
  ]);

  /*
    O catálogo do BANCO manda no que existe; o do código manda no critério.

    A tabela guarda nome, descrição e recompensa — coisas que a operação pode
    querer ajustar. O contador e o alvo vêm do módulo puro, que é onde eles são
    testados. Uma conquista no banco sem par no código é ignorada em vez de
    quebrar: significa que alguém inseriu uma linha à mão e ainda não escreveu a
    regra dela.
  */
  const porCodigo = new Map(catalogo.map((a) => [a.code, a]));
  const doCodigo = ACHIEVEMENT_CATALOG.filter((d) => porCodigo.has(d.code));

  const desbloqueadoEm = new Map(
    jaTem.map((linha) => [linha.achievementId, linha.unlockedAt]),
  );

  const avaliacao = evaluateAchievements(retrato, doCodigo);
  const novas: UnlockedAchievement[] = [];

  for (const resultado of avaliacao) {
    const linhaDoBanco = porCodigo.get(resultado.code);
    if (!linhaDoBanco) continue;

    const jaDesbloqueada = desbloqueadoEm.get(linhaDoBanco.id);
    if (jaDesbloqueada) continue;

    /*
      O progresso é gravado SEMPRE, desbloqueando ou não. É o que faz a tela
      mostrar "7 de 30 dias" em vez de só um cadeado — e é a diferença entre uma
      lista que motiva e uma vitrine de coisas inalcançáveis.
    */
    await db
      .insert(userAchievements)
      .values({
        userId: input.userId,
        achievementId: linhaDoBanco.id,
        progress: resultado.progress,
        target: resultado.target,
        unlockedAt: resultado.unlocked ? now : null,
      })
      .onConflictDoUpdate({
        target: [userAchievements.userId, userAchievements.achievementId],
        set: {
          progress: resultado.progress,
          target: resultado.target,
          // `coalesce` protege o carimbo original: reconquistar não é coisa.
          unlockedAt: resultado.unlocked
            ? sql`coalesce(${userAchievements.unlockedAt}, ${now.toISOString()}::timestamptz)`
            : userAchievements.unlockedAt,
          updatedAt: now,
        },
      });

    if (!resultado.unlocked) continue;

    await payReward({
      userId: input.userId,
      achievementId: linhaDoBanco.id,
      xpReward: linhaDoBanco.xpReward,
      coinReward: linhaDoBanco.coinReward,
      now,
    });

    novas.push({
      code: linhaDoBanco.code,
      name: linhaDoBanco.name,
      icon: linhaDoBanco.icon,
      xpReward: linhaDoBanco.xpReward,
      coinReward: linhaDoBanco.coinReward,
    });
  }

  return novas;
}

/**
 * Os contadores do aluno, numa consulta só.
 *
 * ⚠️ UMA CONSULTA, com subselects — e não seis.
 *
 * Isto roda depois de toda questão respondida. Seis idas ao banco por resposta
 * seriam seis voltas de rede na ação mais frequente do produto. Cada subselect
 * usa o índice por `user_id` da sua tabela, então o custo é o de uma leitura.
 */
async function loadSnapshot(userId: string): Promise<AchievementSnapshot> {
  const [linha] = await db
    .select({
      questionsAnswered: sql<number>`(
        select count(*)::int from question_attempts where user_id = ${userId}
      )`,
      questionsCorrect: sql<number>`(
        select count(*)::int from question_attempts
        where user_id = ${userId} and is_correct
      )`,
      reviewsCompleted: sql<number>`(
        select count(*)::int from review_occurrences
        where user_id = ${userId} and status = 'completed'
      )`,
      topicsMastered: sql<number>`(
        select count(*)::int from topic_states
        where user_id = ${userId} and coverage_status = 'mastered'
      )`,
      dailyTasksCompleted: sql<number>`(
        select count(*)::int from daily_tasks
        where user_id = ${userId} and status = 'completed'
      )`,
      longestStreak: sql<number>`coalesce(${userGamificationStates.longestStreak}, 0)`,
      totalXp: sql<number>`coalesce(${userGamificationStates.totalXp}, 0)`,
    })
    .from(userGamificationStates)
    .where(eq(userGamificationStates.userId, userId));

  /*
    A linha de gamificação nasce no primeiro lançamento de XP. Quem ainda não
    tem nenhum não tem linha — e aí os contadores são todos zero, que é a
    resposta certa e não um erro.
  */
  return (
    linha ?? {
      questionsAnswered: 0,
      questionsCorrect: 0,
      reviewsCompleted: 0,
      topicsMastered: 0,
      dailyTasksCompleted: 0,
      longestStreak: 0,
      totalXp: 0,
    }
  );
}

/**
 * Paga XP e moeda de uma conquista, na mesma transação.
 *
 * ⚠️ A CHAVE DOS DOIS LANÇAMENTOS É O ID DA CONQUISTA. Os índices únicos dos
 * livros-razão recusam um segundo pagamento mesmo que esta função rode de novo
 * — e ela roda a cada questão respondida.
 *
 * As duas escritas vão juntas porque a conquista é um evento só: pagar XP e não
 * pagar a moeda deixaria o aluno com uma recompensa pela metade, sem nada na
 * tela explicando a diferença.
 */
async function payReward(input: {
  userId: string;
  achievementId: string;
  xpReward: number;
  coinReward: number;
  now: Date;
}): Promise<void> {
  const hoje = toCivilDate(input.now, APP_TIMEZONE);

  await db.transaction(async (tx) => {
    if (input.xpReward > 0) {
      await awardXp(tx, {
        userId: input.userId,
        entries: [{ activity: "achievement_unlocked", amount: input.xpReward }],
        sourceType: "achievement",
        sourceId: input.achievementId,
        // Conquista não sai de configuração versionada: o valor está no
        // catálogo, que a operação edita direto.
        engineConfigId: null,
        occurredAt: input.now,
        occurredDate: hoje,
      });
    }

    if (input.coinReward <= 0) return;

    const inserido = await tx
      .insert(coinLedger)
      .values({
        userId: input.userId,
        reason: "achievement_reward",
        amount: input.coinReward,
        sourceType: "achievement",
        sourceId: input.achievementId,
        occurredAt: input.now,
        occurredDate: hoje,
      })
      .onConflictDoNothing()
      .returning({ amount: coinLedger.amount });

    if (inserido.length === 0) return;

    await tx
      .update(userGamificationStates)
      .set({
        coinBalance: sql`${userGamificationStates.coinBalance} + ${input.coinReward}`,
        updatedAt: input.now,
      })
      .where(eq(userGamificationStates.userId, input.userId));
  });
}

/* ========================================================================== *
 * LEITURA PARA A TELA
 * ========================================================================== */

export type AchievementView = {
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  progress: number;
  target: number;
  unlockedAt: Date | null;
  xpReward: number;
  coinReward: number;
};

/**
 * As conquistas do aluno, desbloqueadas primeiro.
 *
 * ⚠️ Mostra TODAS, inclusive as que ele nem começou. Uma lista só com o que já
 * foi conquistado não diz o que fazer em seguida; a lista inteira, com barra de
 * progresso, vira roteiro.
 */
export async function listAchievements(userId: string): Promise<AchievementView[]> {
  const catalogo = await db
    .select()
    .from(achievements)
    .where(eq(achievements.isActive, true))
    .orderBy(achievements.sortOrder);

  if (catalogo.length === 0) return [];

  const progresso = await db
    .select({
      achievementId: userAchievements.achievementId,
      progress: userAchievements.progress,
      target: userAchievements.target,
      unlockedAt: userAchievements.unlockedAt,
    })
    .from(userAchievements)
    .where(
      sql`${userAchievements.userId} = ${userId} and ${inArray(
        userAchievements.achievementId,
        catalogo.map((a) => a.id),
      )}`,
    );

  const porId = new Map(progresso.map((p) => [p.achievementId, p]));
  const alvoDoCodigo = new Map(ACHIEVEMENT_CATALOG.map((a) => [a.code, a.target]));

  return catalogo
    .map((conquista) => {
      const meu = porId.get(conquista.id);

      return {
        code: conquista.code,
        name: conquista.name,
        description: conquista.description,
        icon: conquista.icon,
        progress: meu?.progress ?? 0,
        /*
          O alvo vem do módulo puro quando o aluno ainda não tem linha própria.
          Sem isso a barra de uma conquista nunca tocada dividiria por zero e a
          tela mostraria NaN%.
        */
        target: meu?.target ?? alvoDoCodigo.get(conquista.code) ?? 1,
        unlockedAt: meu?.unlockedAt ?? null,
        xpReward: conquista.xpReward,
        coinReward: conquista.coinReward,
      };
    })
    .sort((a, b) => {
      if (!!a.unlockedAt !== !!b.unlockedAt) return a.unlockedAt ? -1 : 1;
      // Entre as pendentes, a mais perto de fechar vem antes.
      return b.progress / b.target - a.progress / a.target;
    });
}
