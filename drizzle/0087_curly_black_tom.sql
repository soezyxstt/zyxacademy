CREATE TABLE `bukti_pdf_bundle` (
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
	FOREIGN KEY (`impor_bundle_id`) REFERENCES `impor_bundle`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bukti_pdf_bundle_import_idx` ON `bukti_pdf_bundle` (`impor_bundle_id`);--> statement-breakpoint
CREATE INDEX `bukti_pdf_bundle_product_idx` ON `bukti_pdf_bundle` (`product_id`);--> statement-breakpoint
CREATE INDEX `bukti_pdf_bundle_status_idx` ON `bukti_pdf_bundle` (`status`);--> statement-breakpoint
CREATE INDEX `bukti_pdf_bundle_diktat_hash_idx` ON `bukti_pdf_bundle` (`diktat_hash`);--> statement-breakpoint
CREATE TABLE `review_pedagogi_bundle` (
	`id` text PRIMARY KEY NOT NULL,
	`impor_bundle_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`content_fingerprint` text NOT NULL,
	`policy_version` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`rubric` text NOT NULL,
	`exceptions` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`impor_bundle_id`) REFERENCES `impor_bundle`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `review_pedagogi_bundle_import_idx` ON `review_pedagogi_bundle` (`impor_bundle_id`);--> statement-breakpoint
CREATE INDEX `review_pedagogi_bundle_reviewer_idx` ON `review_pedagogi_bundle` (`reviewer_id`);--> statement-breakpoint
CREATE INDEX `review_pedagogi_bundle_fingerprint_idx` ON `review_pedagogi_bundle` (`content_fingerprint`);--> statement-breakpoint
CREATE INDEX `review_pedagogi_bundle_status_idx` ON `review_pedagogi_bundle` (`status`);