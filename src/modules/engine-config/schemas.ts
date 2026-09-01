import { z } from "zod";

/**
 * Formato e validação das configurações versionadas dos motores.
 *
 * O `payload` de `engine_configs` é JSONB porque cada tipo tem um formato
 * diferente e a lista de sinais vai crescer na calibração — trocar o formato
 * não pode exigir migration. O preço disso é que o banco não valida o conteúdo.
 *
 * Estes schemas são esse preço pago: TODA leitura e TODA escrita de
 * configuração passa por aqui. É onde ficam as invariantes que o Postgres não
 * consegue expressar — a principal delas sendo que os cinco pesos do Motor 1
 * somam 100.
 */

/* ========================================================================== *
 * MOTOR 1 — PESOS DA TAREFA DO DIA (README 1.6)
 * ========================================================================== */

const weight = z.number().min(0).max(100);

export const dailyTaskWeightsSchema = z
  .object({
    /** Desempenho do aluno no assunto. */
    performance: weight,
    /** Peso do assunto no edital. */
    editalWeight: weight,
    /** Proximidade da prova. */
    urgency: weight,
    /** Há quanto tempo não estuda. */
    recency: weight,
    /** Lacunas de conhecimento. */
    knowledgeGap: weight,
  })
  .refine(
    (w) =>
      Math.abs(
        w.performance + w.editalWeight + w.urgency + w.recency + w.knowledgeGap - 100,
      ) < 0.01,
    {
      message:
        "Os cinco pesos precisam somar exatamente 100. " +
        "Se somassem outra coisa, o score de prioridade deixaria de ser comparável " +
        "entre versões e o histórico ficaria sem sentido.",
    },
  );

export type DailyTaskWeights = z.infer<typeof dailyTaskWeightsSchema>;

/** Os padrões do README. Viram a versão 1, criada pelo seed. */
export const DEFAULT_DAILY_TASK_WEIGHTS: DailyTaskWeights = {
  performance: 30,
  editalWeight: 20,
  urgency: 20,
  recency: 15,
  knowledgeGap: 15,
};

/* ========================================================================== *
 * GAMIFICAÇÃO — XP POR ATIVIDADE (README 2.3)
 * ========================================================================== */

const xp = z.number().int().min(0).max(10_000);

export const xpValuesSchema = z
  .object({
    /** 📚 Estudo concluído. */
    studyCompleted: xp,
    /** ❓ Questão respondida. */
    questionAnswered: xp,
    /** ✅ Bônus de acerto, SOMADO ao valor de questão respondida. */
    correctBonus: xp,
    /** 🔥 Dia de constância (streak). */
    streakDay: xp,
    /** 🏆 Meta diária concluída. */
    dailyGoalCompleted: xp,
    /** 🔁 Revisão realizada. */
    reviewCompleted: xp,
  })
  .refine((v) => v.correctBonus > 0, {
    message:
      "O bônus de acerto precisa ser maior que zero: acertar tem que valer mais " +
      "que apenas responder (README 2.3). Com bônus zero, chutar rende o mesmo " +
      "que saber.",
  });

export type XpValues = z.infer<typeof xpValuesSchema>;

export const DEFAULT_XP_VALUES: XpValues = {
  studyCompleted: 30,
  questionAnswered: 5,
  correctBonus: 5,
  streakDay: 20,
  dailyGoalCompleted: 50,
  reviewCompleted: 40,
};

/* ========================================================================== *
 * GAMIFICAÇÃO — MOEDAS POR ATIVIDADE (README 2.3)
 * ========================================================================== */

const coins = z.number().int().min(0).max(1000);

/**
 * ⚠️ SEPARADO DE `xp_values`, e não é organização: são grandezas diferentes.
 *
 * XP mede progresso acumulado e nunca é gasto — é o que define o nível e a
 * posição no ranking. Moeda é saldo: sai da conta quando o aluno troca por algo
 * na Loja. Num payload só, calibrar o XP mexeria no poder de compra da Loja sem
 * que ninguém tivesse pedido, e o inverso também.
 */
export const coinValuesSchema = z
  .object({
    /** 🏆 Tarefa do Dia concluída — a recompensa principal. */
    dailyTaskCompleted: coins,
    /** 🔁 Revisão espaçada realizada. */
    reviewCompleted: coins,
    /** 🔥 Cada novo dia da sequência. */
    streakDay: coins,
  })
  .refine((v) => v.dailyTaskCompleted + v.reviewCompleted + v.streakDay > 0, {
    message:
      "Pelo menos uma atividade precisa render moeda. Com tudo em zero, a Loja " +
      "fica visível e inalcançável — o aluno vê preços que nunca vai poder pagar.",
  });

export type CoinValues = z.infer<typeof coinValuesSchema>;

/**
 * Os padrões vêm das missões já semeadas: "cumprir todas as metas do dia" valia
 * 25 moedas e "fazer 1 revisão espaçada" valia 5. Manter os mesmos números
 * evita que a Loja e o catálogo de missões contem histórias diferentes sobre
 * quanto vale a mesma coisa.
 */
export const DEFAULT_COIN_VALUES: CoinValues = {
  dailyTaskCompleted: 25,
  reviewCompleted: 5,
  streakDay: 10,
};

/* ========================================================================== *
 * MOTOR 2 — INTERVALOS DA CURVA DO ESQUECIMENTO (README 1.7)
 * ========================================================================== */

export const reviewIntervalsSchema = z
  .object({
    /** Em dias, a partir do estudo. O padrão é 24h, 7, 30, 60 e 90 dias. */
    intervalsInDays: z.array(z.number().int().min(1).max(3650)).min(1).max(12),
    /**
     * Revisão atrasada conta o intervalo seguinte a partir da execução real,
     * não da data prevista (decisão do Eduardo). Deixar configurável permite
     * testar o contrário na calibração sem mexer em código.
     */
    countNextFromCompletion: z.boolean(),
    /** Marco 1: desempenho ruim NÃO reinicia o ciclo. */
    resetCycleOnPoorPerformance: z.boolean(),
  })
  .refine(
    (v) => v.intervalsInDays.every((d, i, arr) => i === 0 || d > arr[i - 1]),
    {
      message:
        "Os intervalos precisam ser estritamente crescentes — é o que define " +
        "uma curva do esquecimento.",
    },
  );

export type ReviewIntervals = z.infer<typeof reviewIntervalsSchema>;

export const DEFAULT_REVIEW_INTERVALS: ReviewIntervals = {
  intervalsInDays: [1, 7, 30, 60, 90],
  countNextFromCompletion: true,
  resetCycleOnPoorPerformance: false,
};

/* ========================================================================== *
 * ÍNDICE DE PREPARAÇÃO (README 2.1)
 * ========================================================================== */

/**
 * ⚠️ "Índice de Preparação", nunca "Índice de Aprovação" (decisão fechada).
 * Os rótulos abaixo foram aprovados pelo Eduardo em 20/08/2026 e descrevem
 * ESTADO DA PREPARAÇÃO — nenhum sugere probabilidade de passar, e nenhum
 * colide com os nomes dos níveis de gamificação.
 */
export const preparationIndexSchema = z
  .object({
    weights: z
      .object({
        /** % do edital já estudado. */
        coverage: weight,
        /** % de acerto nas questões. */
        accuracy: weight,
        /** % de revisões feitas no prazo. */
        reviewAdherence: weight,
        /** % de tarefas do dia concluídas. */
        taskCompletion: weight,
      })
      .refine(
        (w) =>
          Math.abs(w.coverage + w.accuracy + w.reviewAdherence + w.taskCompletion - 100) <
          0.01,
        { message: "Os pesos do Índice de Preparação precisam somar 100." },
      ),
    bands: z
      .array(
        z.object({
          min: z.number().int().min(0).max(100),
          max: z.number().int().min(0).max(100),
          label: z.string().min(1).max(40),
        }),
      )
      .min(2),
  })
  .refine(
    (v) =>
      v.bands.every((b) => b.min <= b.max) &&
      v.bands[0].min === 0 &&
      v.bands[v.bands.length - 1].max === 100 &&
      v.bands.every((b, i) => i === 0 || b.min === v.bands[i - 1].max + 1),
    {
      message:
        "As faixas precisam cobrir de 0 a 100 sem buraco e sem sobreposição — " +
        "senão existe um valor de índice para o qual não há rótulo.",
    },
  );

export type PreparationIndexConfig = z.infer<typeof preparationIndexSchema>;

export const DEFAULT_PREPARATION_INDEX: PreparationIndexConfig = {
  weights: {
    coverage: 30,
    accuracy: 35,
    reviewAdherence: 20,
    taskCompletion: 15,
  },
  bands: [
    { min: 0, max: 39, label: "Em construção" },
    { min: 40, max: 59, label: "Ganhando ritmo" },
    { min: 60, max: 74, label: "Consistente" },
    { min: 75, max: 89, label: "Sólido" },
    { min: 90, max: 100, label: "No ponto" },
  ],
};

/* ========================================================================== *
 * CRONOGRAMA ADAPTATIVO
 * ========================================================================== */

export const scheduleParamsSchema = z.object({
  /** Dias materializados em `schedule_entries`. Além disso é projeção. */
  materializedWindowDays: z.number().int().min(3).max(90),
  /**
   * Fração do tempo diário reservada para revisões antes de a Tarefa do Dia
   * ocupar o resto. Garante que a revisão nunca seja espremida a zero.
   */
  reviewTimeShare: z.number().min(0).max(0.8),
  /** Teto de itens numa Tarefa do Dia — mais que isso vira lista intimidante. */
  maxDailyTaskItems: z.number().int().min(1).max(20),
  /** Minutos padrão de um item de estudo quando não há estimativa melhor. */
  defaultStudyBlockMinutes: z.number().int().min(5).max(180),
  /**
   * Quando o aluno tem mais de uma preparação ativa (Premium), o orçamento
   * diário dele é dividido entre elas. Este expoente controla o quanto a prova
   * mais próxima puxa a divisão: 0 divide igual, valores maiores concentram
   * mais na prova iminente.
   */
  urgencyAllocationExponent: z.number().min(0).max(3),
});

export type ScheduleParams = z.infer<typeof scheduleParamsSchema>;

export const DEFAULT_SCHEDULE_PARAMS: ScheduleParams = {
  materializedWindowDays: 14,
  reviewTimeShare: 0.3,
  maxDailyTaskItems: 6,
  defaultStudyBlockMinutes: 30,
  urgencyAllocationExponent: 1,
};

/* ========================================================================== *
 * TÉCNICAS DE ESTUDO PRESCRITAS (decisão da cliente, 20/08/2026)
 * ========================================================================== */

export const STUDY_TECHNIQUES = [
  "reading",
  "video",
  "flashcard",
  "mind_map",
  "summary",
  "audio",
  "questions",
  "other",
] as const;

const studyTechnique = z.enum(STUDY_TECHNIQUES);

/**
 * A Tarefa do Dia é apresentada em BLOCOS, e cada bloco prescreve uma técnica:
 *
 *     🧠 Estude: Mapa Mental — Crase
 *     🎯 Pratique: Questões — Crase
 *
 * Esta configuração define quais técnicas entram na rotação e com que política.
 * Fica no banco, e não em código, porque é exatamente o tipo de coisa que a
 * operação vai querer ajustar sem deploy — desligar videoaula enquanto o acervo
 * de vídeo está vazio, por exemplo.
 */
export const studyTechniquesSchema = z
  .object({
    /** Técnicas na rotação, em ordem de preferência. */
    enabled: z.array(studyTechnique).min(1),

    /**
     * Usada quando não existe material da técnica prescrita para o assunto.
     * No começo da operação o acervo está vazio, então este é o caso comum.
     */
    fallback: studyTechnique,

    /**
     * Quantas sessões precisam passar antes de o mesmo assunto repetir a mesma
     * técnica. É o que garante que cada assunto seja estudado por técnicas
     * diferentes ao longo do tempo — sem isso a comparação entre técnicas
     * mediria a dificuldade dos assuntos, não a eficácia das técnicas.
     */
    minSessionsBeforeRepeat: z.number().int().min(0).max(10),

    /**
     * Todo bloco de estudo vem com prática de questões junto.
     * Palavras da cliente: "sempre tem prática de questões junto no bloco de
     * estudo, para que o sistema possa medir a melhor técnica de estudo".
     */
    alwaysPairWithQuestions: z.boolean(),

    /**
     * ⚠️ NÃO exibir a quantidade de questões no bloco.
     * No Free o teto é 10 por dia; anunciar um número maior seria prometer o
     * que o plano não entrega.
     */
    showQuestionCount: z.boolean(),

    /**
     * Mínimo de questões respondidas depois de um estudo para que aquela
     * técnica entre na conta da métrica. Abaixo disso a amostra é ruído.
     */
    minAttemptsForTechniqueStats: z.number().int().min(1).max(100),
  })
  .refine((v) => v.enabled.includes(v.fallback), {
    message: "A técnica de fallback precisa estar entre as técnicas habilitadas.",
  })
  .refine((v) => !v.showQuestionCount, {
    message:
      "Exibir a quantidade de questões no bloco contraria a decisão da cliente: " +
      "no plano Free o teto diário é menor que a meta interna e o aluno veria " +
      "uma promessa que o plano não cumpre. Para reverter, é decisão de produto.",
  });

export type StudyTechniquesConfig = z.infer<typeof studyTechniquesSchema>;

export const DEFAULT_STUDY_TECHNIQUES: StudyTechniquesConfig = {
  /**
   * "questions" fica de fora da rotação de ESTUDO: ela é o par de prática de
   * todo bloco, não uma das técnicas comparadas.
   *
   * "video" está DESLIGADA por decisão da cliente em 20/08/2026, enquanto o
   * acervo de videoaulas não existir. Prescrever "Estude: Videoaula — Crase"
   * sem ter o vídeo seria prometer o que não há. Reativar é um clique no
   * painel; não precisa de deploy.
   */
  enabled: ["mind_map", "flashcard", "summary", "reading"],
  fallback: "reading",
  minSessionsBeforeRepeat: 2,
  alwaysPairWithQuestions: true,
  showQuestionCount: false,
  minAttemptsForTechniqueStats: 20,
};

/* ========================================================================== *
 * DESPACHO POR TIPO
 * ========================================================================== */

export const ENGINE_CONFIG_SCHEMAS = {
  daily_task_weights: dailyTaskWeightsSchema,
  xp_values: xpValuesSchema,
  coin_values: coinValuesSchema,
  review_intervals: reviewIntervalsSchema,
  preparation_index: preparationIndexSchema,
  schedule_params: scheduleParamsSchema,
  study_techniques: studyTechniquesSchema,
} as const;

export type EngineConfigKind = keyof typeof ENGINE_CONFIG_SCHEMAS;

export const ENGINE_CONFIG_DEFAULTS: {
  [K in EngineConfigKind]: z.infer<(typeof ENGINE_CONFIG_SCHEMAS)[K]>;
} = {
  daily_task_weights: DEFAULT_DAILY_TASK_WEIGHTS,
  xp_values: DEFAULT_XP_VALUES,
  coin_values: DEFAULT_COIN_VALUES,
  review_intervals: DEFAULT_REVIEW_INTERVALS,
  preparation_index: DEFAULT_PREPARATION_INDEX,
  schedule_params: DEFAULT_SCHEDULE_PARAMS,
  study_techniques: DEFAULT_STUDY_TECHNIQUES,
};

/**
 * Valida um payload vindo do banco ou do formulário do painel.
 *
 * Lança com mensagem legível: esta função é chamada tanto no salvamento (onde a
 * mensagem vai para o administrador) quanto na leitura pelos motores (onde uma
 * configuração corrompida precisa parar o processamento em vez de gerar uma
 * tarefa silenciosamente errada).
 */
export function parseEngineConfig<K extends EngineConfigKind>(
  kind: K,
  payload: unknown,
): z.infer<(typeof ENGINE_CONFIG_SCHEMAS)[K]> {
  const schema = ENGINE_CONFIG_SCHEMAS[kind];
  const result = schema.safeParse(payload);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  • ${issue.path.join(".") || kind}: ${issue.message}`)
      .join("\n");
    throw new Error(`Configuração "${kind}" inválida:\n${details}`);
  }

  return result.data as z.infer<(typeof ENGINE_CONFIG_SCHEMAS)[K]>;
}
