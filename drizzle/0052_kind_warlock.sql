CREATE TABLE `pengguna` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `pengguna_status_idx` ON `pengguna` (`status`);--> statement-breakpoint
CREATE TABLE `pengguna_peran` (
	`id` text PRIMARY KEY NOT NULL,
	`pengguna_id` text NOT NULL,
	`peran_id` text NOT NULL,
	`source` text NOT NULL,
	`audit_actor_pengguna_id` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`pengguna_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`peran_id`) REFERENCES `peran`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`audit_actor_pengguna_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pengguna_peran_unique_idx` ON `pengguna_peran` (`pengguna_id`,`peran_id`);--> statement-breakpoint
CREATE INDEX `pengguna_peran_pengguna_idx` ON `pengguna_peran` (`pengguna_id`);--> statement-breakpoint
CREATE INDEX `pengguna_peran_peran_idx` ON `pengguna_peran` (`peran_id`);--> statement-breakpoint
CREATE TABLE `peran` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `peran_code_unique` ON `peran` (`code`);