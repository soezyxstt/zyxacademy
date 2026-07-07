CREATE TABLE `blog_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`content` text NOT NULL,
	`thumbnail_url` text,
	`category` text NOT NULL,
	`read_minutes` integer DEFAULT 5 NOT NULL,
	`tags` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`created_by_id` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blog_articles_slug_unique` ON `blog_articles` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_blog_slug` ON `blog_articles` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_blog_status` ON `blog_articles` (`status`);--> statement-breakpoint
CREATE INDEX `idx_blog_category` ON `blog_articles` (`category`);