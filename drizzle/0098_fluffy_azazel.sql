CREATE TABLE `authoring_transfer` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`session_id` text NOT NULL,
	`source_peer_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`plan_hash` text NOT NULL,
	`plan` text NOT NULL,
	`sealed_grant` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`state_version` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`reason_code` text,
	`receipt` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `authoring_transfer_request_idx` ON `authoring_transfer` (`actor_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `authoring_transfer_state_idx` ON `authoring_transfer` (`state`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `authoring_transfer_grant` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`session_id` text NOT NULL,
	`target_peer_id` text NOT NULL,
	`inventory` text NOT NULL,
	`claim_until` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked` integer DEFAULT false NOT NULL,
	`claimed_transfer_id` text,
	`snapshot_ready` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `authoring_transfer_grant_expiry_idx` ON `authoring_transfer_grant` (`expires_at`);--> statement-breakpoint
CREATE TABLE `authoring_transfer_item` (
	`transfer_id` text NOT NULL,
	`artifact_id` text NOT NULL,
	`descriptor` text NOT NULL,
	`quarantine_key` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`target_import_id` text,
	`owned` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`transfer_id`, `artifact_id`),
	FOREIGN KEY (`transfer_id`) REFERENCES `authoring_transfer`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `authoring_transfer_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`transfer_id` text NOT NULL,
	`delivered` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`transfer_id`) REFERENCES `authoring_transfer`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `authoring_transfer_outbox_pending_idx` ON `authoring_transfer_outbox` (`delivered`);