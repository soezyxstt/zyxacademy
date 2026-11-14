CREATE TABLE "gamification_badge_activities" (
	"user_id" text NOT NULL,
	"family" text NOT NULL,
	"identity" text NOT NULL,
	CONSTRAINT "gamification_badge_activities_user_id_family_identity_pk" PRIMARY KEY("user_id","family","identity")
);
--> statement-breakpoint
CREATE TABLE "gamification_daily_rank_snapshots" (
	"user_id" text NOT NULL,
	"day_key" text NOT NULL,
	"rank_key" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gamification_daily_rank_snapshots_user_id_day_key_pk" PRIMARY KEY("user_id","day_key")
);
--> statement-breakpoint
CREATE TABLE "gamification_eligible_recalls" (
	"source_evidence_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"checklist_item_id" text NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	"previous_due_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gamification_explanation_completions_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"collection_id" text NOT NULL,
	"collection_version" bigint NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"item_ids" jsonb NOT NULL,
	CONSTRAINT "gamification_explanation_v2_identity" UNIQUE("user_id","collection_id","collection_version")
);
--> statement-breakpoint
CREATE TABLE "gamification_learning_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"course_id" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"source_version" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"attempt_id" text,
	"correct" boolean,
	"last_reveal_attempt_id" text,
	"last_reveal_at" timestamp with time zone,
	"adapter" text,
	"grade" bigint,
	"previous_due_at" timestamp with time zone,
	CONSTRAINT "gamification_learning_facts_kind_check" CHECK (("gamification_learning_facts"."source" = 'question' and "gamification_learning_facts"."attempt_id" is not null and "gamification_learning_facts"."correct" is not null and (("gamification_learning_facts"."last_reveal_attempt_id" is null and "gamification_learning_facts"."last_reveal_at" is null) or ("gamification_learning_facts"."last_reveal_attempt_id" is not null and "gamification_learning_facts"."last_reveal_at" is not null)) and "gamification_learning_facts"."grade" is null and "gamification_learning_facts"."previous_due_at" is null and "gamification_learning_facts"."adapter" is null) or ("gamification_learning_facts"."source" = 'flashcard' and "gamification_learning_facts"."grade" is not null and "gamification_learning_facts"."grade" between 0 and 4 and "gamification_learning_facts"."previous_due_at" is not null and "gamification_learning_facts"."adapter" in ('canonical', 'legacy') and "gamification_learning_facts"."attempt_id" is null and "gamification_learning_facts"."correct" is null and "gamification_learning_facts"."last_reveal_attempt_id" is null and "gamification_learning_facts"."last_reveal_at" is null))
);
--> statement-breakpoint
ALTER TABLE "gamification_profiles" ADD COLUMN "avatar_mode" text DEFAULT 'photo' NOT NULL;--> statement-breakpoint
ALTER TABLE "gamification_profiles" ADD COLUMN "badge_tier" bigint;--> statement-breakpoint
ALTER TABLE "gamification_badge_activities" ADD CONSTRAINT "gamification_badge_activities_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_daily_rank_snapshots" ADD CONSTRAINT "gamification_daily_rank_snapshots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_eligible_recalls" ADD CONSTRAINT "gamification_eligible_recalls_source_evidence_id_gamification_learning_facts_id_fk" FOREIGN KEY ("source_evidence_id") REFERENCES "public"."gamification_learning_facts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_eligible_recalls" ADD CONSTRAINT "gamification_eligible_recalls_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_eligible_recalls" ADD CONSTRAINT "gamification_eligible_recalls_checklist_item_id_gamification_checklist_items_id_fk" FOREIGN KEY ("checklist_item_id") REFERENCES "public"."gamification_checklist_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_explanation_completions_v2" ADD CONSTRAINT "gamification_explanation_completions_v2_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_explanation_completions_v2" ADD CONSTRAINT "gamification_explanation_completions_v2_collection_id_solution_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."solution_collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_learning_facts" ADD CONSTRAINT "gamification_learning_facts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_learning_facts" ADD CONSTRAINT "gamification_learning_facts_course_id_mata_kuliah_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gamification_eligible_recalls_lookup_idx" ON "gamification_eligible_recalls" USING btree ("user_id","checklist_item_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "gamification_learning_facts_owner_source_idx" ON "gamification_learning_facts" USING btree ("user_id","source","source_id","occurred_at");