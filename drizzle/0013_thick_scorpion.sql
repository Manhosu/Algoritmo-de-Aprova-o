CREATE TABLE "plan_promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"billing_period" "billing_period" NOT NULL,
	"amount_cents" integer NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"created_by_user_id" uuid,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_promotions_amount_positive" CHECK ("plan_promotions"."amount_cents" > 0),
	CONSTRAINT "plan_promotions_dates_ordered" CHECK ("plan_promotions"."ends_on" >= "plan_promotions"."starts_on")
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "promotion_id" uuid;--> statement-breakpoint
ALTER TABLE "plan_promotions" ADD CONSTRAINT "plan_promotions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_promotions" ADD CONSTRAINT "plan_promotions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_promotions_plan_idx" ON "plan_promotions" USING btree ("plan_id","billing_period","starts_on");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_promotion_id_plan_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."plan_promotions"("id") ON DELETE set null ON UPDATE no action;