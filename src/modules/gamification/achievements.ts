/**
 * CONQUISTAS (README 2.3).
 * ============================================================================
 *
 * Módulo puro: recebe um retrato dos contadores do aluno e o catálogo, e diz o
 * que está desbloqueado e o quanto falta para o resto. Não toca no banco.
 *
 * ⚠️ O CRITÉRIO É SEMPRE "CONTADOR >= ALVO", e essa limitação é deliberada.
 *
 * A tentação é deixar `criteria` ser uma expressão livre no JSONB — "acertou
 * 80% em Português numa semana em que estudou 3 dias". Isso transforma o
 * catálogo numa linguagem de programação guardada no banco, sem tipo, sem
 * teste e sem quem a leia depois. Com um contador e um alvo, toda conquista
 * tem barra de progresso de graça ("7 de 30 dias"), o aluno entende o que
 * falta, e acrescentar uma conquista é inserir uma linha.
 *
 * Quando alguma regra realmente não couber aqui, o caminho é criar um CONTADOR
 * novo — não um interpretador.
 */

/** Os contadores que uma conquista pode observar. */
export type CounterName =
  | "questionsAnswered"
  | "questionsCorrect"
  | "reviewsCompleted"
  | "topicsMastered"
  | "dailyTasksCompleted"
  | "longestStreak"
  | "totalXp";

export type AchievementSnapshot = Record<CounterName, number>;

export type AchievementDefinition = {
  code: string;
  name: string;
  description: string;
  icon: string;
  counter: CounterName;
  target: number;
  xpReward: number;
  coinReward: number;
};

export type AchievementProgress = {
  code: string;
  /** Valor atual do contador, limitado ao alvo. */
  progress: number;
  target: number;
  unlocked: boolean;
};

/**
 * Avalia o catálogo inteiro contra o retrato.
 *
 * ⚠️ `progress` é LIMITADO AO ALVO. Quem respondeu 900 questões numa conquista
 * de 500 tem progresso 500 de 500, não 900 de 500 — senão a barra estoura e a
 * porcentagem passa de 100%.
 */
export function evaluateAchievements(
  snapshot: AchievementSnapshot,
  catalog: AchievementDefinition[],
): AchievementProgress[] {
  return catalog.map((definicao) => {
    const atual = snapshot[definicao.counter] ?? 0;

    return {
      code: definicao.code,
      progress: Math.min(atual, definicao.target),
      target: definicao.target,
      unlocked: atual >= definicao.target,
    };
  });
}

/**
 * O CATÁLOGO.
 *
 * ⚠️ A ORDEM IMPORTA: dentro de cada família, do mais fácil para o mais
 * difícil. É assim que a tela mostra a próxima meta em vez de a mais distante,
 * e é o que faz a lista servir de escada em vez de de vitrine.
 *
 * Os valores de XP e moeda são modestos de propósito. Conquista é
 * reconhecimento; se ela pagasse como uma semana de estudo, valeria mais caçar
 * conquista do que estudar.
 */
export const ACHIEVEMENT_CATALOG: AchievementDefinition[] = [
  {
    code: "first_question",
    name: "Primeiro passo",
    description: "Você respondeu a sua primeira questão.",
    icon: "🎯",
    counter: "questionsAnswered",
    target: 1,
    xpReward: 20,
    coinReward: 5,
  },
  {
    code: "questions_50",
    name: "Pegando o ritmo",
    description: "50 questões respondidas.",
    icon: "📈",
    counter: "questionsAnswered",
    target: 50,
    xpReward: 60,
    coinReward: 15,
  },
  {
    code: "questions_500",
    name: "Maratonista",
    description: "500 questões respondidas.",
    icon: "🏃",
    counter: "questionsAnswered",
    target: 500,
    xpReward: 250,
    coinReward: 60,
  },
  {
    code: "streak_3",
    name: "Três dias de pé",
    description: "Você estudou três dias seguidos.",
    icon: "🔥",
    counter: "longestStreak",
    target: 3,
    xpReward: 40,
    coinReward: 10,
  },
  {
    code: "streak_7",
    name: "Uma semana inteira",
    description: "Sete dias seguidos de estudo.",
    icon: "🔥",
    counter: "longestStreak",
    target: 7,
    xpReward: 100,
    coinReward: 25,
  },
  {
    code: "streak_30",
    name: "Um mês sem falhar",
    description: "Trinta dias seguidos. Poucos chegam aqui.",
    icon: "👑",
    counter: "longestStreak",
    target: 30,
    xpReward: 400,
    coinReward: 100,
  },
  {
    code: "first_review",
    name: "Primeira revisão",
    description: "Você fechou o primeiro ciclo de revisão espaçada.",
    icon: "🔁",
    counter: "reviewsCompleted",
    target: 1,
    xpReward: 30,
    coinReward: 8,
  },
  {
    code: "reviews_50",
    name: "Memória treinada",
    description: "50 revisões realizadas no prazo ou fora dele.",
    icon: "🧠",
    counter: "reviewsCompleted",
    target: 50,
    xpReward: 200,
    coinReward: 50,
  },
  {
    code: "topic_mastered_1",
    name: "Assunto dominado",
    description: "Um assunto do seu edital chegou a dominado.",
    icon: "⭐",
    counter: "topicsMastered",
    target: 1,
    xpReward: 50,
    coinReward: 12,
  },
  {
    code: "topics_mastered_10",
    name: "Dez domínios",
    description: "Dez assuntos do seu edital dominados.",
    icon: "🌟",
    counter: "topicsMastered",
    target: 10,
    xpReward: 300,
    coinReward: 75,
  },
  {
    code: "daily_task_1",
    name: "Dia cumprido",
    description: "Você concluiu uma Tarefa do Dia inteira.",
    icon: "✅",
    counter: "dailyTasksCompleted",
    target: 1,
    xpReward: 40,
    coinReward: 10,
  },
  {
    code: "daily_task_10",
    name: "Constância",
    description: "Dez Tarefas do Dia concluídas.",
    icon: "🏆",
    counter: "dailyTasksCompleted",
    target: 10,
    xpReward: 200,
    coinReward: 50,
  },
];
