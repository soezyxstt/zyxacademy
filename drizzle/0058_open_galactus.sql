CREATE TABLE `alur_konten` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`course_id` text NOT NULL,
	`version` integer NOT NULL,
	`state` text NOT NULL,
	`content_hash` text NOT NULL,
	`assigned_tutor_id` text,
	`last_request_id` text NOT NULL,
	`last_reason` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`assigned_tutor_id`) REFERENCES `pengguna`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "alur_konten_version_check" CHECK("alur_konten"."version" > 0),
	CONSTRAINT "alur_konten_state_check" CHECK("alur_konten"."state" IN ('uploaded', 'validated', 'staged', 'tutor_review', 'changes_requested', 'admin_review', 'approved', 'published', 'superseded', 'withdrawn'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alur_konten_entity_version_idx` ON `alur_konten` (`entity_type`,`entity_id`,`version`);--> statement-breakpoint
CREATE INDEX `alur_konten_course_state_idx` ON `alur_konten` (`course_id`,`state`);