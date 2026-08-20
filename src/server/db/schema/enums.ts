import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Todos os enums do banco, centralizados.
 *
 * Enum do PostgreSQL aceita ACRESCENTAR valor sem dor (`ALTER TYPE ... ADD
 * VALUE`), mas remover exige recriar o tipo. Por isso só viram enum os domínios
 * fechados e estáveis. Domínios que a operação edita no dia a dia (nomes de
 * nível, categorias de material, tipos de missão) são LINHAS EM TABELA, não
 * enums — senão o painel administrativo precisaria de migration para funcionar.
 */

/* ========================================================================== *
 * IDENTIDADE E ACESSO
 * ========================================================================== */

export const userRoleEnum = pgEnum("user_role", ["student", "admin"]);

export const userStatusEnum = pgEnum("user_status", [
  "active",
  "suspended",
  /** Titular pediu exclusão; PII já removida. A linha sobrevive só como âncora. */
  "anonymized",
]);

export const verificationTokenTypeEnum = pgEnum("verification_token_type", [
  "email_verification",
  "password_reset",
  "email_change",
]);

export const consentTypeEnum = pgEnum("consent_type", [
  /** Termos de uso. */
  "terms",
  /** Política de Privacidade — obrigatório no cadastro (README 1.1). */
  "privacy",
  /** Comunicação de marketing — opcional e separado, exigência da LGPD. */
  "marketing",
]);

export const legalDocumentTypeEnum = pgEnum("legal_document_type", [
  "terms",
  "privacy",
]);

export const deletionRequestStatusEnum = pgEnum("deletion_request_status", [
  "pending",
  "processing",
  "completed",
  "canceled",
]);

/* ========================================================================== *
 * PLANOS E ASSINATURA
 * ========================================================================== */

export const billingPeriodEnum = pgEnum("billing_period", ["monthly", "annual"]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "pending",
  "past_due",
  "canceled",
  "expired",
]);

export const paymentProviderEnum = pgEnum("payment_provider", [
  "mercadopago",
  /** Plano atribuído pela operação, sem cobrança. É como o Free funciona. */
  "manual",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "approved",
  "rejected",
  "refunded",
  "charged_back",
  "canceled",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "pix",
  "credit_card",
  "boleto",
  "other",
]);

/** Nível de acesso a material por plano (README 2.5: Limitado/Ampliado/Completo). */
export const contentAccessLevelEnum = pgEnum("content_access_level", [
  "limited",
  "extended",
  "full",
]);

/* ========================================================================== *
 * PREPARAÇÃO E EDITAL
 * ========================================================================== */

/**
 * O ciclo de vida da preparação É o funil de ativação do painel administrativo.
 * Cada valor aqui corresponde a uma pergunta que a Natália vai fazer:
 * quantos criaram, quantos subiram edital, quantos confirmaram, quantos
 * concluíram o diagnóstico. Mudar esta lista muda o funil.
 */
export const preparationStatusEnum = pgEnum("preparation_status", [
  /** Criada, ainda sem edital. */
  "draft",
  /** PDF enviado, IA processando. */
  "extracting",
  /** IA terminou, aguardando o aluno revisar e corrigir (README 1.4 passo 3). */
  "review_pending",
  /** Conteúdo confirmado, aguardando diagnóstico (README 1.4 passo 5). */
  "diagnosis_pending",
  /** Diagnóstico feito, motores rodando. */
  "active",
  /** Encerrada pelo aluno (README 1.10). */
  "archived",
  /** A extração falhou e o aluno precisa reenviar. */
  "failed",
]);

export const documentSourceEnum = pgEnum("document_source", [
  "student_upload",
  "admin_upload",
]);

export const extractionStatusEnum = pgEnum("extraction_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
]);

/** Quem colocou o item no conteúdo programático. */
export const contentOriginEnum = pgEnum("content_origin", [
  "ai",
  "student",
  "admin",
]);

/**
 * De onde veio o peso do assunto (decisão fechada com a cliente: vem do edital
 * quando disponível, campo manual na confirmação quando não vier).
 */
export const weightSourceEnum = pgEnum("weight_source", [
  /** A IA encontrou a quantidade de questões por tema no PDF. */
  "edital",
  /** O aluno preencheu na tela de confirmação. */
  "student",
  /** Ninguém informou: o motor usa peso neutro. */
  "default",
  "admin",
]);

/**
 * Situação do casamento entre o assunto do edital do aluno (texto livre) e o
 * catálogo canônico. É o ponto onde a Tarefa do Dia deixa de achar questão.
 */
export const topicMappingStatusEnum = pgEnum("topic_mapping_status", [
  /** Casado automaticamente com confiança alta. */
  "mapped",
  /** Casado à mão por um administrador. */
  "manually_mapped",
  /** Nenhum candidato razoável — vai para a fila do painel. */
  "unmapped",
  /** Vários candidatos plausíveis — vai para a fila do painel. */
  "ambiguous",
  /** Administrador decidiu que este item não tem correspondência (ex.: "Bibliografia"). */
  "ignored",
]);

export const mappingQueueStatusEnum = pgEnum("mapping_queue_status", [
  "pending",
  "resolved",
  "ignored",
]);

/** Autodiagnóstico inicial (README 1.5). */
export const masteryLevelEnum = pgEnum("mastery_level", [
  "high", // 🟢 Alto domínio
  "medium", // 🟡 Domínio mediano
  "low", // 🔴 Baixo domínio
]);

export const diagnosticStatusEnum = pgEnum("diagnostic_status", [
  "in_progress",
  /** Concluído e TRAVADO. Não há terceiro estado (ver nota em `diagnostics`). */
  "completed",
]);

/**
 * Granularidade do diagnóstico.
 *
 * Hoje o produto SEMPRE usa "subject" (disciplina) — decisão da cliente em
 * 20/08/2026. Os outros valores ficam porque remover valor de enum no Postgres
 * é caro e porque a decisão pode voltar atrás; a aplicação nunca os escreve.
 */
export const diagnosticGranularityEnum = pgEnum("diagnostic_granularity", [
  "subject",
  "topic",
  "mixed",
]);

/** Cobertura do edital por assunto (alimenta o gráfico circular do Marco 2). */
export const coverageStatusEnum = pgEnum("coverage_status", [
  "not_started",
  "in_progress",
  "studied",
  "mastered",
]);

/* ========================================================================== *
 * MOTORES
 * ========================================================================== */

/**
 * Tipos de configuração versionada do algoritmo.
 * Tudo que o painel administrativo edita e que muda o resultado dos motores
 * passa por aqui — nunca por constante em código.
 */
export const engineConfigKindEnum = pgEnum("engine_config_kind", [
  /** Os 5 pesos do Motor 1 (README 1.6). */
  "daily_task_weights",
  /** XP por atividade (README 2.3). */
  "xp_values",
  /** Intervalos da curva do esquecimento (README 1.7). */
  "review_intervals",
  /** Composição do Índice de Preparação. */
  "preparation_index",
  /** Parâmetros de montagem do cronograma adaptativo. */
  "schedule_params",
]);

export const dailyTaskStatusEnum = pgEnum("daily_task_status", [
  "generated",
  "in_progress",
  "completed",
  /** Passou o dia sem ser concluída. */
  "expired",
]);

export const dailyTaskItemKindEnum = pgEnum("daily_task_item_kind", [
  /** Estudar o conteúdo. Concluir dispara a série de revisões do Motor 2. */
  "study",
  /** Resolver questões do assunto. */
  "questions",
  /** Reforço de assunto com muito erro. */
  "reinforcement",
]);

export const taskItemStatusEnum = pgEnum("task_item_status", [
  "pending",
  "in_progress",
  "completed",
  "skipped",
]);

export const reviewScheduleStatusEnum = pgEnum("review_schedule_status", [
  "active",
  "completed",
  "canceled",
]);

export const reviewOccurrenceStatusEnum = pgEnum("review_occurrence_status", [
  /** Agendada para o futuro. */
  "scheduled",
  /** Concluída pelo aluno. */
  "completed",
  /** Pulada explicitamente. */
  "skipped",
  /** Cancelada porque a preparação foi encerrada ou o assunto removido. */
  "canceled",
]);

export const reviewTriggerEnum = pgEnum("review_trigger", [
  "study_completed",
  "manual",
]);

export const scheduleEntrySourceEnum = pgEnum("schedule_entry_source", [
  /** Posicionada pelo motor. */
  "engine",
  /** O aluno adiantou ou atrasou (README 1.8). */
  "student_moved",
]);

export const scheduleEntryStatusEnum = pgEnum("schedule_entry_status", [
  "planned",
  "completed",
  "missed",
  "moved",
]);

/** Por que o cronograma foi recalculado — permite explicar a mudança ao aluno. */
export const scheduleRecalcReasonEnum = pgEnum("schedule_recalc_reason", [
  "initial",
  "question_answered",
  "study_completed",
  "review_completed",
  "student_moved_item",
  "content_changed",
  "availability_changed",
  "exam_date_changed",
  "engine_config_changed",
  "daily_rollover",
]);

/* ========================================================================== *
 * QUESTÕES
 * ========================================================================== */

export const questionDifficultyEnum = pgEnum("question_difficulty", [
  "easy",
  "medium",
  "hard",
]);

export const questionTypeEnum = pgEnum("question_type", [
  "multiple_choice",
  "true_false",
]);

export const questionStatusEnum = pgEnum("question_status", [
  "draft",
  "published",
  "archived",
]);

/** De onde o aluno respondeu — separa Tarefa do Dia, banco livre e revisão. */
export const attemptSourceEnum = pgEnum("attempt_source", [
  "daily_task",
  "question_bank",
  "review",
]);

export const importBatchStatusEnum = pgEnum("import_batch_status", [
  "processing",
  "completed",
  "completed_with_errors",
  "failed",
]);

/* ========================================================================== *
 * ESTUDO E PERMANÊNCIA
 * ========================================================================== */

/** Alimenta o card "Melhor técnica de estudo" (README 2.1). */
export const studyTechniqueEnum = pgEnum("study_technique", [
  "reading",
  "video",
  "flashcard",
  "mind_map",
  "questions",
  "summary",
  "audio",
  "other",
]);

export const deviceTypeEnum = pgEnum("device_type", [
  "mobile",
  "tablet",
  "desktop",
  "unknown",
]);

export const usageSessionEndReasonEnum = pgEnum("usage_session_end_reason", [
  /** O navegador parou de mandar sinal de vida — o caso mais comum. */
  "heartbeat_timeout",
  "explicit_logout",
  "tab_closed",
  "auth_session_expired",
  /** Fechada pela rotina de manutenção por exceder o teto de duração. */
  "capped",
]);

/* ========================================================================== *
 * GAMIFICAÇÃO (Marco 2)
 * ========================================================================== */

export const xpActivityEnum = pgEnum("xp_activity", [
  "study_completed",
  "question_answered",
  "question_correct_bonus",
  "streak_day",
  "daily_goal_completed",
  "review_completed",
  "mission_completed",
  "achievement_unlocked",
  /** Ajuste manual da operação — sempre auditado. */
  "admin_adjustment",
]);

export const coinReasonEnum = pgEnum("coin_reason", [
  "earned_activity",
  "mission_reward",
  "achievement_reward",
  "store_redemption",
  "admin_adjustment",
]);

export const missionRecurrenceEnum = pgEnum("mission_recurrence", [
  "daily",
  "weekly",
]);

export const missionStatusEnum = pgEnum("mission_status", [
  "pending",
  "completed",
]);

export const redemptionStatusEnum = pgEnum("redemption_status", [
  "pending",
  "fulfilled",
  "canceled",
]);

/* ========================================================================== *
 * CONTEÚDO (Marco 2)
 * ========================================================================== */

export const contentTypeEnum = pgEnum("content_type", [
  "flashcard_deck",
  "mind_map",
  "video",
  "study_text",
  "pdf",
  "audio",
]);

export const contentStatusEnum = pgEnum("content_status", [
  "draft",
  "published",
  "archived",
]);

export const contentProgressStatusEnum = pgEnum("content_progress_status", [
  "not_started",
  "in_progress",
  "completed",
]);

/* ========================================================================== *
 * ENGAJAMENTO E OPERAÇÃO
 * ========================================================================== */

export const notificationTypeEnum = pgEnum("notification_type", [
  "daily_task_ready",
  "review_due",
  "streak_at_risk",
  "achievement_unlocked",
  "level_up",
  "plan_limit_reached",
  "subscription_issue",
  "system",
]);

export const supportTicketStatusEnum = pgEnum("support_ticket_status", [
  "open",
  "in_progress",
  "resolved",
  "closed",
]);

export const supportTicketCategoryEnum = pgEnum("support_ticket_category", [
  "bug",
  "content_error",
  "billing",
  "suggestion",
  "other",
]);

/**
 * Última etapa do funil alcançada por um usuário.
 * Responde diretamente a "onde abandonam (ponto exato do fluxo)" (README 2.6).
 * A ordem da lista é a ordem do funil — não reordene sem revisar as consultas.
 */
export const funnelStageEnum = pgEnum("funnel_stage", [
  "signed_up",
  "preparation_created",
  "edital_uploaded",
  "extraction_succeeded",
  "content_confirmed",
  "diagnosis_completed",
  "first_task_generated",
  "first_question_answered",
  "first_review_completed",
  "returned_next_day",
  "upgraded",
]);

export const adminAuditActionEnum = pgEnum("admin_audit_action", [
  "create",
  "update",
  "delete",
  "activate",
  "deactivate",
  "impersonate",
  "export",
]);
