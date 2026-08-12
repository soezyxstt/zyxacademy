CREATE TABLE `google_meet_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`space_name` text NOT NULL,
	`meeting_uri` text NOT NULL,
	`meeting_code` text NOT NULL,
	`access_type` text DEFAULT 'OPEN' NOT NULL,
	`created_by_id` text,
	`deleted_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_meet_sessions_space_name_unique` ON `google_meet_sessions` (`space_name`);--> statement-breakpoint
CREATE INDEX `idx_meet_space_name` ON `google_meet_sessions` (`space_name`);--> statement-breakpoint
CREATE INDEX `idx_meet_code` ON `google_meet_sessions` (`meeting_code`);