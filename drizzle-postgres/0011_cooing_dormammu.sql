CREATE TABLE "gamification_evidence_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"course_id" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"source_version" text NOT NULL,
	"source_evidence_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gamification_receipt_source_evidence_unique" UNIQUE("source","source_evidence_id"),
	CONSTRAINT "gamification_receipt_source_check" CHECK ("gamification_evidence_receipts"."source" IN ('article', 'explanation', 'question', 'flashcard'))
);
--> statement-breakpoint
CREATE TABLE "gamification_explanation_completions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"collection_id" text NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"item_ids" jsonb NOT NULL,
	CONSTRAINT "gamification_explanation_completion_unique" UNIQUE("user_id","collection_id")
);
--> statement-breakpoint
ALTER TABLE "gamification_evidence_receipts" ADD CONSTRAINT "gamification_evidence_receipts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_evidence_receipts" ADD CONSTRAINT "gamification_evidence_receipts_course_id_mata_kuliah_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_explanation_completions" ADD CONSTRAINT "gamification_explanation_completions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_explanation_completions" ADD CONSTRAINT "gamification_explanation_completions_collection_id_solution_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."solution_collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gamification_receipt_user_source_idx" ON "gamification_evidence_receipts" USING btree ("user_id","source","source_id");--> statement-breakpoint
ALTER TABLE "gamification_checklists" ADD CONSTRAINT "gamification_checklists_course_id_mata_kuliah_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_course_starts" ADD CONSTRAINT "gamification_course_starts_course_id_mata_kuliah_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE no action ON UPDATE no action;