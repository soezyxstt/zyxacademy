ALTER TABLE `search_documents` ADD `sync_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `search_documents` ADD `lease_id` text;--> statement-breakpoint
ALTER TABLE `search_documents` ADD `lease_expires_at` integer;--> statement-breakpoint
CREATE INDEX `idx_search_documents_sync_status` ON `search_documents` (`sync_status`);--> statement-breakpoint
ALTER TABLE `vector_sync_queue` ADD `lease_id` text;--> statement-breakpoint
ALTER TABLE `vector_sync_queue` ADD `lease_expires_at` integer;--> statement-breakpoint
CREATE INDEX `idx_vector_sync_lease` ON `vector_sync_queue` (`lease_expires_at`);