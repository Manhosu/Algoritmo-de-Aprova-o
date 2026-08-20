CREATE TYPE "public"."admin_audit_action" AS ENUM('create', 'update', 'delete', 'activate', 'deactivate', 'impersonate', 'export');--> statement-breakpoint
CREATE TYPE "public"."attempt_source" AS ENUM('daily_task', 'question_bank', 'review');--> statement-breakpoint
CREATE TYPE "public"."billing_period" AS ENUM('monthly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."coin_reason" AS ENUM('earned_activity', 'mission_reward', 'achievement_reward', 'store_redemption', 'admin_adjustment');--> statement-breakpoint
CREATE TYPE "public"."consent_type" AS ENUM('terms', 'privacy', 'marketing');--> statement-breakpoint
CREATE TYPE "public"."content_access_level" AS ENUM('limited', 'extended', 'full');--> statement-breakpoint
CREATE TYPE "public"."content_origin" AS ENUM('ai', 'student', 'admin');--> statement-breakpoint
CREATE TYPE "public"."content_progress_status" AS ENUM('not_started', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('flashcard_deck', 'mind_map', 'video', 'study_text', 'pdf', 'audio');--> statement-breakpoint
CREATE TYPE "public"."coverage_status" AS ENUM('not_started', 'in_progress', 'studied', 'mastered');--> statement-breakpoint
CREATE TYPE "public"."daily_task_item_kind" AS ENUM('study', 'questions', 'reinforcement');--> statement-breakpoint
CREATE TYPE "public"."daily_task_status" AS ENUM('generated', 'in_progress', 'completed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."deletion_request_status" AS ENUM('pending', 'processing', 'completed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."device_type" AS ENUM('mobile', 'tablet', 'desktop', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."diagnostic_granularity" AS ENUM('subject', 'topic', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."diagnostic_status" AS ENUM('in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."document_source" AS ENUM('student_upload', 'admin_upload');--> statement-breakpoint
CREATE TYPE "public"."engine_config_kind" AS ENUM('daily_task_weights', 'xp_values', 'review_intervals', 'preparation_index', 'schedule_params');--> statement-breakpoint
CREATE TYPE "public"."extraction_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."funnel_stage" AS ENUM('signed_up', 'preparation_created', 'edital_uploaded', 'extraction_succeeded', 'content_confirmed', 'diagnosis_completed', 'first_task_generated', 'first_question_answered', 'first_review_completed', 'returned_next_day', 'upgraded');--> statement-breakpoint
CREATE TYPE "public"."import_batch_status" AS ENUM('processing', 'completed', 'completed_with_errors', 'failed');--> statement-breakpoint
CREATE TYPE "public"."legal_document_type" AS ENUM('terms', 'privacy');--> statement-breakpoint
CREATE TYPE "public"."mapping_queue_status" AS ENUM('pending', 'resolved', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."mastery_level" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."mission_recurrence" AS ENUM('daily', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."mission_status" AS ENUM('pending', 'completed');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('daily_task_ready', 'review_due', 'streak_at_risk', 'achievement_unlocked', 'level_up', 'plan_limit_reached', 'subscription_issue', 'system');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('pix', 'credit_card', 'boleto', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('mercadopago', 'manual');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'approved', 'rejected', 'refunded', 'charged_back', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."preparation_status" AS ENUM('draft', 'extracting', 'review_pending', 'diagnosis_pending', 'active', 'archived', 'failed');--> statement-breakpoint
CREATE TYPE "public"."question_difficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
CREATE TYPE "public"."question_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('multiple_choice', 'true_false');--> statement-breakpoint
CREATE TYPE "public"."redemption_status" AS ENUM('pending', 'fulfilled', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."review_occurrence_status" AS ENUM('scheduled', 'completed', 'skipped', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."review_schedule_status" AS ENUM('active', 'completed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."review_trigger" AS ENUM('study_completed', 'manual');--> statement-breakpoint
CREATE TYPE "public"."schedule_entry_source" AS ENUM('engine', 'student_moved');--> statement-breakpoint
CREATE TYPE "public"."schedule_entry_status" AS ENUM('planned', 'completed', 'missed', 'moved');--> statement-breakpoint
CREATE TYPE "public"."schedule_recalc_reason" AS ENUM('initial', 'question_answered', 'study_completed', 'review_completed', 'student_moved_item', 'content_changed', 'availability_changed', 'exam_date_changed', 'engine_config_changed', 'daily_rollover');--> statement-breakpoint
CREATE TYPE "public"."study_technique" AS ENUM('reading', 'video', 'flashcard', 'mind_map', 'questions', 'summary', 'audio', 'other');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'pending', 'past_due', 'canceled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_category" AS ENUM('bug', 'content_error', 'billing', 'suggestion', 'other');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_status" AS ENUM('open', 'in_progress', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."task_item_status" AS ENUM('pending', 'in_progress', 'completed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."topic_mapping_status" AS ENUM('mapped', 'manually_mapped', 'unmapped', 'ambiguous', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."usage_session_end_reason" AS ENUM('heartbeat_timeout', 'explicit_logout', 'tab_closed', 'auth_session_expired', 'capped');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('student', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'anonymized');--> statement-breakpoint
CREATE TYPE "public"."verification_token_type" AS ENUM('email_verification', 'password_reset', 'email_change');--> statement-breakpoint
CREATE TYPE "public"."weight_source" AS ENUM('edital', 'student', 'default', 'admin');--> statement-breakpoint
CREATE TYPE "public"."xp_activity" AS ENUM('study_completed', 'question_answered', 'question_correct_bonus', 'streak_day', 'daily_goal_completed', 'review_completed', 'mission_completed', 'achievement_unlocked', 'admin_adjustment');--> statement-breakpoint
CREATE TABLE "admin_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_email" varchar(255),
	"action" "admin_audit_action" NOT NULL,
	"entity_type" varchar(80) NOT NULL,
	"entity_id" varchar(80),
	"before" jsonb,
	"after" jsonb,
	"ip_hash" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_hash" varchar(64),
	"user_agent" text,
	"revoked_at" timestamp with time zone,
	"revoked_reason" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_throttle_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" varchar(255) NOT NULL,
	"scope" varchar(40) NOT NULL,
	"window_date" date NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "deletion_request_status" DEFAULT 'pending' NOT NULL,
	"reason" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"executed_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"execution_report" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_export_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "deletion_request_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"download_expires_at" timestamp with time zone,
	"storage_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "legal_document_type" NOT NULL,
	"version" varchar(20) NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text NOT NULL,
	"change_summary" text,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "consent_type" NOT NULL,
	"legal_document_id" uuid,
	"granted" boolean NOT NULL,
	"purpose" text NOT NULL,
	"ip_hash" varchar(64),
	"user_agent" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160),
	"email" varchar(255),
	"email_verified_at" timestamp with time zone,
	"whatsapp" varchar(20),
	"password_hash" text,
	"password_changed_at" timestamp with time zone,
	"role" "user_role" DEFAULT 'student' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"timezone" varchar(64) DEFAULT 'America/Sao_Paulo' NOT NULL,
	"avatar_url" text,
	"pseudonym_key" varchar(64),
	"last_seen_at" timestamp with time zone,
	"first_login_at" timestamp with time zone,
	"anonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_lowercase_check" CHECK ("users"."email" = lower("users"."email")),
	CONSTRAINT "users_whatsapp_e164_check" CHECK ("users"."whatsapp" is null or "users"."whatsapp" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "users_identity_required_check" CHECK ("users"."status" = 'anonymized' or (
        "users"."name" is not null
        and "users"."email" is not null
        and "users"."whatsapp" is not null
        and "users"."pseudonym_key" is not null
      )),
	CONSTRAINT "users_anonymized_scrubbed_check" CHECK ("users"."status" <> 'anonymized' or (
        "users"."name" is null
        and "users"."email" is null
        and "users"."whatsapp" is null
        and "users"."password_hash" is null
        and "users"."avatar_url" is null
        and "users"."pseudonym_key" is null
        and "users"."anonymized_at" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "verification_token_type" NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"new_email" varchar(255),
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"requested_ip_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "payment_provider" DEFAULT 'mercadopago' NOT NULL,
	"external_event_id" varchar(160) NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_error" text,
	"signature_valid" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid,
	"user_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'BRL' NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"method" "payment_method" DEFAULT 'other' NOT NULL,
	"provider" "payment_provider" DEFAULT 'mercadopago' NOT NULL,
	"external_payment_id" varchar(120),
	"paid_at" timestamp with time zone,
	"failure_reason" text,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_content_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"content_type" "content_type" NOT NULL,
	"access_level" "content_access_level" NOT NULL,
	"max_items" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_limits" (
	"plan_id" uuid PRIMARY KEY NOT NULL,
	"daily_question_limit" integer,
	"max_active_preparations" integer,
	"monthly_edital_upload_limit" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"billing_period" "billing_period" NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'BRL' NOT NULL,
	"discount_percent" integer,
	"external_plan_id" varchar(120),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(80) NOT NULL,
	"tagline" varchar(200),
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"plan_price_id" uuid,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"provider" "payment_provider" DEFAULT 'manual' NOT NULL,
	"billing_period" "billing_period",
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp with time zone,
	"cancel_reason" text,
	"ended_at" timestamp with time zone,
	"external_subscription_id" varchar(120),
	"external_customer_id" varchar(120),
	"failed_payment_count" integer DEFAULT 0 NOT NULL,
	"last_payment_failure_at" timestamp with time zone,
	"changed_by_user_id" uuid,
	"change_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canonical_subject_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"alias" varchar(300) NOT NULL,
	"normalized_alias" varchar(300) NOT NULL,
	"origin" "content_origin" DEFAULT 'admin' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canonical_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(180) NOT NULL,
	"normalized_name" varchar(180) NOT NULL,
	"description" text,
	"icon" varchar(40),
	"color_token" varchar(40),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "canonical_topic_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"alias" varchar(300) NOT NULL,
	"normalized_alias" varchar(300) NOT NULL,
	"origin" "content_origin" DEFAULT 'admin' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canonical_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" varchar(240) NOT NULL,
	"slug" varchar(260) NOT NULL,
	"normalized_name" varchar(260) NOT NULL,
	"path" text NOT NULL,
	"depth" smallint DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exam_boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"short_name" varchar(40) NOT NULL,
	"slug" varchar(60) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engine_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "engine_config_kind" NOT NULL,
	"version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"locked_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"change_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level_number" integer NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(60) NOT NULL,
	"emoji" varchar(8),
	"min_xp" integer NOT NULL,
	"max_xp" integer,
	"color_token" varchar(40),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diagnostic_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diagnostic_id" uuid NOT NULL,
	"preparation_id" uuid NOT NULL,
	"plan_subject_id" uuid,
	"plan_topic_id" uuid,
	"mastery_level" "mastery_level" NOT NULL,
	"applied_to_children" boolean DEFAULT false NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diagnostic_responses_target_check" CHECK (("diagnostic_responses"."plan_subject_id" is not null) or ("diagnostic_responses"."plan_topic_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "diagnostics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preparation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "diagnostic_status" DEFAULT 'in_progress' NOT NULL,
	"granularity" "diagnostic_granularity" DEFAULT 'subject' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"items_answered" integer DEFAULT 0 NOT NULL,
	"items_total" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diagnostics_completed_is_locked_check" CHECK ("diagnostics"."status" <> 'completed' or ("diagnostics"."completed_at" is not null and "diagnostics"."locked_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "edital_extractions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preparation_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"status" "extraction_status" DEFAULT 'queued' NOT NULL,
	"provider" varchar(40) DEFAULT 'anthropic' NOT NULL,
	"model" varchar(80),
	"prompt_version" varchar(40),
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"estimated_cost_cents" integer,
	"extracted_subject_count" integer,
	"extracted_topic_count" integer,
	"topics_with_weight_count" integer,
	"error_message" text,
	"attempt_number" smallint DEFAULT 1 NOT NULL,
	"raw_response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preparation_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preparation_id" uuid NOT NULL,
	"uploaded_by_user_id" uuid,
	"file_name" varchar(260) NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" varchar(100) DEFAULT 'application/pdf' NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"page_count" integer,
	"source" "document_source" DEFAULT 'student_upload' NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "preparation_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preparation_id" uuid NOT NULL,
	"metric_date" date NOT NULL,
	"coverage_percent" real,
	"accuracy_percent" real,
	"review_adherence_percent" real,
	"task_completion_percent" real,
	"preparation_index" real,
	"index_breakdown" jsonb,
	"engine_config_id" uuid,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preparations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_position" varchar(200) NOT NULL,
	"title" varchar(160),
	"institution" varchar(200),
	"exam_board_id" uuid,
	"exam_date" date,
	"exam_date_is_estimated" boolean DEFAULT false NOT NULL,
	"status" "preparation_status" DEFAULT 'draft' NOT NULL,
	"edital_uploaded_at" timestamp with time zone,
	"extraction_succeeded_at" timestamp with time zone,
	"content_confirmed_at" timestamp with time zone,
	"diagnosis_completed_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"is_current" boolean DEFAULT false NOT NULL,
	"locked_by_plan_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "preparations_locked_not_current_check" CHECK ("preparations"."locked_by_plan_at" is null or "preparations"."is_current" = false)
);
--> statement-breakpoint
CREATE TABLE "study_plan_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preparation_id" uuid NOT NULL,
	"canonical_subject_id" uuid,
	"raw_name" text NOT NULL,
	"display_name" varchar(200) NOT NULL,
	"normalized_name" varchar(200) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"origin" "content_origin" DEFAULT 'ai' NOT NULL,
	"mapping_status" "topic_mapping_status" DEFAULT 'unmapped' NOT NULL,
	"mapping_confidence" real,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "study_plan_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preparation_id" uuid NOT NULL,
	"plan_subject_id" uuid NOT NULL,
	"parent_id" uuid,
	"canonical_topic_id" uuid,
	"raw_name" text NOT NULL,
	"display_name" varchar(300) NOT NULL,
	"normalized_name" varchar(300) NOT NULL,
	"depth" smallint DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"weight" numeric(8, 3),
	"weight_source" "weight_source" DEFAULT 'default' NOT NULL,
	"question_count_in_exam" integer,
	"mapping_status" "topic_mapping_status" DEFAULT 'unmapped' NOT NULL,
	"mapping_confidence" real,
	"mapped_at" timestamp with time zone,
	"mapped_by_user_id" uuid,
	"origin" "content_origin" DEFAULT 'ai' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "study_plan_topics_weight_check" CHECK ("study_plan_topics"."weight" is null or "study_plan_topics"."weight" >= 0)
);
--> statement-breakpoint
CREATE TABLE "topic_mapping_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_name" text NOT NULL,
	"normalized_name" varchar(300) NOT NULL,
	"subject_hint" varchar(200),
	"suggested_topic_id" uuid,
	"suggested_confidence" real,
	"alternatives" jsonb,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"affected_user_count" integer DEFAULT 1 NOT NULL,
	"status" "mapping_queue_status" DEFAULT 'pending' NOT NULL,
	"resolved_topic_id" uuid,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preparation_id" uuid NOT NULL,
	"plan_topic_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"initial_mastery" "mastery_level",
	"initial_mastery_was_propagated" boolean DEFAULT false NOT NULL,
	"current_mastery_score" real DEFAULT 0.5 NOT NULL,
	"mastery_confidence" real DEFAULT 0 NOT NULL,
	"questions_answered" integer DEFAULT 0 NOT NULL,
	"questions_correct" integer DEFAULT 0 NOT NULL,
	"recent_accuracy" real,
	"study_sessions_count" integer DEFAULT 0 NOT NULL,
	"study_minutes_total" integer DEFAULT 0 NOT NULL,
	"reviews_completed" integer DEFAULT 0 NOT NULL,
	"last_studied_at" timestamp with time zone,
	"last_answered_at" timestamp with time zone,
	"last_reviewed_at" timestamp with time zone,
	"last_scheduled_at" timestamp with time zone,
	"coverage_status" "coverage_status" DEFAULT 'not_started' NOT NULL,
	"priority_score" real,
	"priority_computed_at" timestamp with time zone,
	"priority_breakdown" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"minutes_available" integer DEFAULT 0 NOT NULL,
	"preferred_start_time" varchar(5),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_availability_weekday_check" CHECK ("user_availability"."weekday" between 0 and 6),
	CONSTRAINT "user_availability_minutes_check" CHECK ("user_availability"."minutes_available" between 0 and 1440)
);
--> statement-breakpoint
CREATE TABLE "daily_task_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"daily_task_id" uuid NOT NULL,
	"preparation_id" uuid NOT NULL,
	"plan_topic_id" uuid NOT NULL,
	"kind" "daily_task_item_kind" NOT NULL,
	"status" "task_item_status" DEFAULT 'pending' NOT NULL,
	"target_question_count" integer,
	"target_minutes" integer,
	"answered_question_count" integer DEFAULT 0 NOT NULL,
	"priority_score" real NOT NULL,
	"priority_breakdown" jsonb NOT NULL,
	"reason_label" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preparation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"task_date" date NOT NULL,
	"status" "daily_task_status" DEFAULT 'generated' NOT NULL,
	"engine_config_id" uuid NOT NULL,
	"planned_minutes" integer DEFAULT 0 NOT NULL,
	"actual_minutes" integer DEFAULT 0 NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"anchored_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"items_total" integer DEFAULT 0 NOT NULL,
	"items_completed" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_schedule_id" uuid NOT NULL,
	"preparation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_topic_id" uuid NOT NULL,
	"stage_index" smallint NOT NULL,
	"interval_days" integer NOT NULL,
	"due_date" date NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" "review_occurrence_status" DEFAULT 'scheduled' NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_date" date,
	"is_late" boolean DEFAULT false NOT NULL,
	"days_late" integer DEFAULT 0 NOT NULL,
	"performance_rating" text,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preparation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_topic_id" uuid NOT NULL,
	"trigger" "review_trigger" DEFAULT 'study_completed' NOT NULL,
	"triggered_by_study_log_id" uuid,
	"status" "review_schedule_status" DEFAULT 'active' NOT NULL,
	"current_stage_index" smallint DEFAULT 0 NOT NULL,
	"total_stages" smallint NOT NULL,
	"engine_config_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preparation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_topic_id" uuid NOT NULL,
	"scheduled_date" date NOT NULL,
	"kind" "daily_task_item_kind" NOT NULL,
	"planned_minutes" integer DEFAULT 0 NOT NULL,
	"planned_question_count" integer,
	"status" "schedule_entry_status" DEFAULT 'planned' NOT NULL,
	"source" "schedule_entry_source" DEFAULT 'engine' NOT NULL,
	"moved_from_date" date,
	"moved_at" timestamp with time zone,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preparation_id" uuid NOT NULL,
	"reason" "schedule_recalc_reason" NOT NULL,
	"engine_config_id" uuid,
	"horizon_start" date NOT NULL,
	"horizon_end" date NOT NULL,
	"payload" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"compute_duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_question_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"usage_date" date NOT NULL,
	"questions_answered" integer DEFAULT 0 NOT NULL,
	"plan_id" uuid,
	"limit_at_time" integer,
	"limit_reached_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"preparation_id" uuid,
	"plan_topic_id" uuid,
	"source" "attempt_source" DEFAULT 'question_bank' NOT NULL,
	"daily_task_item_id" uuid,
	"review_occurrence_id" uuid,
	"selected_option_id" uuid,
	"is_correct" boolean NOT NULL,
	"time_spent_seconds" integer,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_date" date NOT NULL,
	"answered_hour" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_attempts_hour_check" CHECK ("question_attempts"."answered_hour" between 0 and 23)
);
--> statement-breakpoint
CREATE TABLE "question_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" varchar(260) NOT NULL,
	"uploaded_by_user_id" uuid,
	"status" "import_batch_status" DEFAULT 'processing' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"imported_rows" integer DEFAULT 0 NOT NULL,
	"skipped_rows" integer DEFAULT 0 NOT NULL,
	"failed_rows" integer DEFAULT 0 NOT NULL,
	"errors" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"label" varchar(4) NOT NULL,
	"content" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"explanation" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_board_id" uuid,
	"canonical_subject_id" uuid NOT NULL,
	"canonical_topic_id" uuid,
	"year" smallint,
	"institution" varchar(200),
	"position" varchar(200),
	"type" "question_type" DEFAULT 'multiple_choice' NOT NULL,
	"difficulty" "question_difficulty" DEFAULT 'medium' NOT NULL,
	"context_text" text,
	"statement" text NOT NULL,
	"explanation" text,
	"source_reference" text,
	"status" "question_status" DEFAULT 'draft' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"import_batch_id" uuid,
	"created_by_user_id" uuid,
	"content_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "topic_performance_stats" (
	"canonical_topic_id" uuid PRIMARY KEY NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"accuracy_percent" integer,
	"distinct_user_count" integer DEFAULT 0 NOT NULL,
	"last_computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_platform_rollups" (
	"rollup_date" date PRIMARY KEY NOT NULL,
	"new_users" integer DEFAULT 0 NOT NULL,
	"active_users" integer DEFAULT 0 NOT NULL,
	"preparations_created" integer DEFAULT 0 NOT NULL,
	"editais_uploaded" integer DEFAULT 0 NOT NULL,
	"diagnostics_completed" integer DEFAULT 0 NOT NULL,
	"questions_answered" integer DEFAULT 0 NOT NULL,
	"questions_correct" integer DEFAULT 0 NOT NULL,
	"study_minutes" integer DEFAULT 0 NOT NULL,
	"reviews_completed" integer DEFAULT 0 NOT NULL,
	"free_limit_hits" integer DEFAULT 0 NOT NULL,
	"upgrades" integer DEFAULT 0 NOT NULL,
	"cancellations" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_user_rollups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"rollup_date" date NOT NULL,
	"questions_answered" integer DEFAULT 0 NOT NULL,
	"questions_correct" integer DEFAULT 0 NOT NULL,
	"study_minutes" integer DEFAULT 0 NOT NULL,
	"study_sessions_count" integer DEFAULT 0 NOT NULL,
	"reviews_completed" integer DEFAULT 0 NOT NULL,
	"reviews_due" integer DEFAULT 0 NOT NULL,
	"active_seconds" integer DEFAULT 0 NOT NULL,
	"xp_earned" integer DEFAULT 0 NOT NULL,
	"coins_earned" integer DEFAULT 0 NOT NULL,
	"daily_task_completed" integer DEFAULT 0 NOT NULL,
	"daily_task_items_completed" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"preparation_id" uuid NOT NULL,
	"plan_topic_id" uuid NOT NULL,
	"daily_task_item_id" uuid,
	"technique" "study_technique",
	"minutes_spent" integer,
	"notes" text,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"auth_session_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"heartbeat_count" integer DEFAULT 0 NOT NULL,
	"started_date" date NOT NULL,
	"started_hour" smallint NOT NULL,
	"device_type" "device_type" DEFAULT 'unknown' NOT NULL,
	"user_agent" text,
	"ip_hash" varchar(64),
	"end_reason" "usage_session_end_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(60) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"icon" varchar(40),
	"criteria" jsonb NOT NULL,
	"xp_reward" integer DEFAULT 0 NOT NULL,
	"coin_reward" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coin_ledger" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "coin_ledger_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"reason" "coin_reason" NOT NULL,
	"amount" integer NOT NULL,
	"source_type" varchar(60),
	"source_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"occurred_date" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(60) NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"recurrence" "mission_recurrence" DEFAULT 'daily' NOT NULL,
	"target_type" varchar(60) NOT NULL,
	"target_value" integer NOT NULL,
	"xp_reward" integer DEFAULT 0 NOT NULL,
	"coin_reward" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(60) NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"image_url" text,
	"category" varchar(60),
	"cost_coins" integer NOT NULL,
	"stock" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"store_item_id" uuid NOT NULL,
	"cost_coins" integer NOT NULL,
	"status" "redemption_status" DEFAULT 'pending' NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fulfilled_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "streak_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"activity_date" date NOT NULL,
	"had_questions" boolean DEFAULT false NOT NULL,
	"had_study" boolean DEFAULT false NOT NULL,
	"had_review" boolean DEFAULT false NOT NULL,
	"xp_earned" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"achievement_id" uuid NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"target" integer,
	"unlocked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_daily_missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"mission_id" uuid NOT NULL,
	"mission_date" date NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"target_value" integer NOT NULL,
	"status" "mission_status" DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_gamification_states" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"total_xp" integer DEFAULT 0 NOT NULL,
	"current_level_id" uuid,
	"xp_to_next_level" integer,
	"coin_balance" integer DEFAULT 0 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_activity_date" date,
	"recomputed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xp_ledger" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "xp_ledger_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"activity" "xp_activity" NOT NULL,
	"amount" integer NOT NULL,
	"source_type" varchar(60),
	"source_id" uuid,
	"engine_config_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"occurred_date" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "content_type" NOT NULL,
	"title" varchar(240) NOT NULL,
	"description" text,
	"canonical_subject_id" uuid,
	"canonical_topic_id" uuid,
	"required_access_level" "content_access_level" DEFAULT 'limited' NOT NULL,
	"storage_path" text,
	"external_url" text,
	"thumbnail_url" text,
	"image_width" integer,
	"image_height" integer,
	"duration_seconds" integer,
	"file_size_bytes" integer,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "content_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content_item_id" uuid NOT NULL,
	"status" "content_progress_status" DEFAULT 'not_started' NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"last_position_seconds" integer,
	"last_accessed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flashcards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_item_id" uuid NOT NULL,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"hint" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trail_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trail_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"content_item_id" uuid,
	"canonical_topic_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"canonical_subject_id" uuid,
	"cover_url" text,
	"required_access_level" "content_access_level" DEFAULT 'limited' NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_trail_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"trail_id" uuid NOT NULL,
	"current_step_id" uuid,
	"steps_completed" integer DEFAULT 0 NOT NULL,
	"steps_total" integer DEFAULT 0 NOT NULL,
	"status" "content_progress_status" DEFAULT 'not_started' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text,
	"action_url" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category" "support_ticket_category" DEFAULT 'other' NOT NULL,
	"subject" varchar(200) NOT NULL,
	"message" text NOT NULL,
	"status" "support_ticket_status" DEFAULT 'open' NOT NULL,
	"context_path" varchar(300),
	"responded_at" timestamp with time zone,
	"responded_by_user_id" uuid,
	"response" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "analytics_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid,
	"pseudonym_key" varchar(64),
	"anonymous_id" varchar(64),
	"name" varchar(80) NOT NULL,
	"properties" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"occurred_date" date NOT NULL,
	"occurred_hour" smallint NOT NULL,
	"path" varchar(300),
	"referrer" text,
	"device_type" "device_type" DEFAULT 'unknown' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_events_hour_check" CHECK ("analytics_events"."occurred_hour" between 0 and 23)
);
--> statement-breakpoint
CREATE TABLE "feature_usage_rollups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rollup_date" date NOT NULL,
	"feature" varchar(60) NOT NULL,
	"unique_users" integer DEFAULT 0 NOT NULL,
	"interactions" integer DEFAULT 0 NOT NULL,
	"total_seconds" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" varchar(80) NOT NULL,
	"status" varchar(20) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"processed_count" integer,
	"error_message" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_funnel_progress" (
	"pseudonym_key" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"signed_up_at" timestamp with time zone NOT NULL,
	"first_login_at" timestamp with time zone,
	"preparation_created_at" timestamp with time zone,
	"edital_uploaded_at" timestamp with time zone,
	"extraction_succeeded_at" timestamp with time zone,
	"content_confirmed_at" timestamp with time zone,
	"diagnosis_completed_at" timestamp with time zone,
	"first_task_generated_at" timestamp with time zone,
	"first_question_answered_at" timestamp with time zone,
	"first_review_completed_at" timestamp with time zone,
	"returned_next_day_at" timestamp with time zone,
	"returned_week_two_at" timestamp with time zone,
	"last_active_date" date,
	"active_days_count" integer DEFAULT 0 NOT NULL,
	"completed_tasks_count" integer DEFAULT 0 NOT NULL,
	"free_limit_first_reached_at" timestamp with time zone,
	"free_limit_reach_count" integer DEFAULT 0 NOT NULL,
	"upgraded_at" timestamp with time zone,
	"upgraded_to_plan_id" uuid,
	"downgraded_at" timestamp with time zone,
	"churned_at" timestamp with time zone,
	"last_stage_reached" "funnel_stage" DEFAULT 'signed_up' NOT NULL,
	"last_stage_reached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_deletion_requests" ADD CONSTRAINT "data_deletion_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_legal_document_id_legal_documents_id_fk" FOREIGN KEY ("legal_document_id") REFERENCES "public"."legal_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_content_access" ADD CONSTRAINT "plan_content_access_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_limits" ADD CONSTRAINT "plan_limits_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_prices" ADD CONSTRAINT "plan_prices_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_price_id_plan_prices_id_fk" FOREIGN KEY ("plan_price_id") REFERENCES "public"."plan_prices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canonical_subject_aliases" ADD CONSTRAINT "canonical_subject_aliases_subject_id_canonical_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."canonical_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canonical_subject_aliases" ADD CONSTRAINT "canonical_subject_aliases_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canonical_topic_aliases" ADD CONSTRAINT "canonical_topic_aliases_topic_id_canonical_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."canonical_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canonical_topic_aliases" ADD CONSTRAINT "canonical_topic_aliases_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canonical_topics" ADD CONSTRAINT "canonical_topics_subject_id_canonical_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."canonical_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canonical_topics" ADD CONSTRAINT "canonical_topics_parent_id_canonical_topics_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."canonical_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_configs" ADD CONSTRAINT "engine_configs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_responses" ADD CONSTRAINT "diagnostic_responses_diagnostic_id_diagnostics_id_fk" FOREIGN KEY ("diagnostic_id") REFERENCES "public"."diagnostics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_responses" ADD CONSTRAINT "diagnostic_responses_preparation_id_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."preparations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_responses" ADD CONSTRAINT "diagnostic_responses_plan_subject_id_study_plan_subjects_id_fk" FOREIGN KEY ("plan_subject_id") REFERENCES "public"."study_plan_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_responses" ADD CONSTRAINT "diagnostic_responses_plan_topic_id_study_plan_topics_id_fk" FOREIGN KEY ("plan_topic_id") REFERENCES "public"."study_plan_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostics" ADD CONSTRAINT "diagnostics_preparation_id_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."preparations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostics" ADD CONSTRAINT "diagnostics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edital_extractions" ADD CONSTRAINT "edital_extractions_preparation_id_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."preparations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edital_extractions" ADD CONSTRAINT "edital_extractions_document_id_preparation_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."preparation_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparation_documents" ADD CONSTRAINT "preparation_documents_preparation_id_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."preparations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparation_documents" ADD CONSTRAINT "preparation_documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparation_metrics" ADD CONSTRAINT "preparation_metrics_preparation_id_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."preparations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparation_metrics" ADD CONSTRAINT "preparation_metrics_engine_config_id_engine_configs_id_fk" FOREIGN KEY ("engine_config_id") REFERENCES "public"."engine_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparations" ADD CONSTRAINT "preparations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparations" ADD CONSTRAINT "preparations_exam_board_id_exam_boards_id_fk" FOREIGN KEY ("exam_board_id") REFERENCES "public"."exam_boards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plan_subjects" ADD CONSTRAINT "study_plan_subjects_preparation_id_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."preparations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plan_subjects" ADD CONSTRAINT "study_plan_subjects_canonical_subject_id_canonical_subjects_id_fk" FOREIGN KEY ("canonical_subject_id") REFERENCES "public"."canonical_subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plan_topics" ADD CONSTRAINT "study_plan_topics_preparation_id_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."preparations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plan_topics" ADD CONSTRAINT "study_plan_topics_plan_subject_id_study_plan_subjects_id_fk" FOREIGN KEY ("plan_subject_id") REFERENCES "public"."study_plan_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plan_topics" ADD CONSTRAINT "study_plan_topics_parent_id_study_plan_topics_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."study_plan_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plan_topics" ADD CONSTRAINT "study_plan_topics_canonical_topic_id_canonical_topics_id_fk" FOREIGN KEY ("canonical_topic_id") REFERENCES "public"."canonical_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plan_topics" ADD CONSTRAINT "study_plan_topics_mapped_by_user_id_users_id_fk" FOREIGN KEY ("mapped_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_mapping_queue" ADD CONSTRAINT "topic_mapping_queue_suggested_topic_id_canonical_topics_id_fk" FOREIGN KEY ("suggested_topic_id") REFERENCES "public"."canonical_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_mapping_queue" ADD CONSTRAINT "topic_mapping_queue_resolved_topic_id_canonical_topics_id_fk" FOREIGN KEY ("resolved_topic_id") REFERENCES "public"."canonical_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_mapping_queue" ADD CONSTRAINT "topic_mapping_queue_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_states" ADD CONSTRAINT "topic_states_preparation_id_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."preparations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_states" ADD CONSTRAINT "topic_states_plan_topic_id_study_plan_topics_id_fk" FOREIGN KEY ("plan_topic_id") REFERENCES "public"."study_plan_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_states" ADD CONSTRAINT "topic_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_availability" ADD CONSTRAINT "user_availability_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_task_items" ADD CONSTRAINT "daily_task_items_daily_task_id_daily_tasks_id_fk" FOREIGN KEY ("daily_task_id") REFERENCES "public"."daily_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_task_items" ADD CONSTRAINT "daily_task_items_preparation_id_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."preparations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_task_items" ADD CONSTRAINT "daily_task_items_plan_topic_id_study_plan_topics_id_fk" FOREIGN KEY ("plan_topic_id") REFERENCES "public"."study_plan_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_preparation_id_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."preparations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_engine_config_id_engine_configs_id_fk" FOREIGN KEY ("engine_config_id") REFERENCES "public"."engine_configs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_occurrences" ADD CONSTRAINT "review_occurrences_review_schedule_id_review_schedules_id_fk" FOREIGN KEY ("review_schedule_id") REFERENCES "public"."review_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_occurrences" ADD CONSTRAINT "review_occurrences_preparation_id_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."preparations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_occurrences" ADD CONSTRAINT "review_occurrences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_occurrences" ADD CONSTRAINT "review_occurrences_plan_topic_id_study_plan_topics_id_fk" FOREIGN KEY ("plan_topic_id") REFERENCES "public"."study_plan_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_schedules" ADD CONSTRAINT "review_schedules_preparation_id_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."preparations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_schedules" ADD CONSTRAINT "review_schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_schedules" ADD CONSTRAINT "review_schedules_plan_topic_id_study_plan_topics_id_fk" FOREIGN KEY ("plan_topic_id") REFERENCES "public"."study_plan_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_schedules" ADD CONSTRAINT "review_schedules_triggered_by_study_log_id_study_logs_id_fk" FOREIGN KEY ("triggered_by_study_log_id") REFERENCES "public"."study_logs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_schedules" ADD CONSTRAINT "review_schedules_engine_config_id_engine_configs_id_fk" FOREIGN KEY ("engine_config_id") REFERENCES "public"."engine_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_preparation_id_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."preparations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_plan_topic_id_study_plan_topics_id_fk" FOREIGN KEY ("plan_topic_id") REFERENCES "public"."study_plan_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_snapshots" ADD CONSTRAINT "schedule_snapshots_preparation_id_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."preparations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_snapshots" ADD CONSTRAINT "schedule_snapshots_engine_config_id_engine_configs_id_fk" FOREIGN KEY ("engine_config_id") REFERENCES "public"."engine_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_question_usage" ADD CONSTRAINT "daily_question_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_question_usage" ADD CONSTRAINT "daily_question_usage_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_preparation_id_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."preparations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_plan_topic_id_study_plan_topics_id_fk" FOREIGN KEY ("plan_topic_id") REFERENCES "public"."study_plan_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_daily_task_item_id_daily_task_items_id_fk" FOREIGN KEY ("daily_task_item_id") REFERENCES "public"."daily_task_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_review_occurrence_id_review_occurrences_id_fk" FOREIGN KEY ("review_occurrence_id") REFERENCES "public"."review_occurrences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_selected_option_id_question_options_id_fk" FOREIGN KEY ("selected_option_id") REFERENCES "public"."question_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_import_batches" ADD CONSTRAINT "question_import_batches_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_exam_board_id_exam_boards_id_fk" FOREIGN KEY ("exam_board_id") REFERENCES "public"."exam_boards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_canonical_subject_id_canonical_subjects_id_fk" FOREIGN KEY ("canonical_subject_id") REFERENCES "public"."canonical_subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_canonical_topic_id_canonical_topics_id_fk" FOREIGN KEY ("canonical_topic_id") REFERENCES "public"."canonical_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_import_batch_id_question_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."question_import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_performance_stats" ADD CONSTRAINT "topic_performance_stats_canonical_topic_id_canonical_topics_id_fk" FOREIGN KEY ("canonical_topic_id") REFERENCES "public"."canonical_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_user_rollups" ADD CONSTRAINT "daily_user_rollups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_logs" ADD CONSTRAINT "study_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_logs" ADD CONSTRAINT "study_logs_preparation_id_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."preparations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_logs" ADD CONSTRAINT "study_logs_plan_topic_id_study_plan_topics_id_fk" FOREIGN KEY ("plan_topic_id") REFERENCES "public"."study_plan_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_logs" ADD CONSTRAINT "study_logs_daily_task_item_id_daily_task_items_id_fk" FOREIGN KEY ("daily_task_item_id") REFERENCES "public"."daily_task_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_sessions" ADD CONSTRAINT "usage_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coin_ledger" ADD CONSTRAINT "coin_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_redemptions" ADD CONSTRAINT "store_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_redemptions" ADD CONSTRAINT "store_redemptions_store_item_id_store_items_id_fk" FOREIGN KEY ("store_item_id") REFERENCES "public"."store_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streak_days" ADD CONSTRAINT "streak_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_daily_missions" ADD CONSTRAINT "user_daily_missions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_daily_missions" ADD CONSTRAINT "user_daily_missions_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_gamification_states" ADD CONSTRAINT "user_gamification_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_gamification_states" ADD CONSTRAINT "user_gamification_states_current_level_id_levels_id_fk" FOREIGN KEY ("current_level_id") REFERENCES "public"."levels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_engine_config_id_engine_configs_id_fk" FOREIGN KEY ("engine_config_id") REFERENCES "public"."engine_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_canonical_subject_id_canonical_subjects_id_fk" FOREIGN KEY ("canonical_subject_id") REFERENCES "public"."canonical_subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_canonical_topic_id_canonical_topics_id_fk" FOREIGN KEY ("canonical_topic_id") REFERENCES "public"."canonical_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_progress" ADD CONSTRAINT "content_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_progress" ADD CONSTRAINT "content_progress_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trail_steps" ADD CONSTRAINT "trail_steps_trail_id_trails_id_fk" FOREIGN KEY ("trail_id") REFERENCES "public"."trails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trail_steps" ADD CONSTRAINT "trail_steps_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trail_steps" ADD CONSTRAINT "trail_steps_canonical_topic_id_canonical_topics_id_fk" FOREIGN KEY ("canonical_topic_id") REFERENCES "public"."canonical_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trails" ADD CONSTRAINT "trails_canonical_subject_id_canonical_subjects_id_fk" FOREIGN KEY ("canonical_subject_id") REFERENCES "public"."canonical_subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_trail_progress" ADD CONSTRAINT "user_trail_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_trail_progress" ADD CONSTRAINT "user_trail_progress_trail_id_trails_id_fk" FOREIGN KEY ("trail_id") REFERENCES "public"."trails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_trail_progress" ADD CONSTRAINT "user_trail_progress_current_step_id_trail_steps_id_fk" FOREIGN KEY ("current_step_id") REFERENCES "public"."trail_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_responded_by_user_id_users_id_fk" FOREIGN KEY ("responded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_funnel_progress" ADD CONSTRAINT "user_funnel_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_funnel_progress" ADD CONSTRAINT "user_funnel_progress_upgraded_to_plan_id_plans_id_fk" FOREIGN KEY ("upgraded_to_plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_logs_actor_idx" ON "admin_audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_entity_idx" ON "admin_audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_hash_unique" ON "auth_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_throttle_unique" ON "auth_throttle_counters" USING btree ("subject","scope","window_date");--> statement-breakpoint
CREATE INDEX "auth_throttle_locked_idx" ON "auth_throttle_counters" USING btree ("locked_until");--> statement-breakpoint
CREATE INDEX "data_deletion_requests_status_idx" ON "data_deletion_requests" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "data_deletion_requests_user_idx" ON "data_deletion_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "data_export_requests_user_idx" ON "data_export_requests" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_documents_type_version_unique" ON "legal_documents" USING btree ("type","version");--> statement-breakpoint
CREATE INDEX "legal_documents_current_idx" ON "legal_documents" USING btree ("type","is_current");--> statement-breakpoint
CREATE INDEX "user_consents_user_type_idx" ON "user_consents" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "user_consents_granted_at_idx" ON "user_consents" USING btree ("granted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_pseudonym_key_unique" ON "users" USING btree ("pseudonym_key");--> statement-breakpoint
CREATE INDEX "users_role_status_idx" ON "users" USING btree ("role","status");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_tokens_hash_unique" ON "verification_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "verification_tokens_user_type_idx" ON "verification_tokens" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "verification_tokens_expires_idx" ON "verification_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_webhook_events_external_unique" ON "payment_webhook_events" USING btree ("provider","external_event_id");--> statement-breakpoint
CREATE INDEX "payment_webhook_events_unprocessed_idx" ON "payment_webhook_events" USING btree ("processed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_external_id_unique" ON "payments" USING btree ("external_payment_id");--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "payments" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_subscription_idx" ON "payments" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_content_access_unique" ON "plan_content_access" USING btree ("plan_id","content_type");--> statement-breakpoint
CREATE INDEX "plan_prices_plan_idx" ON "plan_prices" USING btree ("plan_id","billing_period","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_code_unique" ON "plans" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_one_active_per_user" ON "subscriptions" USING btree ("user_id") WHERE "subscriptions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "subscriptions_plan_idx" ON "subscriptions" USING btree ("plan_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_external_id_unique" ON "subscriptions" USING btree ("external_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "canonical_subject_aliases_normalized_unique" ON "canonical_subject_aliases" USING btree ("normalized_alias");--> statement-breakpoint
CREATE INDEX "canonical_subject_aliases_subject_idx" ON "canonical_subject_aliases" USING btree ("subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "canonical_subjects_slug_unique" ON "canonical_subjects" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "canonical_subjects_normalized_idx" ON "canonical_subjects" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "canonical_topic_aliases_normalized_unique" ON "canonical_topic_aliases" USING btree ("normalized_alias");--> statement-breakpoint
CREATE INDEX "canonical_topic_aliases_topic_idx" ON "canonical_topic_aliases" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "canonical_topics_slug_unique" ON "canonical_topics" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "canonical_topics_subject_idx" ON "canonical_topics" USING btree ("subject_id","sort_order");--> statement-breakpoint
CREATE INDEX "canonical_topics_parent_idx" ON "canonical_topics" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "canonical_topics_path_idx" ON "canonical_topics" USING btree ("path");--> statement-breakpoint
CREATE INDEX "canonical_topics_normalized_idx" ON "canonical_topics" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_boards_slug_unique" ON "exam_boards" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "exam_boards_active_idx" ON "exam_boards" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "engine_configs_kind_version_unique" ON "engine_configs" USING btree ("kind","version");--> statement-breakpoint
CREATE UNIQUE INDEX "engine_configs_one_active_per_kind" ON "engine_configs" USING btree ("kind") WHERE "engine_configs"."is_active" = true;--> statement-breakpoint
CREATE INDEX "engine_configs_kind_idx" ON "engine_configs" USING btree ("kind","version");--> statement-breakpoint
CREATE UNIQUE INDEX "levels_number_unique" ON "levels" USING btree ("level_number");--> statement-breakpoint
CREATE UNIQUE INDEX "levels_code_unique" ON "levels" USING btree ("code");--> statement-breakpoint
CREATE INDEX "levels_min_xp_idx" ON "levels" USING btree ("min_xp");--> statement-breakpoint
CREATE INDEX "diagnostic_responses_diagnostic_idx" ON "diagnostic_responses" USING btree ("diagnostic_id");--> statement-breakpoint
CREATE INDEX "diagnostic_responses_topic_idx" ON "diagnostic_responses" USING btree ("plan_topic_id");--> statement-breakpoint
CREATE INDEX "diagnostic_responses_subject_idx" ON "diagnostic_responses" USING btree ("plan_subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "diagnostics_preparation_unique" ON "diagnostics" USING btree ("preparation_id");--> statement-breakpoint
CREATE INDEX "diagnostics_user_idx" ON "diagnostics" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "edital_extractions_preparation_idx" ON "edital_extractions" USING btree ("preparation_id","status");--> statement-breakpoint
CREATE INDEX "edital_extractions_status_idx" ON "edital_extractions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "preparation_documents_preparation_idx" ON "preparation_documents" USING btree ("preparation_id");--> statement-breakpoint
CREATE INDEX "preparation_documents_checksum_idx" ON "preparation_documents" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "preparation_documents_uploaded_at_idx" ON "preparation_documents" USING btree ("uploaded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "preparation_metrics_unique" ON "preparation_metrics" USING btree ("preparation_id","metric_date");--> statement-breakpoint
CREATE INDEX "preparation_metrics_date_idx" ON "preparation_metrics" USING btree ("metric_date");--> statement-breakpoint
CREATE INDEX "preparations_user_idx" ON "preparations" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "preparations_status_idx" ON "preparations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "preparations_exam_date_idx" ON "preparations" USING btree ("exam_date");--> statement-breakpoint
CREATE INDEX "preparations_locked_idx" ON "preparations" USING btree ("user_id","locked_by_plan_at");--> statement-breakpoint
CREATE UNIQUE INDEX "preparations_one_current_per_user" ON "preparations" USING btree ("user_id") WHERE "preparations"."is_current" = true;--> statement-breakpoint
CREATE INDEX "study_plan_subjects_preparation_idx" ON "study_plan_subjects" USING btree ("preparation_id","sort_order");--> statement-breakpoint
CREATE INDEX "study_plan_subjects_canonical_idx" ON "study_plan_subjects" USING btree ("canonical_subject_id");--> statement-breakpoint
CREATE INDEX "study_plan_subjects_mapping_idx" ON "study_plan_subjects" USING btree ("mapping_status");--> statement-breakpoint
CREATE INDEX "study_plan_topics_preparation_idx" ON "study_plan_topics" USING btree ("preparation_id","sort_order");--> statement-breakpoint
CREATE INDEX "study_plan_topics_subject_idx" ON "study_plan_topics" USING btree ("plan_subject_id","sort_order");--> statement-breakpoint
CREATE INDEX "study_plan_topics_parent_idx" ON "study_plan_topics" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "study_plan_topics_canonical_idx" ON "study_plan_topics" USING btree ("canonical_topic_id");--> statement-breakpoint
CREATE INDEX "study_plan_topics_mapping_idx" ON "study_plan_topics" USING btree ("mapping_status","preparation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "topic_mapping_queue_normalized_unique" ON "topic_mapping_queue" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "topic_mapping_queue_status_idx" ON "topic_mapping_queue" USING btree ("status","occurrences");--> statement-breakpoint
CREATE UNIQUE INDEX "topic_states_topic_unique" ON "topic_states" USING btree ("plan_topic_id");--> statement-breakpoint
CREATE INDEX "topic_states_priority_idx" ON "topic_states" USING btree ("preparation_id","priority_score");--> statement-breakpoint
CREATE INDEX "topic_states_user_idx" ON "topic_states" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "topic_states_coverage_idx" ON "topic_states" USING btree ("preparation_id","coverage_status");--> statement-breakpoint
CREATE UNIQUE INDEX "user_availability_unique" ON "user_availability" USING btree ("user_id","weekday");--> statement-breakpoint
CREATE INDEX "daily_task_items_task_idx" ON "daily_task_items" USING btree ("daily_task_id","sort_order");--> statement-breakpoint
CREATE INDEX "daily_task_items_topic_idx" ON "daily_task_items" USING btree ("plan_topic_id");--> statement-breakpoint
CREATE INDEX "daily_task_items_status_idx" ON "daily_task_items" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_tasks_preparation_date_unique" ON "daily_tasks" USING btree ("preparation_id","task_date");--> statement-breakpoint
CREATE INDEX "daily_tasks_user_date_idx" ON "daily_tasks" USING btree ("user_id","task_date");--> statement-breakpoint
CREATE INDEX "daily_tasks_status_idx" ON "daily_tasks" USING btree ("status","task_date");--> statement-breakpoint
CREATE UNIQUE INDEX "review_occurrences_stage_unique" ON "review_occurrences" USING btree ("review_schedule_id","stage_index");--> statement-breakpoint
CREATE INDEX "review_occurrences_due_idx" ON "review_occurrences" USING btree ("user_id","status","due_date");--> statement-breakpoint
CREATE INDEX "review_occurrences_preparation_idx" ON "review_occurrences" USING btree ("preparation_id","due_date");--> statement-breakpoint
CREATE INDEX "review_occurrences_topic_idx" ON "review_occurrences" USING btree ("plan_topic_id");--> statement-breakpoint
CREATE INDEX "review_occurrences_completed_idx" ON "review_occurrences" USING btree ("user_id","completed_date");--> statement-breakpoint
CREATE INDEX "review_schedules_user_idx" ON "review_schedules" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "review_schedules_topic_idx" ON "review_schedules" USING btree ("plan_topic_id","status");--> statement-breakpoint
CREATE INDEX "review_schedules_preparation_idx" ON "review_schedules" USING btree ("preparation_id","status");--> statement-breakpoint
CREATE INDEX "schedule_entries_preparation_date_idx" ON "schedule_entries" USING btree ("preparation_id","scheduled_date");--> statement-breakpoint
CREATE INDEX "schedule_entries_user_date_idx" ON "schedule_entries" USING btree ("user_id","scheduled_date");--> statement-breakpoint
CREATE INDEX "schedule_entries_topic_idx" ON "schedule_entries" USING btree ("plan_topic_id");--> statement-breakpoint
CREATE INDEX "schedule_entries_status_idx" ON "schedule_entries" USING btree ("status","scheduled_date");--> statement-breakpoint
CREATE INDEX "schedule_snapshots_preparation_idx" ON "schedule_snapshots" USING btree ("preparation_id","generated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_snapshots_current_unique" ON "schedule_snapshots" USING btree ("preparation_id") WHERE "schedule_snapshots"."superseded_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_question_usage_unique" ON "daily_question_usage" USING btree ("user_id","usage_date");--> statement-breakpoint
CREATE INDEX "daily_question_usage_limit_idx" ON "daily_question_usage" USING btree ("usage_date","limit_reached_at");--> statement-breakpoint
CREATE INDEX "question_attempts_user_date_idx" ON "question_attempts" USING btree ("user_id","answered_date");--> statement-breakpoint
CREATE INDEX "question_attempts_user_hour_idx" ON "question_attempts" USING btree ("user_id","answered_hour");--> statement-breakpoint
CREATE INDEX "question_attempts_topic_idx" ON "question_attempts" USING btree ("plan_topic_id","answered_at");--> statement-breakpoint
CREATE INDEX "question_attempts_preparation_idx" ON "question_attempts" USING btree ("preparation_id","answered_date");--> statement-breakpoint
CREATE INDEX "question_attempts_question_idx" ON "question_attempts" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "question_import_batches_status_idx" ON "question_import_batches" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "question_options_label_unique" ON "question_options" USING btree ("question_id","label");--> statement-breakpoint
CREATE INDEX "question_options_question_idx" ON "question_options" USING btree ("question_id","sort_order");--> statement-breakpoint
CREATE INDEX "questions_filter_idx" ON "questions" USING btree ("status","canonical_subject_id","canonical_topic_id","difficulty");--> statement-breakpoint
CREATE INDEX "questions_board_idx" ON "questions" USING btree ("exam_board_id","status");--> statement-breakpoint
CREATE INDEX "questions_topic_idx" ON "questions" USING btree ("canonical_topic_id","status");--> statement-breakpoint
CREATE INDEX "questions_batch_idx" ON "questions" USING btree ("import_batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "questions_content_hash_unique" ON "questions" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "topic_performance_stats_accuracy_idx" ON "topic_performance_stats" USING btree ("accuracy_percent");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_user_rollups_unique" ON "daily_user_rollups" USING btree ("user_id","rollup_date");--> statement-breakpoint
CREATE INDEX "daily_user_rollups_date_idx" ON "daily_user_rollups" USING btree ("rollup_date");--> statement-breakpoint
CREATE INDEX "study_logs_user_date_idx" ON "study_logs" USING btree ("user_id","completed_date");--> statement-breakpoint
CREATE INDEX "study_logs_topic_idx" ON "study_logs" USING btree ("plan_topic_id","completed_at");--> statement-breakpoint
CREATE INDEX "study_logs_preparation_idx" ON "study_logs" USING btree ("preparation_id","completed_date");--> statement-breakpoint
CREATE INDEX "usage_sessions_user_date_idx" ON "usage_sessions" USING btree ("user_id","started_date");--> statement-breakpoint
CREATE INDEX "usage_sessions_open_idx" ON "usage_sessions" USING btree ("ended_at","last_heartbeat_at");--> statement-breakpoint
CREATE UNIQUE INDEX "achievements_code_unique" ON "achievements" USING btree ("code");--> statement-breakpoint
CREATE INDEX "coin_ledger_user_idx" ON "coin_ledger" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "missions_code_unique" ON "missions" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "store_items_code_unique" ON "store_items" USING btree ("code");--> statement-breakpoint
CREATE INDEX "store_redemptions_user_idx" ON "store_redemptions" USING btree ("user_id","redeemed_at");--> statement-breakpoint
CREATE INDEX "store_redemptions_status_idx" ON "store_redemptions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "streak_days_unique" ON "streak_days" USING btree ("user_id","activity_date");--> statement-breakpoint
CREATE INDEX "streak_days_date_idx" ON "streak_days" USING btree ("activity_date");--> statement-breakpoint
CREATE UNIQUE INDEX "user_achievements_unique" ON "user_achievements" USING btree ("user_id","achievement_id");--> statement-breakpoint
CREATE INDEX "user_achievements_unlocked_idx" ON "user_achievements" USING btree ("user_id","unlocked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_daily_missions_unique" ON "user_daily_missions" USING btree ("user_id","mission_date","mission_id");--> statement-breakpoint
CREATE INDEX "user_daily_missions_date_idx" ON "user_daily_missions" USING btree ("user_id","mission_date");--> statement-breakpoint
CREATE INDEX "user_gamification_states_xp_idx" ON "user_gamification_states" USING btree ("total_xp");--> statement-breakpoint
CREATE INDEX "xp_ledger_user_date_idx" ON "xp_ledger" USING btree ("user_id","occurred_date");--> statement-breakpoint
CREATE INDEX "xp_ledger_user_occurred_idx" ON "xp_ledger" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "xp_ledger_source_unique" ON "xp_ledger" USING btree ("user_id","activity","source_type","source_id");--> statement-breakpoint
CREATE INDEX "content_items_filter_idx" ON "content_items" USING btree ("type","status","canonical_subject_id","canonical_topic_id");--> statement-breakpoint
CREATE INDEX "content_items_topic_idx" ON "content_items" USING btree ("canonical_topic_id");--> statement-breakpoint
CREATE INDEX "content_items_access_idx" ON "content_items" USING btree ("required_access_level","status");--> statement-breakpoint
CREATE UNIQUE INDEX "content_progress_unique" ON "content_progress" USING btree ("user_id","content_item_id");--> statement-breakpoint
CREATE INDEX "content_progress_user_idx" ON "content_progress" USING btree ("user_id","last_accessed_at");--> statement-breakpoint
CREATE INDEX "flashcards_deck_idx" ON "flashcards" USING btree ("content_item_id","sort_order");--> statement-breakpoint
CREATE INDEX "trail_steps_trail_idx" ON "trail_steps" USING btree ("trail_id","sort_order");--> statement-breakpoint
CREATE INDEX "trails_status_idx" ON "trails" USING btree ("status","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "user_trail_progress_unique" ON "user_trail_progress" USING btree ("user_id","trail_id");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_status_idx" ON "support_tickets" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_user_idx" ON "support_tickets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "analytics_events_name_date_idx" ON "analytics_events" USING btree ("name","occurred_date");--> statement-breakpoint
CREATE INDEX "analytics_events_user_idx" ON "analytics_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_pseudonym_idx" ON "analytics_events" USING btree ("pseudonym_key","occurred_date");--> statement-breakpoint
CREATE INDEX "analytics_events_anonymous_idx" ON "analytics_events" USING btree ("anonymous_id");--> statement-breakpoint
CREATE INDEX "feature_usage_rollups_date_idx" ON "feature_usage_rollups" USING btree ("rollup_date","feature");--> statement-breakpoint
CREATE INDEX "job_runs_name_idx" ON "job_runs" USING btree ("job_name","started_at");--> statement-breakpoint
CREATE INDEX "user_funnel_progress_stage_idx" ON "user_funnel_progress" USING btree ("last_stage_reached","last_stage_reached_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_funnel_progress_user_unique" ON "user_funnel_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_funnel_progress_signup_idx" ON "user_funnel_progress" USING btree ("signed_up_at");--> statement-breakpoint
CREATE INDEX "user_funnel_progress_last_active_idx" ON "user_funnel_progress" USING btree ("last_active_date");