ALTER TYPE "public"."engine_config_kind" ADD VALUE 'study_techniques';--> statement-breakpoint
DROP INDEX "daily_task_items_task_idx";--> statement-breakpoint
ALTER TABLE "daily_task_items" ADD COLUMN "block_index" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_task_items" ADD COLUMN "technique" "study_technique";--> statement-breakpoint
ALTER TABLE "daily_task_items" ADD COLUMN "content_item_id" uuid;--> statement-breakpoint
ALTER TABLE "daily_task_items" ADD COLUMN "closed_by_plan_limit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_task_items" ADD CONSTRAINT "daily_task_items_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_task_items_block_idx" ON "daily_task_items" USING btree ("daily_task_id","block_index","sort_order");--> statement-breakpoint
CREATE INDEX "daily_task_items_technique_idx" ON "daily_task_items" USING btree ("technique","completed_at");