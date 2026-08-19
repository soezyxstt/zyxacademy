CREATE TABLE `migration_checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`phase` text NOT NULL,
	`checkpoint` text NOT NULL,
	`status` text NOT NULL,
	`manifest_hash` text,
	`row_count` integer,
	`details` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `migration_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `migration_checkpoints_run_idx` ON `migration_checkpoints` (`run_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `migration_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_number` text NOT NULL,
	`source_commit` text NOT NULL,
	`schema_version` text NOT NULL,
	`database_fingerprint` text NOT NULL,
	`phase` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`completed_at` integer,
	`row_count_manifest_hash` text,
	`error_code` text
);
--> statement-breakpoint
CREATE INDEX `migration_runs_plan_idx` ON `migration_runs` (`plan_number`);--> statement-breakpoint
CREATE INDEX `migration_runs_status_idx` ON `migration_runs` (`status`);