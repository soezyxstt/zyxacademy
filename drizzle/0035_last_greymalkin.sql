CREATE TABLE `page_analytics` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
