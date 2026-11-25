CREATE TABLE "onboarding_tours" (
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"status" text NOT NULL,
	"step_index" integer DEFAULT 0 NOT NULL,
	"course_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_tours_user_id_role_pk" PRIMARY KEY("user_id","role"),
	CONSTRAINT "onboarding_tours_role_check" CHECK ("onboarding_tours"."role" in ('student', 'tutor')),
	CONSTRAINT "onboarding_tours_version_check" CHECK ("onboarding_tours"."version" = 1),
	CONSTRAINT "onboarding_tours_generation_check" CHECK ("onboarding_tours"."generation" >= 1),
	CONSTRAINT "onboarding_tours_status_check" CHECK ("onboarding_tours"."status" in ('in_progress', 'completed', 'skipped')),
	CONSTRAINT "onboarding_tours_step_check" CHECK ("onboarding_tours"."step_index" between 0 and 9 and ("onboarding_tours"."status" <> 'completed' or "onboarding_tours"."step_index" = 9)),
	CONSTRAINT "onboarding_tours_course_check" CHECK ("onboarding_tours"."course_id" is null or char_length("onboarding_tours"."course_id") between 1 and 128)
);

--> statement-breakpoint
ALTER TABLE "onboarding_tours" ADD CONSTRAINT "onboarding_tours_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
