PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_review_item_bundle` (
	`id` text PRIMARY KEY NOT NULL,
	`impor_bundle_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`product_id` text,
	`block_id` text,
	`target_type` text DEFAULT 'article_block' NOT NULL,
	`target_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`impor_bundle_id`) REFERENCES `impor_bundle`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "review_item_bundle_target_type_check" CHECK("__new_review_item_bundle"."target_type" IN ('idea', 'article_section', 'article_block'))
);
--> statement-breakpoint
INSERT INTO `__new_review_item_bundle`("id", "impor_bundle_id", "reviewer_id", "product_id", "block_id", "target_type", "target_id", "status", "notes", "created_at", "updated_at") SELECT "id", "impor_bundle_id", "reviewer_id", "product_id", "block_id", "target_type", "target_id", "status", "notes", "created_at", "updated_at" FROM `review_item_bundle`;--> statement-breakpoint
DROP TABLE `review_item_bundle`;--> statement-breakpoint
ALTER TABLE `__new_review_item_bundle` RENAME TO `review_item_bundle`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `review_item_bundle_target_idx` ON `review_item_bundle` (`impor_bundle_id`,`reviewer_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `review_item_bundle_import_idx` ON `review_item_bundle` (`impor_bundle_id`);--> statement-breakpoint
CREATE INDEX `review_item_bundle_status_idx` ON `review_item_bundle` (`status`);--> statement-breakpoint
CREATE TABLE `__new_artikel` (
	`id` text PRIMARY KEY NOT NULL,
	`mata_kuliah_id` text NOT NULL,
	`bab_id` text,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`content_markdown` text NOT NULL,
	`structure_status` text DEFAULT 'legacy_unreviewed' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`source_hash` text NOT NULL,
	`generation_hash` text NOT NULL,
	`creator_id` text NOT NULL,
	`curator_id` text,
	`published_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`mata_kuliah_id`) REFERENCES `mata_kuliah`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`bab_id`) REFERENCES `bab`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`creator_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`curator_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "artikel_version_check" CHECK("__new_artikel"."version" > 0),
	CONSTRAINT "artikel_status_check" CHECK("__new_artikel"."status" IN ('draft', 'in_review', 'published', 'withdrawn')),
	CONSTRAINT "artikel_structure_status_check" CHECK("__new_artikel"."structure_status" IN ('legacy_unreviewed', 'structured', 'needs_reauthoring'))
);
--> statement-breakpoint
INSERT INTO `__new_artikel`("id", "mata_kuliah_id", "bab_id", "slug", "title", "content_markdown", "structure_status", "version", "status", "source_hash", "generation_hash", "creator_id", "curator_id", "published_at", "created_at", "updated_at") SELECT "id", "mata_kuliah_id", "bab_id", "slug", "title", "content_markdown", "structure_status", "version", "status", "source_hash", "generation_hash", "creator_id", "curator_id", "published_at", "created_at", "updated_at" FROM `artikel`;--> statement-breakpoint
DROP TABLE `artikel`;--> statement-breakpoint
ALTER TABLE `__new_artikel` RENAME TO `artikel`;--> statement-breakpoint
CREATE UNIQUE INDEX `artikel_slug_idx` ON `artikel` (`slug`);--> statement-breakpoint
CREATE INDEX `artikel_course_idx` ON `artikel` (`mata_kuliah_id`);--> statement-breakpoint
CREATE INDEX `artikel_chapter_idx` ON `artikel` (`bab_id`);--> statement-breakpoint
CREATE INDEX `artikel_status_version_idx` ON `artikel` (`status`,`version`);--> statement-breakpoint
CREATE INDEX `artikel_structure_status_idx` ON `artikel` (`structure_status`);