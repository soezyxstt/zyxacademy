ALTER TABLE `ai_question_bank` ADD `origin` text DEFAULT 'zyx_original' NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_question_bank` ADD `source_event_name` text;--> statement-breakpoint
ALTER TABLE `ai_question_bank` ADD `source_reference_id` text;--> statement-breakpoint
CREATE INDEX `idx_qbank_origin` ON `ai_question_bank` (`origin`,`source_event_name`);--> statement-breakpoint
ALTER TABLE `soal` ADD `origin` text DEFAULT 'zyx_original' NOT NULL;--> statement-breakpoint
ALTER TABLE `soal` ADD `source_event_name` text;--> statement-breakpoint
ALTER TABLE `soal` ADD `source_reference_id` text;--> statement-breakpoint
CREATE INDEX `soal_origin_idx` ON `soal` (`origin`,`source_event_name`);