CREATE TABLE `artikel` (
	`id` text PRIMARY KEY NOT NULL,
	`mata_kuliah_id` text NOT NULL,
	`bab_id` text,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`content_markdown` text NOT NULL,
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
	CONSTRAINT "artikel_version_check" CHECK("artikel"."version" > 0),
	CONSTRAINT "artikel_status_check" CHECK("artikel"."status" IN ('draft', 'in_review', 'published', 'withdrawn'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artikel_slug_idx` ON `artikel` (`slug`);--> statement-breakpoint
CREATE INDEX `artikel_course_idx` ON `artikel` (`mata_kuliah_id`);--> statement-breakpoint
CREATE INDEX `artikel_chapter_idx` ON `artikel` (`bab_id`);--> statement-breakpoint
CREATE INDEX `artikel_status_version_idx` ON `artikel` (`status`,`version`);--> statement-breakpoint
CREATE TABLE `artikel_ide` (
	`id` text PRIMARY KEY NOT NULL,
	`artikel_id` text NOT NULL,
	`ide_id` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`artikel_id`) REFERENCES `artikel`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ide_id`) REFERENCES `ide`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "artikel_ide_weight_check" CHECK("artikel_ide"."weight" > 0 AND "artikel_ide"."weight" <= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artikel_ide_unique_idx` ON `artikel_ide` (`artikel_id`,`ide_id`);--> statement-breakpoint
CREATE INDEX `artikel_ide_ide_idx` ON `artikel_ide` (`ide_id`);--> statement-breakpoint
CREATE TABLE `asesmen` (
	`id` text PRIMARY KEY NOT NULL,
	`blueprint_asesmen_id` text NOT NULL,
	`mata_kuliah_id` text NOT NULL,
	`title` text NOT NULL,
	`assessment_type` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`generation_hash` text NOT NULL,
	`creator_id` text NOT NULL,
	`curator_id` text,
	`published_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`blueprint_asesmen_id`) REFERENCES `blueprint_asesmen`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`mata_kuliah_id`) REFERENCES `mata_kuliah`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`creator_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`curator_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "asesmen_version_check" CHECK("asesmen"."version" > 0),
	CONSTRAINT "asesmen_type_check" CHECK("asesmen"."assessment_type" IN ('quiz', 'tryout'))
);
--> statement-breakpoint
CREATE INDEX `asesmen_course_idx` ON `asesmen` (`mata_kuliah_id`);--> statement-breakpoint
CREATE INDEX `asesmen_status_version_idx` ON `asesmen` (`status`,`version`);--> statement-breakpoint
CREATE TABLE `audit_mutasi` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`before_snapshot` text,
	`after_snapshot` text,
	`correlation_id` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_mutasi_entity_idx` ON `audit_mutasi` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_mutasi_actor_idx` ON `audit_mutasi` (`actor_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `benchmark_soal` (
	`id` text PRIMARY KEY NOT NULL,
	`soal_itb_referensi_id` text,
	`dataset_key` text NOT NULL,
	`authoring_visibility` text NOT NULL,
	`question_snapshot` text NOT NULL,
	`answer_snapshot` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`checksum` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`soal_itb_referensi_id`) REFERENCES `soal_itb_referensi`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "benchmark_soal_visibility_check" CHECK("benchmark_soal"."authoring_visibility" IN ('allowed', 'holdout')),
	CONSTRAINT "benchmark_soal_version_check" CHECK("benchmark_soal"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `benchmark_soal_checksum_idx` ON `benchmark_soal` (`checksum`);--> statement-breakpoint
CREATE INDEX `benchmark_soal_dataset_idx` ON `benchmark_soal` (`dataset_key`);--> statement-breakpoint
CREATE TABLE `blok_artikel` (
	`id` text PRIMARY KEY NOT NULL,
	`artikel_id` text NOT NULL,
	`block_key` text NOT NULL,
	`block_type` text NOT NULL,
	`order_index` integer NOT NULL,
	`content` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`generation_hash` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`artikel_id`) REFERENCES `artikel`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "blok_artikel_order_check" CHECK("blok_artikel"."order_index" >= 0),
	CONSTRAINT "blok_artikel_version_check" CHECK("blok_artikel"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blok_artikel_order_idx` ON `blok_artikel` (`artikel_id`,`version`,`order_index`);--> statement-breakpoint
CREATE INDEX `blok_artikel_status_idx` ON `blok_artikel` (`status`);--> statement-breakpoint
CREATE TABLE `blueprint_asesmen` (
	`id` text PRIMARY KEY NOT NULL,
	`mata_kuliah_id` text NOT NULL,
	`title` text NOT NULL,
	`assessment_type` text NOT NULL,
	`blueprint` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`generation_hash` text NOT NULL,
	`creator_id` text NOT NULL,
	`curator_id` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`mata_kuliah_id`) REFERENCES `mata_kuliah`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`creator_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`curator_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "blueprint_asesmen_version_check" CHECK("blueprint_asesmen"."version" > 0),
	CONSTRAINT "blueprint_asesmen_type_check" CHECK("blueprint_asesmen"."assessment_type" IN ('quiz', 'tryout'))
);
--> statement-breakpoint
CREATE INDEX `blueprint_asesmen_course_idx` ON `blueprint_asesmen` (`mata_kuliah_id`);--> statement-breakpoint
CREATE INDEX `blueprint_asesmen_status_version_idx` ON `blueprint_asesmen` (`status`,`version`);--> statement-breakpoint
CREATE TABLE `bukti_ide_jawaban` (
	`id` text PRIMARY KEY NOT NULL,
	`jawaban_murid_id` text NOT NULL,
	`ide_id` text NOT NULL,
	`score_contribution` real NOT NULL,
	`weight` real NOT NULL,
	`confidence` integer NOT NULL,
	`evidence_source` text NOT NULL,
	`rubric_version` text NOT NULL,
	`derivation_status` text NOT NULL,
	`ambiguous` integer DEFAULT false NOT NULL,
	`affects_mastery` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`jawaban_murid_id`) REFERENCES `jawaban_murid`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ide_id`) REFERENCES `ide`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "bukti_ide_jawaban_weight_check" CHECK("bukti_ide_jawaban"."weight" > 0 AND "bukti_ide_jawaban"."weight" <= 1),
	CONSTRAINT "bukti_ide_jawaban_confidence_check" CHECK("bukti_ide_jawaban"."confidence" >= 0 AND "bukti_ide_jawaban"."confidence" <= 100),
	CONSTRAINT "bukti_ide_jawaban_ambiguous_mastery_check" CHECK(NOT ("bukti_ide_jawaban"."ambiguous" AND "bukti_ide_jawaban"."affects_mastery"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bukti_ide_jawaban_unique_idx` ON `bukti_ide_jawaban` (`jawaban_murid_id`,`ide_id`);--> statement-breakpoint
CREATE INDEX `bukti_ide_jawaban_ide_idx` ON `bukti_ide_jawaban` (`ide_id`);--> statement-breakpoint
CREATE TABLE `bukti_pembelajaran` (
	`id` text PRIMARY KEY NOT NULL,
	`pengguna_id` text NOT NULL,
	`ide_id` text NOT NULL,
	`evidence_source` text NOT NULL,
	`source_id` text NOT NULL,
	`score_contribution` real NOT NULL,
	`confidence` integer NOT NULL,
	`rubric_version` text NOT NULL,
	`derivation_status` text NOT NULL,
	`ambiguous` integer DEFAULT false NOT NULL,
	`affects_mastery` integer DEFAULT false NOT NULL,
	`occurred_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`pengguna_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ide_id`) REFERENCES `ide`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "bukti_pembelajaran_confidence_check" CHECK("bukti_pembelajaran"."confidence" >= 0 AND "bukti_pembelajaran"."confidence" <= 100),
	CONSTRAINT "bukti_pembelajaran_ambiguous_mastery_check" CHECK(NOT ("bukti_pembelajaran"."ambiguous" AND "bukti_pembelajaran"."affects_mastery"))
);
--> statement-breakpoint
CREATE INDEX `bukti_pembelajaran_murid_ide_idx` ON `bukti_pembelajaran` (`pengguna_id`,`ide_id`);--> statement-breakpoint
CREATE INDEX `bukti_pembelajaran_source_idx` ON `bukti_pembelajaran` (`evidence_source`,`source_id`);--> statement-breakpoint
CREATE TABLE `cakupan_asesmen` (
	`id` text PRIMARY KEY NOT NULL,
	`asesmen_id` text NOT NULL,
	`bab_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`asesmen_id`) REFERENCES `asesmen`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bab_id`) REFERENCES `bab`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "cakupan_asesmen_order_check" CHECK("cakupan_asesmen"."order_index" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cakupan_asesmen_chapter_idx` ON `cakupan_asesmen` (`asesmen_id`,`bab_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cakupan_asesmen_order_idx` ON `cakupan_asesmen` (`asesmen_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `diktat_ide` (
	`id` text PRIMARY KEY NOT NULL,
	`diktat_materi_id` text NOT NULL,
	`ide_id` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`diktat_materi_id`) REFERENCES `diktat_materi`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ide_id`) REFERENCES `ide`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "diktat_ide_weight_check" CHECK("diktat_ide"."weight" > 0 AND "diktat_ide"."weight" <= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `diktat_ide_unique_idx` ON `diktat_ide` (`diktat_materi_id`,`ide_id`);--> statement-breakpoint
CREATE INDEX `diktat_ide_ide_idx` ON `diktat_ide` (`ide_id`);--> statement-breakpoint
CREATE TABLE `diktat_materi` (
	`id` text PRIMARY KEY NOT NULL,
	`mata_kuliah_id` text NOT NULL,
	`bab_id` text,
	`title` text NOT NULL,
	`content_markdown` text NOT NULL,
	`file_key` text,
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
	CONSTRAINT "diktat_materi_version_check" CHECK("diktat_materi"."version" > 0),
	CONSTRAINT "diktat_materi_status_check" CHECK("diktat_materi"."status" IN ('draft', 'in_review', 'published', 'withdrawn'))
);
--> statement-breakpoint
CREATE INDEX `diktat_materi_course_idx` ON `diktat_materi` (`mata_kuliah_id`);--> statement-breakpoint
CREATE INDEX `diktat_materi_chapter_idx` ON `diktat_materi` (`bab_id`);--> statement-breakpoint
CREATE INDEX `diktat_materi_status_version_idx` ON `diktat_materi` (`status`,`version`);--> statement-breakpoint
CREATE TABLE `diktat_pembahasan` (
	`id` text PRIMARY KEY NOT NULL,
	`diktat_materi_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`generation_hash` text NOT NULL,
	`creator_id` text NOT NULL,
	`curator_id` text,
	`published_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`diktat_materi_id`) REFERENCES `diktat_materi`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creator_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`curator_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "diktat_pembahasan_version_check" CHECK("diktat_pembahasan"."version" > 0),
	CONSTRAINT "diktat_pembahasan_status_check" CHECK("diktat_pembahasan"."status" IN ('draft', 'in_review', 'published', 'retired'))
);
--> statement-breakpoint
CREATE INDEX `diktat_pembahasan_diktat_idx` ON `diktat_pembahasan` (`diktat_materi_id`);--> statement-breakpoint
CREATE TABLE `flashcard` (
	`id` text PRIMARY KEY NOT NULL,
	`set_flashcard_id` text NOT NULL,
	`front` text NOT NULL,
	`back` text NOT NULL,
	`explanation` text,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`generation_hash` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`set_flashcard_id`) REFERENCES `set_flashcard`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "flashcard_version_check" CHECK("flashcard"."version" > 0)
);
--> statement-breakpoint
CREATE INDEX `flashcard_set_idx` ON `flashcard` (`set_flashcard_id`);--> statement-breakpoint
CREATE INDEX `flashcard_status_version_idx` ON `flashcard` (`status`,`version`);--> statement-breakpoint
CREATE TABLE `flashcard_ide` (
	`id` text PRIMARY KEY NOT NULL,
	`flashcard_id` text NOT NULL,
	`ide_id` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`flashcard_id`) REFERENCES `flashcard`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ide_id`) REFERENCES `ide`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "flashcard_ide_weight_check" CHECK("flashcard_ide"."weight" > 0 AND "flashcard_ide"."weight" <= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `flashcard_ide_unique_idx` ON `flashcard_ide` (`flashcard_id`,`ide_id`);--> statement-breakpoint
CREATE INDEX `flashcard_ide_ide_idx` ON `flashcard_ide` (`ide_id`);--> statement-breakpoint
CREATE TABLE `impor_bundle` (
	`id` text PRIMARY KEY NOT NULL,
	`bundle_id` text NOT NULL,
	`checksum` text NOT NULL,
	`bundle_type` text NOT NULL,
	`source_uri_or_key` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`requested_by` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`requested_by`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "impor_bundle_version_check" CHECK("impor_bundle"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `impor_bundle_identity_idx` ON `impor_bundle` (`bundle_id`,`checksum`);--> statement-breakpoint
CREATE INDEX `impor_bundle_status_idx` ON `impor_bundle` (`status`);--> statement-breakpoint
CREATE TABLE `item_asesmen` (
	`id` text PRIMARY KEY NOT NULL,
	`asesmen_id` text NOT NULL,
	`soal_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`rendered_question_snapshot` text NOT NULL,
	`option_order_snapshot` text NOT NULL,
	`grading_policy_snapshot` text NOT NULL,
	`content_version` integer NOT NULL,
	`generation_hash` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`asesmen_id`) REFERENCES `asesmen`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`soal_id`) REFERENCES `soal`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "item_asesmen_order_check" CHECK("item_asesmen"."order_index" >= 0),
	CONSTRAINT "item_asesmen_content_version_check" CHECK("item_asesmen"."content_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `item_asesmen_order_idx` ON `item_asesmen` (`asesmen_id`,`order_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `item_asesmen_soal_idx` ON `item_asesmen` (`asesmen_id`,`soal_id`);--> statement-breakpoint
CREATE TABLE `item_diktat_pembahasan` (
	`id` text PRIMARY KEY NOT NULL,
	`diktat_pembahasan_id` text NOT NULL,
	`soal_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`content_snapshot` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`diktat_pembahasan_id`) REFERENCES `diktat_pembahasan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`soal_id`) REFERENCES `soal`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "item_diktat_pembahasan_order_check" CHECK("item_diktat_pembahasan"."order_index" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `item_diktat_pembahasan_order_idx` ON `item_diktat_pembahasan` (`diktat_pembahasan_id`,`order_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `item_diktat_pembahasan_soal_idx` ON `item_diktat_pembahasan` (`diktat_pembahasan_id`,`soal_id`);--> statement-breakpoint
CREATE TABLE `item_impor_bundle` (
	`id` text PRIMARY KEY NOT NULL,
	`impor_bundle_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`entity_version` integer NOT NULL,
	`entity_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error_message` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`impor_bundle_id`) REFERENCES `impor_bundle`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "item_impor_bundle_version_check" CHECK("item_impor_bundle"."entity_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `item_impor_bundle_entity_idx` ON `item_impor_bundle` (`impor_bundle_id`,`entity_type`,`entity_id`,`entity_version`);--> statement-breakpoint
CREATE INDEX `item_impor_bundle_status_idx` ON `item_impor_bundle` (`status`);--> statement-breakpoint
CREATE TABLE `jawaban_murid` (
	`id` text PRIMARY KEY NOT NULL,
	`percobaan_asesmen_id` text NOT NULL,
	`item_asesmen_id` text NOT NULL,
	`rendered_question_snapshot` text NOT NULL,
	`option_order_snapshot` text NOT NULL,
	`response_snapshot` text NOT NULL,
	`grading_policy_snapshot` text NOT NULL,
	`content_version` integer NOT NULL,
	`score` real,
	`status` text DEFAULT 'ungraded' NOT NULL,
	`answered_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`percobaan_asesmen_id`) REFERENCES `percobaan_asesmen`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`item_asesmen_id`) REFERENCES `item_asesmen`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "jawaban_murid_content_version_check" CHECK("jawaban_murid"."content_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jawaban_murid_attempt_item_idx` ON `jawaban_murid` (`percobaan_asesmen_id`,`item_asesmen_id`);--> statement-breakpoint
CREATE INDEX `jawaban_murid_status_idx` ON `jawaban_murid` (`status`);--> statement-breakpoint
CREATE TABLE `kemajuan_flashcard_murid` (
	`id` text PRIMARY KEY NOT NULL,
	`pengguna_id` text NOT NULL,
	`flashcard_id` text NOT NULL,
	`due_at` integer NOT NULL,
	`interval_days` real DEFAULT 0 NOT NULL,
	`ease_factor` real DEFAULT 2.5 NOT NULL,
	`repetitions` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`last_reviewed_at` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`pengguna_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`flashcard_id`) REFERENCES `flashcard`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "kemajuan_flashcard_murid_interval_check" CHECK("kemajuan_flashcard_murid"."interval_days" >= 0),
	CONSTRAINT "kemajuan_flashcard_murid_ease_check" CHECK("kemajuan_flashcard_murid"."ease_factor" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kemajuan_flashcard_murid_unique_idx` ON `kemajuan_flashcard_murid` (`pengguna_id`,`flashcard_id`);--> statement-breakpoint
CREATE INDEX `kemajuan_flashcard_murid_due_idx` ON `kemajuan_flashcard_murid` (`pengguna_id`,`due_at`);--> statement-breakpoint
CREATE TABLE `pemahaman_ide` (
	`id` text PRIMARY KEY NOT NULL,
	`pengguna_id` text NOT NULL,
	`ide_id` text NOT NULL,
	`skor` integer NOT NULL,
	`keyakinan` integer NOT NULL,
	`evidence_count` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`pengguna_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ide_id`) REFERENCES `ide`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "pemahaman_ide_score_check" CHECK("pemahaman_ide"."skor" >= 0 AND "pemahaman_ide"."skor" <= 100),
	CONSTRAINT "pemahaman_ide_confidence_check" CHECK("pemahaman_ide"."keyakinan" >= 0 AND "pemahaman_ide"."keyakinan" <= 100),
	CONSTRAINT "pemahaman_ide_evidence_check" CHECK("pemahaman_ide"."evidence_count" >= 0),
	CONSTRAINT "pemahaman_ide_version_check" CHECK("pemahaman_ide"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pemahaman_ide_murid_ide_idx` ON `pemahaman_ide` (`pengguna_id`,`ide_id`);--> statement-breakpoint
CREATE INDEX `pemahaman_ide_ide_idx` ON `pemahaman_ide` (`ide_id`);--> statement-breakpoint
CREATE TABLE `pembahasan_soal` (
	`id` text PRIMARY KEY NOT NULL,
	`soal_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`generation_hash` text NOT NULL,
	`creator_id` text NOT NULL,
	`curator_id` text,
	`published_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`soal_id`) REFERENCES `soal`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creator_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`curator_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "pembahasan_soal_version_check" CHECK("pembahasan_soal"."version" > 0),
	CONSTRAINT "pembahasan_soal_status_check" CHECK("pembahasan_soal"."status" IN ('draft', 'in_review', 'published', 'retired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pembahasan_soal_version_idx` ON `pembahasan_soal` (`soal_id`,`version`);--> statement-breakpoint
CREATE TABLE `percobaan_asesmen` (
	`id` text PRIMARY KEY NOT NULL,
	`asesmen_id` text NOT NULL,
	`pengguna_id` text NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`rendered_question_snapshot` text NOT NULL,
	`option_order_snapshot` text NOT NULL,
	`grading_policy_snapshot` text NOT NULL,
	`content_version` integer NOT NULL,
	`started_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`submitted_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`asesmen_id`) REFERENCES `asesmen`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`pengguna_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "percobaan_asesmen_content_version_check" CHECK("percobaan_asesmen"."content_version" > 0)
);
--> statement-breakpoint
CREATE INDEX `percobaan_asesmen_murid_idx` ON `percobaan_asesmen` (`pengguna_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `percobaan_asesmen_assessment_idx` ON `percobaan_asesmen` (`asesmen_id`,`status`);--> statement-breakpoint
CREATE TABLE `perubahan_pemahaman` (
	`id` text PRIMARY KEY NOT NULL,
	`pemahaman_ide_id` text NOT NULL,
	`evidence_id` text,
	`previous_score` integer NOT NULL,
	`next_score` integer NOT NULL,
	`previous_confidence` integer NOT NULL,
	`next_confidence` integer NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`pemahaman_ide_id`) REFERENCES `pemahaman_ide`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`evidence_id`) REFERENCES `bukti_pembelajaran`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "perubahan_pemahaman_score_check" CHECK("perubahan_pemahaman"."previous_score" >= 0 AND "perubahan_pemahaman"."previous_score" <= 100 AND "perubahan_pemahaman"."next_score" >= 0 AND "perubahan_pemahaman"."next_score" <= 100),
	CONSTRAINT "perubahan_pemahaman_confidence_check" CHECK("perubahan_pemahaman"."previous_confidence" >= 0 AND "perubahan_pemahaman"."previous_confidence" <= 100 AND "perubahan_pemahaman"."next_confidence" >= 0 AND "perubahan_pemahaman"."next_confidence" <= 100)
);
--> statement-breakpoint
CREATE INDEX `perubahan_pemahaman_ide_idx` ON `perubahan_pemahaman` (`pemahaman_ide_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `publikasi_bundle` (
	`id` text PRIMARY KEY NOT NULL,
	`impor_bundle_id` text NOT NULL,
	`approved_review_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`publication_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`published_by` text NOT NULL,
	`published_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`impor_bundle_id`) REFERENCES `impor_bundle`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`approved_review_id`) REFERENCES `review_bundle`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`published_by`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "publikasi_bundle_version_check" CHECK("publikasi_bundle"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publikasi_bundle_version_idx` ON `publikasi_bundle` (`impor_bundle_id`,`version`);--> statement-breakpoint
CREATE INDEX `publikasi_bundle_status_idx` ON `publikasi_bundle` (`status`);--> statement-breakpoint
CREATE TABLE `rekomendasi_flashcard` (
	`id` text PRIMARY KEY NOT NULL,
	`pengguna_id` text NOT NULL,
	`flashcard_id` text NOT NULL,
	`ide_id` text NOT NULL,
	`due_at` integer NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`pengguna_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`flashcard_id`) REFERENCES `flashcard`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ide_id`) REFERENCES `ide`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rekomendasi_flashcard_unique_idx` ON `rekomendasi_flashcard` (`pengguna_id`,`flashcard_id`,`due_at`);--> statement-breakpoint
CREATE INDEX `rekomendasi_flashcard_due_idx` ON `rekomendasi_flashcard` (`pengguna_id`,`due_at`);--> statement-breakpoint
CREATE TABLE `review_bundle` (
	`id` text PRIMARY KEY NOT NULL,
	`impor_bundle_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	`reviewed_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`impor_bundle_id`) REFERENCES `impor_bundle`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_bundle_reviewer_idx` ON `review_bundle` (`impor_bundle_id`,`reviewer_id`);--> statement-breakpoint
CREATE INDEX `review_bundle_status_idx` ON `review_bundle` (`status`);--> statement-breakpoint
CREATE TABLE `review_flashcard` (
	`id` text PRIMARY KEY NOT NULL,
	`kemajuan_flashcard_murid_id` text NOT NULL,
	`grade` integer NOT NULL,
	`response_ms` integer,
	`previous_due_at` integer NOT NULL,
	`next_due_at` integer NOT NULL,
	`reviewed_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`kemajuan_flashcard_murid_id`) REFERENCES `kemajuan_flashcard_murid`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "review_flashcard_grade_check" CHECK("review_flashcard"."grade" >= 0 AND "review_flashcard"."grade" <= 5),
	CONSTRAINT "review_flashcard_response_check" CHECK("review_flashcard"."response_ms" IS NULL OR "review_flashcard"."response_ms" >= 0)
);
--> statement-breakpoint
CREATE INDEX `review_flashcard_progress_idx` ON `review_flashcard` (`kemajuan_flashcard_murid_id`,`reviewed_at`);--> statement-breakpoint
CREATE TABLE `set_flashcard` (
	`id` text PRIMARY KEY NOT NULL,
	`mata_kuliah_id` text NOT NULL,
	`bab_id` text,
	`title` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
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
	CONSTRAINT "set_flashcard_version_check" CHECK("set_flashcard"."version" > 0),
	CONSTRAINT "set_flashcard_status_check" CHECK("set_flashcard"."status" IN ('draft', 'in_review', 'published', 'retired'))
);
--> statement-breakpoint
CREATE INDEX `set_flashcard_course_idx` ON `set_flashcard` (`mata_kuliah_id`);--> statement-breakpoint
CREATE INDEX `set_flashcard_chapter_idx` ON `set_flashcard` (`bab_id`);--> statement-breakpoint
CREATE INDEX `set_flashcard_status_version_idx` ON `set_flashcard` (`status`,`version`);--> statement-breakpoint
CREATE TABLE `soal` (
	`id` text PRIMARY KEY NOT NULL,
	`mata_kuliah_id` text NOT NULL,
	`bab_id` text,
	`question_type` text NOT NULL,
	`prompt` text NOT NULL,
	`options_snapshot` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`difficulty` text NOT NULL,
	`cognitive_level` text NOT NULL,
	`reasoning_pattern` text NOT NULL,
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
	CONSTRAINT "soal_version_check" CHECK("soal"."version" > 0),
	CONSTRAINT "soal_status_check" CHECK("soal"."status" IN ('draft', 'in_review', 'published', 'retired'))
);
--> statement-breakpoint
CREATE INDEX `soal_course_idx` ON `soal` (`mata_kuliah_id`);--> statement-breakpoint
CREATE INDEX `soal_chapter_idx` ON `soal` (`bab_id`);--> statement-breakpoint
CREATE INDEX `soal_status_version_idx` ON `soal` (`status`,`version`);--> statement-breakpoint
CREATE TABLE `soal_ide` (
	`id` text PRIMARY KEY NOT NULL,
	`soal_id` text NOT NULL,
	`ide_id` text NOT NULL,
	`weight` real NOT NULL,
	`role` text DEFAULT 'supporting' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`soal_id`) REFERENCES `soal`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ide_id`) REFERENCES `ide`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "soal_ide_weight_check" CHECK("soal_ide"."weight" > 0 AND "soal_ide"."weight" <= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `soal_ide_unique_idx` ON `soal_ide` (`soal_id`,`ide_id`);--> statement-breakpoint
CREATE INDEX `soal_ide_ide_idx` ON `soal_ide` (`ide_id`);--> statement-breakpoint
CREATE TABLE `soal_itb_referensi` (
	`id` text PRIMARY KEY NOT NULL,
	`soal_id` text,
	`source_label` text NOT NULL,
	`authoring_visibility` text NOT NULL,
	`content_snapshot` text NOT NULL,
	`checksum` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`soal_id`) REFERENCES `soal`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "soal_itb_referensi_visibility_check" CHECK("soal_itb_referensi"."authoring_visibility" IN ('allowed', 'holdout')),
	CONSTRAINT "soal_itb_referensi_version_check" CHECK("soal_itb_referensi"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `soal_itb_referensi_checksum_idx` ON `soal_itb_referensi` (`checksum`);--> statement-breakpoint
CREATE INDEX `soal_itb_referensi_visibility_idx` ON `soal_itb_referensi` (`authoring_visibility`);--> statement-breakpoint
CREATE TABLE `soal_relasi_ide` (
	`id` text PRIMARY KEY NOT NULL,
	`soal_id` text NOT NULL,
	`ide_id` text NOT NULL,
	`relation_type` text NOT NULL,
	`rationale` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`soal_id`) REFERENCES `soal`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ide_id`) REFERENCES `ide`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "soal_relasi_ide_type_check" CHECK("soal_relasi_ide"."relation_type" IN ('required', 'prerequisite', 'related'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `soal_relasi_ide_unique_idx` ON `soal_relasi_ide` (`soal_id`,`ide_id`,`relation_type`);--> statement-breakpoint
CREATE INDEX `soal_relasi_ide_ide_idx` ON `soal_relasi_ide` (`ide_id`);