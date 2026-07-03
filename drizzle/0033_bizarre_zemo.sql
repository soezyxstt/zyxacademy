CREATE TABLE `pka_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`session_at` integer NOT NULL,
	`meet_link` text,
	`created_by` text NOT NULL,
	`sent_at` integer,
	`recipient_count` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `pka_announcements` DROP COLUMN `meet_link`;--> statement-breakpoint
ALTER TABLE `pka_announcements` DROP COLUMN `session_at`;