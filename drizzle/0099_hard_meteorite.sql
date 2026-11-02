CREATE TABLE `coding_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`course_id` text NOT NULL,
	`problem_id` text NOT NULL,
	`problem_version` integer NOT NULL,
	`surface` text NOT NULL,
	`surface_id` text NOT NULL,
	`request_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`request` text NOT NULL,
	`evaluation` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`lease_token` text NOT NULL,
	`lease_expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `mata_kuliah`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "coding_attempt_status_check" CHECK("coding_attempts"."status" IN ('pending', 'completed', 'failed')),
	CONSTRAINT "coding_attempt_surface_check" CHECK("coding_attempts"."surface" IN ('article', 'live_quiz')),
	CONSTRAINT "coding_attempt_ordinal_check" CHECK("coding_attempts"."ordinal" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coding_attempt_request_idx` ON `coding_attempts` (`learner_id`,`surface`,`surface_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `coding_attempt_history_idx` ON `coding_attempts` (`learner_id`,`problem_id`,`problem_version`);--> statement-breakpoint
CREATE TABLE `coding_drafts` (
	`learner_id` text NOT NULL,
	`course_id` text NOT NULL,
	`draft_key` text NOT NULL,
	`code` text NOT NULL,
	`stdin` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	PRIMARY KEY(`learner_id`, `course_id`, `draft_key`),
	FOREIGN KEY (`learner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `mata_kuliah`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `coding_problems` (
	`id` text NOT NULL,
	`version` integer NOT NULL,
	`course_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`snapshot` text NOT NULL,
	`creator_id` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	PRIMARY KEY(`id`, `version`),
	FOREIGN KEY (`course_id`) REFERENCES `mata_kuliah`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`creator_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "coding_problems_version_check" CHECK("coding_problems"."version" > 0),
	CONSTRAINT "coding_problems_status_check" CHECK("coding_problems"."status" IN ('draft', 'published'))
);
--> statement-breakpoint
CREATE INDEX `coding_problems_course_status_idx` ON `coding_problems` (`course_id`,`status`);