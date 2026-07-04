CREATE TABLE `pka_registrations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`full_name` text NOT NULL,
	`faculty` text NOT NULL,
	`email` text NOT NULL,
	`instagram_username` text NOT NULL,
	`proof_key` text NOT NULL,
	`receive_announcements` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_pka_registrations_user` ON `pka_registrations` (`user_id`);