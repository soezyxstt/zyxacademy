CREATE TABLE `extraction_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`mtd_id` text NOT NULL,
	`chapter_id` text NOT NULL,
	`state` text DEFAULT 'staged' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`mtd_id`) REFERENCES `master_teaching_documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_extraction_runs_chapter` ON `extraction_runs` (`chapter_id`);--> statement-breakpoint
CREATE INDEX `idx_extraction_runs_state` ON `extraction_runs` (`state`);--> statement-breakpoint
CREATE TABLE `knowledge_object_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`ko_id` text NOT NULL,
	`source_document_id` text NOT NULL,
	`source_version` text DEFAULT '1.0' NOT NULL,
	`chapter_id` text NOT NULL,
	`start_offset` integer NOT NULL,
	`end_offset` integer NOT NULL,
	`source_hash` text NOT NULL,
	`excerpt_hash` text NOT NULL,
	`extraction_run_id` text,
	`support_role` text DEFAULT 'core' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`ko_id`) REFERENCES `knowledge_objects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`extraction_run_id`) REFERENCES `extraction_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_ko_sources_ko` ON `knowledge_object_sources` (`ko_id`);--> statement-breakpoint
CREATE INDEX `idx_ko_sources_doc_chapter` ON `knowledge_object_sources` (`source_document_id`,`chapter_id`);--> statement-breakpoint
CREATE TABLE `learning_objectives` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`chapter_id` text NOT NULL,
	`objective_text` text NOT NULL,
	`bloom_level` text NOT NULL,
	`evidence_source_ids` text NOT NULL,
	`related_ko_ids` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_learning_objectives_chapter` ON `learning_objectives` (`chapter_id`);--> statement-breakpoint
ALTER TABLE `knowledge_objects` ADD `stable_key` text;--> statement-breakpoint
ALTER TABLE `knowledge_objects` ADD `semantic_hash` text;--> statement-breakpoint
ALTER TABLE `knowledge_objects` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `knowledge_objects` ADD `knowledge_kind` text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE `knowledge_objects` ADD `instructional_role` text DEFAULT 'core' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_ko_stable_key` ON `knowledge_objects` (`stable_key`);