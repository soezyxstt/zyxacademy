PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bukti_pdf_bundle` (
	`id` text PRIMARY KEY NOT NULL,
	`impor_bundle_id` text NOT NULL,
	`product_id` text NOT NULL,
	`article_version` integer NOT NULL,
	`article_hash` text NOT NULL,
	`diktat_hash` text NOT NULL,
	`renderer_version` text NOT NULL,
	`print_profile` text NOT NULL,
	`storage_key` text,
	`page_count` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`failure_code` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`impor_bundle_id`) REFERENCES `impor_bundle`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "bukti_pdf_bundle_page_count_check" CHECK("__new_bukti_pdf_bundle"."page_count" IS NULL OR ("__new_bukti_pdf_bundle"."page_count" >= 1 AND "__new_bukti_pdf_bundle"."page_count" <= 4)),
	CONSTRAINT "bukti_pdf_bundle_status_check" CHECK("__new_bukti_pdf_bundle"."status" IN ('pending', 'ready', 'failed', 'stale')),
	CONSTRAINT "bukti_pdf_bundle_article_version_check" CHECK("__new_bukti_pdf_bundle"."article_version" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_bukti_pdf_bundle`("id", "impor_bundle_id", "product_id", "article_version", "article_hash", "diktat_hash", "renderer_version", "print_profile", "storage_key", "page_count", "status", "failure_code", "created_at", "updated_at") SELECT "id", "impor_bundle_id", "product_id", "article_version", "article_hash", "diktat_hash", "renderer_version", "print_profile", "storage_key", "page_count", "status", "failure_code", "created_at", "updated_at" FROM `bukti_pdf_bundle`;--> statement-breakpoint
DROP TABLE `bukti_pdf_bundle`;--> statement-breakpoint
ALTER TABLE `__new_bukti_pdf_bundle` RENAME TO `bukti_pdf_bundle`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `bukti_pdf_bundle_lineage_idx` ON `bukti_pdf_bundle` (`impor_bundle_id`,`product_id`,`diktat_hash`,`print_profile`);--> statement-breakpoint
CREATE INDEX `bukti_pdf_bundle_import_idx` ON `bukti_pdf_bundle` (`impor_bundle_id`);--> statement-breakpoint
CREATE INDEX `bukti_pdf_bundle_product_idx` ON `bukti_pdf_bundle` (`product_id`);--> statement-breakpoint
CREATE INDEX `bukti_pdf_bundle_status_idx` ON `bukti_pdf_bundle` (`status`);--> statement-breakpoint
CREATE INDEX `bukti_pdf_bundle_diktat_hash_idx` ON `bukti_pdf_bundle` (`diktat_hash`);--> statement-breakpoint
CREATE INDEX `bukti_pdf_bundle_article_hash_idx` ON `bukti_pdf_bundle` (`article_hash`);