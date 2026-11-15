ALTER TABLE "gamification_question_exposure_initializations" DROP CONSTRAINT "gamification_question_exposure_initializations_question_id_soal_id_fk";
--> statement-breakpoint
ALTER TABLE "gamification_question_exposure_observations" DROP CONSTRAINT "gamification_question_exposure_observations_question_id_soal_id_fk";
--> statement-breakpoint
ALTER TABLE "gamification_question_exposures" DROP CONSTRAINT "gamification_question_exposures_question_id_soal_id_fk";
--> statement-breakpoint
CREATE INDEX "gamification_question_comeback_lookup_idx" ON "gamification_learning_facts" USING btree ("user_id","source","source_id","source_version","correct","occurred_at");