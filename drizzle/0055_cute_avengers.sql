CREATE TABLE `legacy_backfill_exceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`legacy_table` text NOT NULL,
	`legacy_id` text NOT NULL,
	`reason_code` text NOT NULL,
	`preservation_path` text NOT NULL,
	`details` text NOT NULL,
	`blocks_cutover` integer DEFAULT false NOT NULL,
	`source_checksum` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `migration_runs`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legacy_backfill_exception_source_idx` ON `legacy_backfill_exceptions` (`run_id`,`legacy_table`,`legacy_id`,`reason_code`);--> statement-breakpoint
CREATE INDEX `legacy_backfill_exception_run_idx` ON `legacy_backfill_exceptions` (`run_id`);--> statement-breakpoint
CREATE INDEX `legacy_backfill_exception_blocking_idx` ON `legacy_backfill_exceptions` (`blocks_cutover`);