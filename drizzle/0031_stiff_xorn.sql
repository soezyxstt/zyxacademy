CREATE TABLE `pka_announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`meet_link` text NOT NULL,
	`session_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`sent_at` integer,
	`recipient_count` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pka_simulation_stages` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`stage` integer NOT NULL,
	`quiz_template_id` text NOT NULL,
	`pass_score_threshold` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`quiz_template_id`) REFERENCES `quiz_templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_pka_stages_subject_stage` ON `pka_simulation_stages` (`subject`,`stage`);--> statement-breakpoint
CREATE TABLE `pka_stage_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`subject` text NOT NULL,
	`stage` integer NOT NULL,
	`status` text DEFAULT 'locked' NOT NULL,
	`best_score` integer,
	`passed` integer,
	`attempt_id` text,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attempt_id`) REFERENCES `student_quiz_attempts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_pka_progress_student_subject_stage` ON `pka_stage_progress` (`student_id`,`subject`,`stage`);