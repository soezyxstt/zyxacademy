CREATE TABLE `custom_form_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`responder_user_id` text,
	`responder_email` text,
	`answers` text NOT NULL,
	`submitted_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `custom_forms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`responder_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_custom_form_responses_form_id` ON `custom_form_responses` (`form_id`);--> statement-breakpoint
CREATE INDEX `idx_custom_form_responses_user_id` ON `custom_form_responses` (`responder_user_id`);--> statement-breakpoint
CREATE TABLE `custom_forms` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`category` text DEFAULT 'survey' NOT NULL,
	`questions` text NOT NULL,
	`settings` text,
	`google_form_id` text,
	`google_responder_uri` text,
	`created_by_id` text,
	`deleted_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_forms_slug_unique` ON `custom_forms` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_custom_forms_slug` ON `custom_forms` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_custom_forms_category` ON `custom_forms` (`category`);