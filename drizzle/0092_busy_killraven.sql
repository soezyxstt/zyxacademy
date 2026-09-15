ALTER TABLE `ai_allowance_leases` ADD `access_tier` text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE `mata_kuliah` ADD `is_demo` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `mata_kuliah_single_demo_idx` ON `mata_kuliah` (`is_demo`) WHERE "mata_kuliah"."is_demo" = 1;