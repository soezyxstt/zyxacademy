CREATE TABLE `quiz_ai_insights` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text,
	`exam_id` text,
	`sample_size` integer DEFAULT 0 NOT NULL,
	`insights` text NOT NULL,
	`summary` text,
	`generated_by_id` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `quiz_templates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generated_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_qai_template` ON `quiz_ai_insights` (`template_id`);--> statement-breakpoint
CREATE INDEX `idx_qai_exam` ON `quiz_ai_insights` (`exam_id`);