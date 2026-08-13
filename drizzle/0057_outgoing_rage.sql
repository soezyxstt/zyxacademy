ALTER TABLE `pemahaman_ide` ADD `algorithm_version` text DEFAULT 'per-idea.v1' NOT NULL;--> statement-breakpoint
ALTER TABLE `pemahaman_ide` ADD `input_watermark` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `perubahan_pemahaman` ADD `evidence_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `perubahan_pemahaman` ADD `algorithm_version` text DEFAULT 'per-idea.v1' NOT NULL;--> statement-breakpoint
ALTER TABLE `perubahan_pemahaman` ADD `input_watermark` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `bukti_pembelajaran_idempotency_idx` ON `bukti_pembelajaran` (`evidence_source`,`source_id`,`ide_id`,`rubric_version`);