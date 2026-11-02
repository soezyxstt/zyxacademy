CREATE TABLE "account_locale_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"locale" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_locale_preferences_locale_check" CHECK ("account_locale_preferences"."locale" in ('id', 'en'))
);
--> statement-breakpoint
CREATE TABLE "coding_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"learner_id" text NOT NULL,
	"course_id" text NOT NULL,
	"problem_id" text NOT NULL,
	"problem_version" bigint NOT NULL,
	"surface" text NOT NULL,
	"surface_id" text NOT NULL,
	"request_id" text NOT NULL,
	"ordinal" bigint NOT NULL,
	"request" jsonb NOT NULL,
	"evaluation" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"lease_token" text NOT NULL,
	"lease_expires_at" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coding_attempt_status_check" CHECK ("coding_attempts"."status" IN ('pending', 'completed', 'failed')),
	CONSTRAINT "coding_attempt_surface_check" CHECK ("coding_attempts"."surface" IN ('article', 'live_quiz')),
	CONSTRAINT "coding_attempt_ordinal_check" CHECK ("coding_attempts"."ordinal" > 0)
);
--> statement-breakpoint
CREATE TABLE "coding_drafts" (
	"learner_id" text NOT NULL,
	"course_id" text NOT NULL,
	"draft_key" text NOT NULL,
	"code" text NOT NULL,
	"stdin" text DEFAULT '' NOT NULL,
	"revision" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coding_drafts_learner_id_course_id_draft_key_pk" PRIMARY KEY("learner_id","course_id","draft_key")
);
--> statement-breakpoint
CREATE TABLE "coding_problems" (
	"id" text NOT NULL,
	"version" bigint NOT NULL,
	"course_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"creator_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coding_problems_id_version_pk" PRIMARY KEY("id","version"),
	CONSTRAINT "coding_problems_version_check" CHECK ("coding_problems"."version" > 0),
	CONSTRAINT "coding_problems_status_check" CHECK ("coding_problems"."status" IN ('draft', 'published'))
);
--> statement-breakpoint
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_slot_id_unique";--> statement-breakpoint
ALTER TABLE "account_locale_preferences" ADD CONSTRAINT "account_locale_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coding_attempts" ADD CONSTRAINT "coding_attempts_learner_id_user_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coding_attempts" ADD CONSTRAINT "coding_attempts_course_id_mata_kuliah_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coding_drafts" ADD CONSTRAINT "coding_drafts_learner_id_user_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coding_drafts" ADD CONSTRAINT "coding_drafts_course_id_mata_kuliah_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coding_problems" ADD CONSTRAINT "coding_problems_course_id_mata_kuliah_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coding_problems" ADD CONSTRAINT "coding_problems_creator_id_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coding_attempt_request_idx" ON "coding_attempts" USING btree ("learner_id","surface","surface_id","request_id");--> statement-breakpoint
CREATE INDEX "coding_attempt_history_idx" ON "coding_attempts" USING btree ("learner_id","problem_id","problem_version");--> statement-breakpoint
CREATE INDEX "coding_problems_course_status_idx" ON "coding_problems" USING btree ("course_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_occupied_slot_unique_idx" ON "bookings" USING btree ("slot_id") WHERE "bookings"."status" <> 'cancelled';