CREATE TABLE "gamification_question_bank_disclosures" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"question_id" text NOT NULL,
	"course_id" text NOT NULL,
	"exposed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gamification_question_bank_disclosures" ADD CONSTRAINT "gamification_question_bank_disclosures_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_question_bank_disclosures" ADD CONSTRAINT "gamification_question_bank_disclosures_course_id_mata_kuliah_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gamification_question_bank_disclosure_lookup_idx" ON "gamification_question_bank_disclosures" USING btree ("user_id","question_id");