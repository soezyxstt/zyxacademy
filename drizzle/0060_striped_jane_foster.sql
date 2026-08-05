CREATE TABLE `google_forms` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`responder_uri` text NOT NULL,
	`edit_uri` text,
	`category` text DEFAULT 'survey' NOT NULL,
	`created_by_id` text,
	`deleted_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_forms_form_id_unique` ON `google_forms` (`form_id`);--> statement-breakpoint
CREATE INDEX `idx_forms_form_id` ON `google_forms` (`form_id`);--> statement-breakpoint
CREATE INDEX `idx_forms_category` ON `google_forms` (`category`);