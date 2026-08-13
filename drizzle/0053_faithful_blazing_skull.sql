CREATE TABLE `asal_ide` (
	`id` text PRIMARY KEY NOT NULL,
	`ide_id` text NOT NULL,
	`source_chunk_id` text NOT NULL,
	`provenance_role` text DEFAULT 'supporting' NOT NULL,
	`start_offset` integer NOT NULL,
	`end_offset` integer NOT NULL,
	`source_checksum` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`ide_id`) REFERENCES `ide`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_chunk_id`) REFERENCES `potongan_sumber`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "asal_ide_offset_check" CHECK("asal_ide"."start_offset" >= 0 AND "asal_ide"."end_offset" > "asal_ide"."start_offset")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asal_ide_span_idx` ON `asal_ide` (`ide_id`,`source_chunk_id`,`start_offset`,`end_offset`);--> statement-breakpoint
CREATE INDEX `asal_ide_ide_idx` ON `asal_ide` (`ide_id`);--> statement-breakpoint
CREATE INDEX `asal_ide_source_idx` ON `asal_ide` (`source_chunk_id`);--> statement-breakpoint
CREATE TABLE `bab` (
	`id` text PRIMARY KEY NOT NULL,
	`mata_kuliah_id` text NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`order_index` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`legacy_chapter_id` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`mata_kuliah_id`) REFERENCES `mata_kuliah`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`legacy_chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "bab_order_index_check" CHECK("bab"."order_index" >= 0),
	CONSTRAINT "bab_status_check" CHECK("bab"."status" IN ('draft', 'active', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bab_course_code_idx` ON `bab` (`mata_kuliah_id`,`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `bab_course_order_idx` ON `bab` (`mata_kuliah_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `bab_legacy_chapter_idx` ON `bab` (`legacy_chapter_id`);--> statement-breakpoint
CREATE TABLE `ide` (
	`id` text PRIMARY KEY NOT NULL,
	`mata_kuliah_id` text NOT NULL,
	`bab_id` text NOT NULL,
	`concept_id` text,
	`stable_key` text NOT NULL,
	`code` text NOT NULL,
	`canonical_statement` text NOT NULL,
	`concise_explanation` text NOT NULL,
	`latex` text,
	`knowledge_kind` text DEFAULT 'other' NOT NULL,
	`instructional_role` text DEFAULT 'core' NOT NULL,
	`difficulty_metadata` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`source_policy` text DEFAULT 'source_grounded' NOT NULL,
	`schema_version` text DEFAULT '1.0' NOT NULL,
	`semantic_hash` text NOT NULL,
	`generation_hash` text NOT NULL,
	`creator_id` text NOT NULL,
	`curator_id` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`mata_kuliah_id`) REFERENCES `mata_kuliah`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`bab_id`) REFERENCES `bab`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`creator_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`curator_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ide_version_check" CHECK("ide"."version" > 0),
	CONSTRAINT "ide_status_check" CHECK("ide"."status" IN ('draft', 'published', 'needs_review', 'withdrawn', 'superseded')),
	CONSTRAINT "ide_source_policy_check" CHECK("ide"."source_policy" IN ('source_grounded', 'tutor_authored'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ide_stable_key_idx` ON `ide` (`stable_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `ide_course_code_idx` ON `ide` (`mata_kuliah_id`,`code`);--> statement-breakpoint
CREATE INDEX `ide_bab_idx` ON `ide` (`bab_id`);--> statement-breakpoint
CREATE INDEX `ide_concept_idx` ON `ide` (`concept_id`);--> statement-breakpoint
CREATE INDEX `ide_status_idx` ON `ide` (`status`);--> statement-breakpoint
CREATE TABLE `ketergantungan_produk` (
	`id` text PRIMARY KEY NOT NULL,
	`upstream_entity_type` text NOT NULL,
	`upstream_entity_id` text NOT NULL,
	`upstream_version` integer NOT NULL,
	`upstream_hash` text NOT NULL,
	`downstream_entity_type` text NOT NULL,
	`downstream_entity_id` text NOT NULL,
	`downstream_version` integer NOT NULL,
	`downstream_hash` text NOT NULL,
	`freshness` text DEFAULT 'UP_TO_DATE' NOT NULL,
	`reason` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	CONSTRAINT "ketergantungan_produk_upstream_version_check" CHECK("ketergantungan_produk"."upstream_version" > 0),
	CONSTRAINT "ketergantungan_produk_downstream_version_check" CHECK("ketergantungan_produk"."downstream_version" > 0),
	CONSTRAINT "ketergantungan_produk_freshness_check" CHECK("ketergantungan_produk"."freshness" IN ('UP_TO_DATE', 'NEEDS_REVIEW', 'STALE')),
	CONSTRAINT "ketergantungan_produk_no_self_check" CHECK(NOT ("ketergantungan_produk"."upstream_entity_type" = "ketergantungan_produk"."downstream_entity_type" AND "ketergantungan_produk"."upstream_entity_id" = "ketergantungan_produk"."downstream_entity_id"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ketergantungan_produk_edge_idx` ON `ketergantungan_produk` (`upstream_entity_type`,`upstream_entity_id`,`downstream_entity_type`,`downstream_entity_id`);--> statement-breakpoint
CREATE INDEX `ketergantungan_produk_upstream_idx` ON `ketergantungan_produk` (`upstream_entity_type`,`upstream_entity_id`);--> statement-breakpoint
CREATE INDEX `ketergantungan_produk_downstream_idx` ON `ketergantungan_produk` (`downstream_entity_type`,`downstream_entity_id`);--> statement-breakpoint
CREATE TABLE `mata_kuliah` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`legacy_course_id` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`legacy_course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "mata_kuliah_status_check" CHECK("mata_kuliah"."status" IN ('draft', 'active', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mata_kuliah_code_idx` ON `mata_kuliah` (`code`);--> statement-breakpoint
CREATE INDEX `mata_kuliah_legacy_course_idx` ON `mata_kuliah` (`legacy_course_id`);--> statement-breakpoint
CREATE TABLE `pendaftaran_murid` (
	`id` text PRIMARY KEY NOT NULL,
	`pengguna_id` text NOT NULL,
	`mata_kuliah_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`start_at` integer,
	`end_at` integer,
	`legacy_enrollment_id` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`pengguna_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`mata_kuliah_id`) REFERENCES `mata_kuliah`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`legacy_enrollment_id`) REFERENCES `enrollments`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "pendaftaran_murid_status_check" CHECK("pendaftaran_murid"."status" IN ('pending', 'active', 'completed', 'cancelled', 'expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pendaftaran_murid_legacy_idx` ON `pendaftaran_murid` (`legacy_enrollment_id`);--> statement-breakpoint
CREATE INDEX `pendaftaran_murid_pengguna_idx` ON `pendaftaran_murid` (`pengguna_id`);--> statement-breakpoint
CREATE INDEX `pendaftaran_murid_mata_kuliah_idx` ON `pendaftaran_murid` (`mata_kuliah_id`);--> statement-breakpoint
CREATE TABLE `penugasan_tutor` (
	`id` text PRIMARY KEY NOT NULL,
	`pengguna_id` text NOT NULL,
	`mata_kuliah_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`assignment_scope` text DEFAULT 'course' NOT NULL,
	`legacy_tutor_course_id` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`pengguna_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`mata_kuliah_id`) REFERENCES `mata_kuliah`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`legacy_tutor_course_id`) REFERENCES `tutor_courses`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "penugasan_tutor_status_check" CHECK("penugasan_tutor"."status" IN ('pending', 'active', 'suspended', 'ended', 'revoked')),
	CONSTRAINT "penugasan_tutor_scope_check" CHECK("penugasan_tutor"."assignment_scope" IN ('course', 'chapter', 'content'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `penugasan_tutor_legacy_idx` ON `penugasan_tutor` (`legacy_tutor_course_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `penugasan_tutor_scope_idx` ON `penugasan_tutor` (`pengguna_id`,`mata_kuliah_id`,`assignment_scope`);--> statement-breakpoint
CREATE INDEX `penugasan_tutor_pengguna_idx` ON `penugasan_tutor` (`pengguna_id`);--> statement-breakpoint
CREATE INDEX `penugasan_tutor_mata_kuliah_idx` ON `penugasan_tutor` (`mata_kuliah_id`);--> statement-breakpoint
CREATE TABLE `peta_id_legacy` (
	`id` text PRIMARY KEY NOT NULL,
	`legacy_table` text NOT NULL,
	`legacy_id` text NOT NULL,
	`target_table` text NOT NULL,
	`target_id` text NOT NULL,
	`mapping_version` integer NOT NULL,
	`source_checksum` text NOT NULL,
	`target_checksum` text NOT NULL,
	`run_id` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `migration_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "peta_id_legacy_mapping_version_check" CHECK("peta_id_legacy"."mapping_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `peta_id_legacy_source_idx` ON `peta_id_legacy` (`legacy_table`,`legacy_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `peta_id_legacy_target_idx` ON `peta_id_legacy` (`target_table`,`target_id`);--> statement-breakpoint
CREATE INDEX `peta_id_legacy_run_idx` ON `peta_id_legacy` (`run_id`);--> statement-breakpoint
CREATE TABLE `potongan_sumber` (
	`id` text PRIMARY KEY NOT NULL,
	`sumber_materi_id` text NOT NULL,
	`source_version` integer NOT NULL,
	`content` text NOT NULL,
	`page_number` integer,
	`section_locator` text,
	`start_offset` integer NOT NULL,
	`end_offset` integer NOT NULL,
	`checksum` text NOT NULL,
	`embedding_eligible` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`sumber_materi_id`) REFERENCES `sumber_materi`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "potongan_sumber_version_check" CHECK("potongan_sumber"."source_version" > 0),
	CONSTRAINT "potongan_sumber_offset_check" CHECK("potongan_sumber"."start_offset" >= 0 AND "potongan_sumber"."end_offset" > "potongan_sumber"."start_offset"),
	CONSTRAINT "potongan_sumber_page_check" CHECK("potongan_sumber"."page_number" IS NULL OR "potongan_sumber"."page_number" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `potongan_sumber_span_idx` ON `potongan_sumber` (`sumber_materi_id`,`source_version`,`start_offset`,`end_offset`);--> statement-breakpoint
CREATE INDEX `potongan_sumber_source_idx` ON `potongan_sumber` (`sumber_materi_id`,`source_version`);--> statement-breakpoint
CREATE TABLE `relasi_ide` (
	`id` text PRIMARY KEY NOT NULL,
	`source_idea_id` text NOT NULL,
	`target_idea_id` text NOT NULL,
	`relation_type` text NOT NULL,
	`explanation` text,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`source_idea_id`) REFERENCES `ide`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_idea_id`) REFERENCES `ide`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "relasi_ide_no_self_check" CHECK("relasi_ide"."source_idea_id" <> "relasi_ide"."target_idea_id"),
	CONSTRAINT "relasi_ide_version_check" CHECK("relasi_ide"."version" > 0),
	CONSTRAINT "relasi_ide_type_check" CHECK("relasi_ide"."relation_type" IN ('prerequisite', 'related', 'extends', 'example_of', 'misconception_of'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `relasi_ide_unique_idx` ON `relasi_ide` (`source_idea_id`,`target_idea_id`,`relation_type`);--> statement-breakpoint
CREATE INDEX `relasi_ide_source_idx` ON `relasi_ide` (`source_idea_id`);--> statement-breakpoint
CREATE INDEX `relasi_ide_target_idx` ON `relasi_ide` (`target_idea_id`);--> statement-breakpoint
CREATE TABLE `sumber_materi` (
	`id` text PRIMARY KEY NOT NULL,
	`mata_kuliah_id` text NOT NULL,
	`bab_id` text,
	`source_type` text DEFAULT 'markdown' NOT NULL,
	`title` text NOT NULL,
	`canonical_uri_or_r2_key` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`checksum` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`creator_id` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`mata_kuliah_id`) REFERENCES `mata_kuliah`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`bab_id`) REFERENCES `bab`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`creator_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "sumber_materi_version_check" CHECK("sumber_materi"."version" > 0),
	CONSTRAINT "sumber_materi_source_type_check" CHECK("sumber_materi"."source_type" IN ('markdown', 'json', 'pdf', 'docx', 'html', 'url', 'transcript', 'tutor_note')),
	CONSTRAINT "sumber_materi_status_check" CHECK("sumber_materi"."status" IN ('draft', 'active', 'withdrawn', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sumber_materi_version_idx` ON `sumber_materi` (`mata_kuliah_id`,`canonical_uri_or_r2_key`,`version`);--> statement-breakpoint
CREATE INDEX `sumber_materi_bab_idx` ON `sumber_materi` (`bab_id`);--> statement-breakpoint
CREATE INDEX `sumber_materi_status_idx` ON `sumber_materi` (`status`);