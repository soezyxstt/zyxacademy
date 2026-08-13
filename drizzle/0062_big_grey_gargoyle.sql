CREATE TABLE `export_spreadsheets` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`spreadsheet_id` text NOT NULL,
	`spreadsheet_url` text NOT NULL,
	`drive_folder_id` text NOT NULL,
	`folder_path` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `export_spreadsheets_entity_idx` ON `export_spreadsheets` (`entity_type`,`entity_id`);--> statement-breakpoint
ALTER TABLE `custom_forms` ADD `spreadsheet_id` text;--> statement-breakpoint
ALTER TABLE `custom_forms` ADD `spreadsheet_url` text;--> statement-breakpoint
ALTER TABLE `quiz_templates` ADD `spreadsheet_id` text;--> statement-breakpoint
ALTER TABLE `quiz_templates` ADD `spreadsheet_url` text;