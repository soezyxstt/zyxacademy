CREATE TABLE `review_item_bundle` (
	`id` text PRIMARY KEY NOT NULL,
	`impor_bundle_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`product_id` text NOT NULL,
	`block_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`impor_bundle_id`) REFERENCES `impor_bundle`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_item_bundle_target_idx` ON `review_item_bundle` (`impor_bundle_id`,`reviewer_id`,`product_id`,`block_id`);--> statement-breakpoint
CREATE INDEX `review_item_bundle_import_idx` ON `review_item_bundle` (`impor_bundle_id`);--> statement-breakpoint
CREATE INDEX `review_item_bundle_status_idx` ON `review_item_bundle` (`status`);