CREATE TABLE "gamification_question_exposure_observations" (
	"user_id" text NOT NULL,
	"attempt_id" text NOT NULL,
	"question_id" text NOT NULL,
	"course_id" text NOT NULL,
	"source_version" text NOT NULL,
	"attempt_identity" text,
	"exposed_at" timestamp with time zone,
	CONSTRAINT "gamification_question_exposure_observations_user_id_attempt_id_question_id_pk" PRIMARY KEY("user_id","attempt_id","question_id"),
	CONSTRAINT "gamification_question_observation_pair_check" CHECK (("gamification_question_exposure_observations"."attempt_identity" is null) = ("gamification_question_exposure_observations"."exposed_at" is null))
);
--> statement-breakpoint
CREATE TABLE "gamification_question_exposure_projection" (
	"user_id" text NOT NULL,
	"course_id" text NOT NULL,
	"question_id" text NOT NULL,
	"attempt_identity" text NOT NULL,
	"exposed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "gamification_question_exposure_projection_user_id_course_id_question_id_pk" PRIMARY KEY("user_id","course_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "gamification_question_history_cutover" (
	"id" text PRIMARY KEY NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "gamification_question_history_cutover_singleton" CHECK ("gamification_question_history_cutover"."id" = 'v1')
);
--> statement-breakpoint
CREATE TABLE "gamification_question_legacy_index" (
	"user_id" text NOT NULL,
	"question_id" text NOT NULL,
	"first_attempt_id" text NOT NULL,
	"last_attempt_id" text NOT NULL,
	CONSTRAINT "gamification_question_legacy_index_user_id_question_id_pk" PRIMARY KEY("user_id","question_id")
);
--> statement-breakpoint
ALTER TABLE "gamification_question_exposure_observations" ADD CONSTRAINT "gamification_question_exposure_observations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_question_exposure_observations" ADD CONSTRAINT "gamification_question_exposure_observations_attempt_id_student_quiz_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."student_quiz_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_question_exposure_observations" ADD CONSTRAINT "gamification_question_exposure_observations_question_id_soal_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."soal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_question_exposure_observations" ADD CONSTRAINT "gamification_question_exposure_observations_course_id_mata_kuliah_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_question_exposure_projection" ADD CONSTRAINT "gamification_question_exposure_projection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_question_legacy_index" ADD CONSTRAINT "gamification_question_legacy_index_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;