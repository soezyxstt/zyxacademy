CREATE TABLE `pka_announcement_reads` (
	`announcement_id` text NOT NULL,
	`user_id` text NOT NULL,
	`read_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	PRIMARY KEY(`announcement_id`, `user_id`),
	FOREIGN KEY (`announcement_id`) REFERENCES `pka_announcements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `pka_announcements` ADD `is_pinned` integer DEFAULT false NOT NULL;