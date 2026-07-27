CREATE TABLE `student_quiz_analytics` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`student_id` text NOT NULL,
	`template_id` text NOT NULL,
	`course_id` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`computed_metrics` text,
	`ai_diagnosis` text,
	`error_message` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `student_quiz_attempts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `quiz_templates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_quiz_analytics_attempt_id_unique` ON `student_quiz_analytics` (`attempt_id`);--> statement-breakpoint
CREATE INDEX `idx_sqa_attempt` ON `student_quiz_analytics` (`attempt_id`);--> statement-breakpoint
CREATE INDEX `idx_sqa_student` ON `student_quiz_analytics` (`student_id`);--> statement-breakpoint
CREATE INDEX `idx_sqa_template` ON `student_quiz_analytics` (`template_id`);