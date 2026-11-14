CREATE TABLE "gamification_article_completions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"course_id" text NOT NULL,
	"article_id" text NOT NULL,
	"article_version" bigint NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"section_ids" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	CONSTRAINT "gamification_article_completion_unique" UNIQUE("user_id","article_id","article_version"),
	CONSTRAINT "gamification_article_completion_version_check" CHECK ("gamification_article_completions"."article_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "gamification_article_completions" ADD CONSTRAINT "gamification_article_completions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_article_completions" ADD CONSTRAINT "gamification_article_completions_course_id_mata_kuliah_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_article_completions" ADD CONSTRAINT "gamification_article_completions_article_id_artikel_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."artikel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gamification_article_completion_owner_source_idx" ON "gamification_article_completions" USING btree ("user_id","course_id","article_id");