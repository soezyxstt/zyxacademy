CREATE TABLE `ai_allowance_leases` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`user_id` text NOT NULL,
	`peran` text NOT NULL,
	`feature` text NOT NULL,
	`app_day` text NOT NULL,
	`units` integer DEFAULT 1 NOT NULL,
	`interaction_units` integer DEFAULT 1 NOT NULL,
	`premium` integer DEFAULT false NOT NULL,
	`status` text NOT NULL,
	`control_plane_lease_id` text,
	`model` text,
	`request_type` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`run_id` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`dispatched_at` integer,
	`resolved_at` integer,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ai_allowance_leases_units_check" CHECK("ai_allowance_leases"."units" >= 0),
	CONSTRAINT "ai_allowance_leases_interaction_units_check" CHECK("ai_allowance_leases"."interaction_units" > 0),
	CONSTRAINT "ai_allowance_leases_status_check" CHECK("ai_allowance_leases"."status" IN ('reserved', 'dispatched', 'committed', 'refunded'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_allowance_leases_idempotency_idx` ON `ai_allowance_leases` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `ai_allowance_leases_user_day_idx` ON `ai_allowance_leases` (`user_id`,`app_day`);--> statement-breakpoint
CREATE INDEX `ai_allowance_leases_user_status_idx` ON `ai_allowance_leases` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `ai_allowance_leases_control_plane_idx` ON `ai_allowance_leases` (`control_plane_lease_id`);--> statement-breakpoint
CREATE INDEX `ai_allowance_leases_run_idx` ON `ai_allowance_leases` (`run_id`);