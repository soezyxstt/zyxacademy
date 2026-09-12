CREATE TABLE `group_name_change_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`changed_by_id` text NOT NULL,
	`old_name` text NOT NULL,
	`new_name` text NOT NULL,
	`changed_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`changed_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `group_name_change_group_time_idx` ON `group_name_change_audit` (`group_id`,`changed_at`);--> statement-breakpoint
CREATE INDEX `group_name_change_actor_idx` ON `group_name_change_audit` (`changed_by_id`);--> statement-breakpoint
CREATE TABLE `tutor_slot_notes` (
	`slot_id` text PRIMARY KEY NOT NULL,
	`notes` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`slot_id`) REFERENCES `tutor_slots`(`id`) ON UPDATE no action ON DELETE cascade
);
