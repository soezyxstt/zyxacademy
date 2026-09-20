CREATE TABLE `discount_vouchers` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`discount_percent` integer NOT NULL,
	`max_quota` integer DEFAULT 1 NOT NULL,
	`used_quota` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discount_vouchers_code_unique` ON `discount_vouchers` (`code`);--> statement-breakpoint
CREATE INDEX `discount_vouchers_code_idx` ON `discount_vouchers` (`code`);--> statement-breakpoint
CREATE INDEX `discount_vouchers_is_active_idx` ON `discount_vouchers` (`is_active`);