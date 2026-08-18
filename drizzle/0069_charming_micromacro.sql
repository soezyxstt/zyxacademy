CREATE TABLE `search_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`course_id` text,
	`title` text NOT NULL,
	`searchable_text` text NOT NULL,
	`path` text NOT NULL,
	`min_role` integer DEFAULT 0 NOT NULL,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_search_documents_entity` ON `search_documents` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_search_documents_synced` ON `search_documents` (`is_synced`);--> statement-breakpoint
CREATE INDEX `idx_search_documents_min_role` ON `search_documents` (`min_role`);--> statement-breakpoint
CREATE INDEX `idx_search_documents_course` ON `search_documents` (`course_id`);--> statement-breakpoint
ALTER TABLE `ai_material_instances` ADD `thumbnail_url` text;--> statement-breakpoint
ALTER TABLE `course_materials` ADD `thumbnail_url` text;--> statement-breakpoint
ALTER TABLE `diktats` ADD `thumbnail_url` text;--> statement-breakpoint
ALTER TABLE `website_materials` ADD `thumbnail_url` text;