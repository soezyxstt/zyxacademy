CREATE TABLE `bagian_artikel` (
	`id` text PRIMARY KEY NOT NULL,
	`artikel_id` text NOT NULL,
	`bagian_pembelajaran_id` text,
	`parent_section_id` text,
	`section_key` text NOT NULL,
	`section_kind` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`learning_objective` text NOT NULL,
	`order_index` integer NOT NULL,
	`estimated_reading_minutes` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`artikel_id`) REFERENCES `artikel`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bagian_pembelajaran_id`) REFERENCES `bagian_pembelajaran`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`parent_section_id`) REFERENCES `bagian_artikel`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "bagian_artikel_kind_check" CHECK("bagian_artikel"."section_kind" IN ('overview', 'topic', 'summary')),
	CONSTRAINT "bagian_artikel_order_check" CHECK("bagian_artikel"."order_index" >= 0),
	CONSTRAINT "bagian_artikel_minutes_check" CHECK("bagian_artikel"."estimated_reading_minutes" > 0),
	CONSTRAINT "bagian_artikel_version_check" CHECK("bagian_artikel"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bagian_artikel_key_idx` ON `bagian_artikel` (`artikel_id`,`version`,`section_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `bagian_artikel_slug_idx` ON `bagian_artikel` (`artikel_id`,`version`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `bagian_artikel_order_idx` ON `bagian_artikel` (`artikel_id`,`version`,`parent_section_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `bagian_artikel_learning_section_idx` ON `bagian_artikel` (`bagian_pembelajaran_id`);--> statement-breakpoint
CREATE TABLE `bagian_pembelajaran` (
	`id` text PRIMARY KEY NOT NULL,
	`mata_kuliah_id` text NOT NULL,
	`bab_id` text NOT NULL,
	`stable_key` text NOT NULL,
	`parent_section_id` text,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`order_index` integer NOT NULL,
	`learning_objective` text NOT NULL,
	`source_chunk_ids` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`mata_kuliah_id`) REFERENCES `mata_kuliah`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`bab_id`) REFERENCES `bab`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`parent_section_id`) REFERENCES `bagian_pembelajaran`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "bagian_pembelajaran_order_check" CHECK("bagian_pembelajaran"."order_index" >= 0),
	CONSTRAINT "bagian_pembelajaran_version_check" CHECK("bagian_pembelajaran"."version" > 0),
	CONSTRAINT "bagian_pembelajaran_status_check" CHECK("bagian_pembelajaran"."status" IN ('published', 'superseded', 'withdrawn'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bagian_pembelajaran_stable_key_idx` ON `bagian_pembelajaran` (`stable_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `bagian_pembelajaran_slug_idx` ON `bagian_pembelajaran` (`mata_kuliah_id`,`bab_id`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `bagian_pembelajaran_order_idx` ON `bagian_pembelajaran` (`bab_id`,`parent_section_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `bagian_pembelajaran_parent_idx` ON `bagian_pembelajaran` (`parent_section_id`);--> statement-breakpoint
CREATE TABLE `bagian_pembelajaran_ide` (
	`id` text PRIMARY KEY NOT NULL,
	`bagian_pembelajaran_id` text NOT NULL,
	`ide_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`bagian_pembelajaran_id`) REFERENCES `bagian_pembelajaran`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ide_id`) REFERENCES `ide`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "bagian_pembelajaran_ide_role_check" CHECK("bagian_pembelajaran_ide"."role" IN ('primary', 'supporting'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bagian_pembelajaran_ide_unique_idx` ON `bagian_pembelajaran_ide` (`bagian_pembelajaran_id`,`ide_id`);--> statement-breakpoint
CREATE INDEX `bagian_pembelajaran_ide_ide_idx` ON `bagian_pembelajaran_ide` (`ide_id`);--> statement-breakpoint
CREATE TABLE `blok_artikel_ide` (
	`id` text PRIMARY KEY NOT NULL,
	`blok_artikel_id` text NOT NULL,
	`ide_id` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`blok_artikel_id`) REFERENCES `blok_artikel`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ide_id`) REFERENCES `ide`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blok_artikel_ide_unique_idx` ON `blok_artikel_ide` (`blok_artikel_id`,`ide_id`);--> statement-breakpoint
CREATE INDEX `blok_artikel_ide_ide_idx` ON `blok_artikel_ide` (`ide_id`);--> statement-breakpoint
CREATE TABLE `blok_artikel_sumber` (
	`id` text PRIMARY KEY NOT NULL,
	`blok_artikel_id` text NOT NULL,
	`sumber_materi_id` text NOT NULL,
	`source_version` integer NOT NULL,
	`source_checksum` text NOT NULL,
	`excerpt_ids` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`blok_artikel_id`) REFERENCES `blok_artikel`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sumber_materi_id`) REFERENCES `sumber_materi`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "blok_artikel_sumber_version_check" CHECK("blok_artikel_sumber"."source_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blok_artikel_sumber_unique_idx` ON `blok_artikel_sumber` (`blok_artikel_id`,`sumber_materi_id`,`source_version`);--> statement-breakpoint
CREATE INDEX `blok_artikel_sumber_source_idx` ON `blok_artikel_sumber` (`sumber_materi_id`);--> statement-breakpoint
CREATE TABLE `kemajuan_baca_artikel` (
	`id` text PRIMARY KEY NOT NULL,
	`pengguna_id` text NOT NULL,
	`artikel_id` text NOT NULL,
	`artikel_version` integer NOT NULL,
	`bagian_artikel_id` text NOT NULL,
	`max_read_percent` integer DEFAULT 0 NOT NULL,
	`time_spent_seconds` integer DEFAULT 0 NOT NULL,
	`completed_at` integer,
	`last_read_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`pengguna_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artikel_id`) REFERENCES `artikel`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bagian_artikel_id`) REFERENCES `bagian_artikel`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "kemajuan_baca_artikel_version_check" CHECK("kemajuan_baca_artikel"."artikel_version" > 0),
	CONSTRAINT "kemajuan_baca_artikel_percent_check" CHECK("kemajuan_baca_artikel"."max_read_percent" >= 0 AND "kemajuan_baca_artikel"."max_read_percent" <= 100),
	CONSTRAINT "kemajuan_baca_artikel_time_check" CHECK("kemajuan_baca_artikel"."time_spent_seconds" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kemajuan_baca_artikel_unique_idx` ON `kemajuan_baca_artikel` (`pengguna_id`,`artikel_id`,`artikel_version`,`bagian_artikel_id`);--> statement-breakpoint
CREATE INDEX `kemajuan_baca_artikel_resume_idx` ON `kemajuan_baca_artikel` (`pengguna_id`,`artikel_id`,`last_read_at`);--> statement-breakpoint
DROP INDEX `blok_artikel_order_idx`;--> statement-breakpoint
ALTER TABLE `blok_artikel` ADD `bagian_artikel_id` text REFERENCES bagian_artikel(id);--> statement-breakpoint
ALTER TABLE `blok_artikel` ADD `title` text;--> statement-breakpoint
CREATE UNIQUE INDEX `blok_artikel_key_idx` ON `blok_artikel` (`artikel_id`,`version`,`block_key`);--> statement-breakpoint
CREATE INDEX `blok_artikel_section_idx` ON `blok_artikel` (`bagian_artikel_id`);--> statement-breakpoint
CREATE INDEX `blok_artikel_order_idx` ON `blok_artikel` (`artikel_id`,`version`,`bagian_artikel_id`,`order_index`);--> statement-breakpoint
ALTER TABLE `artikel` ADD `structure_status` text DEFAULT 'legacy_unreviewed' NOT NULL;--> statement-breakpoint
CREATE INDEX `artikel_structure_status_idx` ON `artikel` (`structure_status`);--> statement-breakpoint
ALTER TABLE `review_item_bundle` ADD `target_type` text DEFAULT 'article_block' NOT NULL;--> statement-breakpoint
ALTER TABLE `review_item_bundle` ADD `target_id` text;