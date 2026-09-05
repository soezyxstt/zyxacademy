CREATE TABLE `admin_ops_knowledge_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`source_path` text NOT NULL,
	`source_type` text NOT NULL,
	`title` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`content_hash` text NOT NULL,
	`manifest_hash` text NOT NULL,
	`chunk_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`metadata` text,
	`last_synced_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_admin_ops_sources_path` ON `admin_ops_knowledge_sources` (`source_path`);--> statement-breakpoint
CREATE INDEX `idx_admin_ops_sources_status` ON `admin_ops_knowledge_sources` (`status`);--> statement-breakpoint
CREATE INDEX `idx_admin_ops_sources_hash` ON `admin_ops_knowledge_sources` (`content_hash`);--> statement-breakpoint
CREATE TABLE `admin_ops_knowledge_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`locator` text NOT NULL,
	`heading_hierarchy` text DEFAULT '[]' NOT NULL,
	`start_offset` integer NOT NULL,
	`end_offset` integer NOT NULL,
	`content` text NOT NULL,
	`content_hash` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`vector_id` text NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `admin_ops_knowledge_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_admin_ops_chunks_source` ON `admin_ops_knowledge_chunks` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_admin_ops_chunks_status` ON `admin_ops_knowledge_chunks` (`status`);--> statement-breakpoint
CREATE INDEX `idx_admin_ops_chunks_vector_id` ON `admin_ops_knowledge_chunks` (`vector_id`);--> statement-breakpoint
CREATE INDEX `idx_admin_ops_chunks_content_hash` ON `admin_ops_knowledge_chunks` (`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_admin_ops_chunks_source_index_ver` ON `admin_ops_knowledge_chunks` (`source_id`,`chunk_index`,`version`);--> statement-breakpoint
CREATE TABLE `admin_ops_knowledge_sync_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text,
	`action` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payload` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `admin_ops_knowledge_sources`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_admin_ops_sync_queue_status` ON `admin_ops_knowledge_sync_queue` (`status`);