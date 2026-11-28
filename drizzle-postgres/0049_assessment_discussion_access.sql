ALTER TABLE "ai_question_bank" ADD COLUMN IF NOT EXISTS "prompt_ui" jsonb;
--> statement-breakpoint
ALTER TABLE "ai_question_bank" ADD COLUMN IF NOT EXISTS "explanation_ui" jsonb;
--> statement-breakpoint
ALTER TABLE "student_quiz_attempts" ADD COLUMN IF NOT EXISTS "leaderboard_eligible" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "leaderboard_eligible" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assessment_discussion_access" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action,
	"course_id" text NOT NULL REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action,
	"assessment_kind" text NOT NULL,
	"assessment_id" text NOT NULL,
	"first_opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opened_before_completion" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_assessment_discussion_access_user_assessment" ON "assessment_discussion_access" USING btree ("user_id","assessment_kind","assessment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_assessment_discussion_access_course_user" ON "assessment_discussion_access" USING btree ("course_id","user_id");
