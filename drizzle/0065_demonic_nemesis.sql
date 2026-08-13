CREATE TABLE `custom_form_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`category` text DEFAULT 'survey' NOT NULL,
	`questions` text NOT NULL,
	`settings` text,
	`created_by_id` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_custom_form_presets_category` ON `custom_form_presets` (`category`);--> statement-breakpoint
CREATE TABLE `important_links` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`description` text,
	`icon` text,
	`category` text,
	`color` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by_id` text,
	`deleted_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_important_links_category` ON `important_links` (`category`);--> statement-breakpoint
CREATE INDEX `idx_important_links_active` ON `important_links` (`is_active`);--> statement-breakpoint
ALTER TABLE `google_meet_sessions` ADD `slug` text;--> statement-breakpoint
ALTER TABLE `google_meet_sessions` ADD `host_email` text;--> statement-breakpoint
ALTER TABLE `google_meet_sessions` ADD `co_host_emails` text;--> statement-breakpoint
ALTER TABLE `google_meet_sessions` ADD `invited_emails` text;--> statement-breakpoint
CREATE UNIQUE INDEX `google_meet_sessions_slug_unique` ON `google_meet_sessions` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_meet_slug` ON `google_meet_sessions` (`slug`);