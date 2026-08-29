PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_audit_mutasi` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`before_snapshot` text,
	`after_snapshot` text,
	`correlation_id` text,
	`course_id` text,
	`outcome` text,
	`reason` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "audit_mutasi_outcome_check" CHECK("__new_audit_mutasi"."outcome" IS NULL OR "__new_audit_mutasi"."outcome" IN ('success', 'rejected', 'failed'))
);
--> statement-breakpoint
INSERT INTO `__new_audit_mutasi`("id", "actor_id", "entity_type", "entity_id", "action", "before_snapshot", "after_snapshot", "correlation_id", "created_at") SELECT "id", "actor_id", "entity_type", "entity_id", "action", "before_snapshot", "after_snapshot", "correlation_id", "created_at" FROM `audit_mutasi`;--> statement-breakpoint
DROP TABLE `audit_mutasi`;--> statement-breakpoint
ALTER TABLE `__new_audit_mutasi` RENAME TO `audit_mutasi`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `audit_mutasi_entity_idx` ON `audit_mutasi` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_mutasi_actor_idx` ON `audit_mutasi` (`actor_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_mutasi_course_outcome_idx` ON `audit_mutasi` (`course_id`,`outcome`,`created_at`);