CREATE TABLE "site_visits" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "site_visits_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"visitor_key" varchar(64) NOT NULL,
	"authenticated" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"page_count" integer DEFAULT 1 NOT NULL,
	"entry_path" varchar(300),
	"device_type" "device_type" DEFAULT 'unknown' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "site_visits_visitor_idx" ON "site_visits" USING btree ("visitor_key","last_seen_at");--> statement-breakpoint
CREATE INDEX "site_visits_started_idx" ON "site_visits" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "site_visits_last_seen_idx" ON "site_visits" USING btree ("last_seen_at");