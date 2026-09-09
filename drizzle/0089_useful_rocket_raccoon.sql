CREATE TABLE `booking_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`phase` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`file_name` text,
	`mime_type` text,
	`size_bytes` integer,
	`metadata` text,
	`created_by_id` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "booking_resources_phase_check" CHECK("booking_resources"."phase" IN ('pre', 'post')),
	CONSTRAINT "booking_resources_kind_check" CHECK("booking_resources"."kind" IN ('link', 'file', 'recording')),
	CONSTRAINT "booking_resources_size_check" CHECK("booking_resources"."size_bytes" IS NULL OR "booking_resources"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE INDEX `booking_resources_booking_idx` ON `booking_resources` (`booking_id`);--> statement-breakpoint
CREATE INDEX `booking_resources_booking_phase_idx` ON `booking_resources` (`booking_id`,`phase`);--> statement-breakpoint
CREATE INDEX `booking_resources_creator_idx` ON `booking_resources` (`created_by_id`);--> statement-breakpoint
CREATE INDEX `tutor_slots_tutor_date_idx` ON `tutor_slots` (`tutor_id`,`session_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `tutor_slots_exact_unique_idx` ON `tutor_slots` (`tutor_id`,`session_date`,`start_time`,`end_time`);