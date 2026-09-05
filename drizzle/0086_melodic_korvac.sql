ALTER TABLE `jawaban_murid` ADD `reviewer_id` text REFERENCES pengguna(id);--> statement-breakpoint
ALTER TABLE `jawaban_murid` ADD `review_notes` text;--> statement-breakpoint
ALTER TABLE `jawaban_murid` ADD `reviewed_at` integer;--> statement-breakpoint
ALTER TABLE `jawaban_murid` ADD `review_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `student_quiz_attempts` ADD `grading_status` text DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_attempts_grading_status` ON `student_quiz_attempts` (`template_id`,`grading_status`);