CREATE TABLE `short_link` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`url` text NOT NULL,
	`user_id` text,
	`clicks` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `short_link_slug_unique` ON `short_link` (`slug`);