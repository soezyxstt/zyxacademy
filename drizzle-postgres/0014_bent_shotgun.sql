CREATE TABLE "gamification_question_exposure_initializations" (
	"user_id" text NOT NULL,
	"question_id" text NOT NULL,
	"initialized_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gamification_question_exposure_initializations_user_id_question_id_pk" PRIMARY KEY("user_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "gamification_question_exposures" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"question_id" text NOT NULL,
	"course_id" text NOT NULL,
	"source_version" text NOT NULL,
	"kind" text NOT NULL,
	"attempt_identity" text NOT NULL,
	"exposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gamification_question_exposure_identity" UNIQUE("user_id","question_id","kind","attempt_identity"),
	CONSTRAINT "gamification_question_exposure_kind_check" CHECK ("gamification_question_exposures"."kind" in ('disclosure', 'baseline'))
);
--> statement-breakpoint
ALTER TABLE "gamification_question_exposure_initializations" ADD CONSTRAINT "gamification_question_exposure_initializations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_question_exposure_initializations" ADD CONSTRAINT "gamification_question_exposure_initializations_question_id_soal_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."soal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_question_exposures" ADD CONSTRAINT "gamification_question_exposures_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_question_exposures" ADD CONSTRAINT "gamification_question_exposures_question_id_soal_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."soal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_question_exposures" ADD CONSTRAINT "gamification_question_exposures_course_id_mata_kuliah_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gamification_question_exposure_history_idx" ON "gamification_question_exposures" USING btree ("user_id","question_id","exposed_at");