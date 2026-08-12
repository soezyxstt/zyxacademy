ALTER TABLE `export_spreadsheets` ADD `last_header_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `export_spreadsheets` ADD `last_row_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `export_spreadsheets` ADD `last_written_fingerprint` text;