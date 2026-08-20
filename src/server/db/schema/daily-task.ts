import { relations } from "drizzle-orm";
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { dailyTaskItemKindEnum, dailyTaskStatusEnum, taskItemStatusEnum } from "./enums";
import { engineConfigs } from "./engine";
import { users } from "./identity";
import { preparations, studyPlanTopics } from "./preparation";

/* ==========================================================================
 * MOTOR 1 — TAREFA DO DIA
 * ==========================================================================
 *
 * ⚠️ ESTE MOTOR É SEPARADO DO MOTOR DE REVISÃO (README 1.6 e 1.7, decisão
 * fechada com a cliente). As duas coisas NÃO compartilham tabela, não
 * compartilham fila e não compartilham regra.
 *
 * A diferença conceitual, que é o que justifica a separação no schema:
 *
 *   • A TAREFA DO DIA é uma DECISÃO, tomada hoje, sobre o que vale mais a pena
 *     estudar hoje. Vale por um dia e é recalculada com os sinais atuais.
 *     Cruza 5 sinais ponderados. Vive aqui.
 *
 *   • A REVISÃO é um COMPROMISSO, assumido no passado, com data marcada no
 *     futuro. Foi agendada quando o aluno estudou o conteúdo e não depende de
 *     desempenho nem de prioridade: vence no dia em que vence. Vive em
 *     `review.ts`.
 *
 * Misturar as duas faria a revisão competir por espaço com a priorização e
 * desapareceria em dia cheio — exatamente o que a curva do esquecimento não
 * pode permitir.
 * ========================================================================== */

/**
 * A Tarefa do Dia de uma preparação, num dia.
 *
 * `taskDate` é a data civil no fuso do aluno, não UTC: a tarefa vira à
 * meia-noite de Brasília e o índice único impede duas tarefas para o mesmo dia.
 *
 * ANCORAGEM (`anchoredAt`)
 * ----------------------------------------------------------------------------
 * O cronograma é adaptativo e recalcula a cada interação (README 1.8). Mas se a
 * tarefa DE HOJE se reescrevesse a cada questão respondida, o aluno veria o
 * plano mudar debaixo dele no meio da execução e perderia a confiança no
 * sistema. Por isso: assim que o aluno inicia a tarefa, ela é ancorada e não é
 * mais reordenada. Os recálculos passam a valer de amanhã em diante.
 *
 * `engineConfigId` amarra a tarefa à versão dos pesos que a gerou (decisão 14).
 */
export const dailyTasks = pgTable(
  "daily_tasks",
  {
    id: primaryId(),
    preparationId: uuid()
      .notNull()
      .references(() => preparations.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    taskDate: date({ mode: "string" }).notNull(),
    status: dailyTaskStatusEnum().notNull().default("generated"),

    /**
     * Qual versão dos pesos produziu esta tarefa.
     *
     * `notNull` + `restrict`: uma tarefa sem configuração seria inexplicável, e
     * apagar uma configuração que já gerou tarefa tornaria o histórico
     * inexplicável em massa. As duas coisas ficam impossíveis pelo banco.
     */
    engineConfigId: uuid()
      .notNull()
      .references(() => engineConfigs.id, { onDelete: "restrict" }),

    /** Vindo de `preparationAvailability` para o dia da semana correspondente. */
    plannedMinutes: integer().notNull().default(0),
    actualMinutes: integer().notNull().default(0),

    generatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    anchoredAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),

    itemsTotal: integer().notNull().default(0),
    itemsCompleted: integer().notNull().default(0),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("daily_tasks_preparation_date_unique").on(
      table.preparationId,
      table.taskDate,
    ),
    index("daily_tasks_user_date_idx").on(table.userId, table.taskDate),
    index("daily_tasks_status_idx").on(table.status, table.taskDate),
  ],
);

/**
 * Um item da Tarefa do Dia: "estude X", "resolva N questões de Y".
 *
 * `priorityBreakdown` É O CORAÇÃO DA EXPLICABILIDADE.
 * ----------------------------------------------------------------------------
 * O README exige que a priorização seja "regra de negócio explícita, não
 * delegar à IA — precisa ser previsível e explicável" (1.6). Guardar só o score
 * final não é explicável: 0,82 não diz nada.
 *
 * Aqui guardamos a contribuição de cada um dos 5 sinais no momento do cálculo.
 * É o que alimenta a tela "Entenda o Algoritmo" (README 2.2), o que permite à
 * operação responder "por que este assunto caiu hoje?" e o que torna possível
 * calibrar os pesos olhando dados reais em vez de intuição.
 */
export const dailyTaskItems = pgTable(
  "daily_task_items",
  {
    id: primaryId(),
    dailyTaskId: uuid()
      .notNull()
      .references(() => dailyTasks.id, { onDelete: "cascade" }),
    preparationId: uuid()
      .notNull()
      .references(() => preparations.id, { onDelete: "cascade" }),
    planTopicId: uuid()
      .notNull()
      .references(() => studyPlanTopics.id, { onDelete: "cascade" }),

    kind: dailyTaskItemKindEnum().notNull(),
    status: taskItemStatusEnum().notNull().default("pending"),

    targetQuestionCount: integer(),
    targetMinutes: integer(),
    answeredQuestionCount: integer().notNull().default(0),

    priorityScore: real().notNull(),

    /**
     * Guarda os sinais em DUAS formas, e as duas têm uso distinto:
     *
     *   `signals`       — o valor cru de cada sinal, de 0 a 1, ANTES do peso.
     *                     É o que permite perguntar meses depois "e se a
     *                     urgência valesse 40% em vez de 20%?" e responder
     *                     recalculando em cima do que ficou gravado, sem
     *                     reprocessar o histórico inteiro. É o que torna a
     *                     calibração dos pesos uma simulação, e não um chute.
     *
     *   `contributions` — o mesmo sinal já multiplicado pelo peso vigente.
     *                     É o que a tela "Entenda o Algoritmo" exibe.
     *
     * INVARIANTE: a soma de `contributions` é igual a `priorityScore`.
     * O teste do motor verifica isso. Se não somar, a linha está corrompida —
     * e o registro passa a denunciar o próprio erro em vez de escondê-lo.
     */
    priorityBreakdown: jsonb()
      .$type<{
        signals: {
          /** Desempenho do aluno no assunto (peso padrão 30%). */
          performance: number;
          /** Peso do assunto no edital (20%). */
          editalWeight: number;
          /** Proximidade da prova (20%). */
          urgency: number;
          /** Há quanto tempo não estuda (15%). */
          recency: number;
          /** Lacunas de conhecimento (15%). */
          knowledgeGap: number;
        };
        contributions: {
          performance: number;
          editalWeight: number;
          urgency: number;
          recency: number;
          knowledgeGap: number;
        };
      }>()
      .notNull(),

    /** Frase curta pronta para a UI: "você errou 60% aqui na última semana". */
    reasonLabel: text(),

    sortOrder: integer().notNull().default(0),
    startedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),

    ...timestamps,
  },
  (table) => [
    index("daily_task_items_task_idx").on(table.dailyTaskId, table.sortOrder),
    index("daily_task_items_topic_idx").on(table.planTopicId),
    index("daily_task_items_status_idx").on(table.status),
  ],
);

export const dailyTasksRelations = relations(dailyTasks, ({ one, many }) => ({
  preparation: one(preparations, {
    fields: [dailyTasks.preparationId],
    references: [preparations.id],
  }),
  user: one(users, { fields: [dailyTasks.userId], references: [users.id] }),
  engineConfig: one(engineConfigs, {
    fields: [dailyTasks.engineConfigId],
    references: [engineConfigs.id],
  }),
  items: many(dailyTaskItems),
}));

export const dailyTaskItemsRelations = relations(dailyTaskItems, ({ one }) => ({
  dailyTask: one(dailyTasks, {
    fields: [dailyTaskItems.dailyTaskId],
    references: [dailyTasks.id],
  }),
  planTopic: one(studyPlanTopics, {
    fields: [dailyTaskItems.planTopicId],
    references: [studyPlanTopics.id],
  }),
}));
