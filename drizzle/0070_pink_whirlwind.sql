CREATE TABLE `academic_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text DEFAULT 'official_exam' NOT NULL,
	`title` text NOT NULL,
	`course_id` text,
	`description` text,
	`start_date` integer NOT NULL,
	`end_date` integer,
	`location` text,
	`created_by_id` text,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_academic_sched_type` ON `academic_schedules` (`type`);--> statement-breakpoint
CREATE INDEX `idx_academic_sched_course_id` ON `academic_schedules` (`course_id`);--> statement-breakpoint
CREATE INDEX `idx_academic_sched_start_date` ON `academic_schedules` (`start_date`);--> statement-breakpoint
CREATE TABLE `booking_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`group_id` text,
	`actor_id` text,
	`action` text NOT NULL,
	`summary` text NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_booking_audit_booking_id` ON `booking_audit_logs` (`booking_id`);--> statement-breakpoint
CREATE INDEX `idx_booking_audit_group_id` ON `booking_audit_logs` (`group_id`);--> statement-breakpoint
CREATE INDEX `idx_booking_audit_actor_id` ON `booking_audit_logs` (`actor_id`);--> statement-breakpoint
CREATE TABLE `booking_reschedule_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`group_id` text NOT NULL,
	`requested_by_id` text NOT NULL,
	`tutor_id` text,
	`type` text DEFAULT 'reschedule' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reason` text NOT NULL,
	`proposed_slot_id` text,
	`proposed_date` text,
	`decision_notes` text,
	`decided_at` integer,
	`decided_by_id` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tutor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`proposed_slot_id`) REFERENCES `tutor_slots`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`decided_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_reschedule_booking_id` ON `booking_reschedule_tickets` (`booking_id`);--> statement-breakpoint
CREATE INDEX `idx_reschedule_group_id` ON `booking_reschedule_tickets` (`group_id`);--> statement-breakpoint
CREATE INDEX `idx_reschedule_status` ON `booking_reschedule_tickets` (`status`);--> statement-breakpoint
CREATE TABLE `booking_ticket_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `booking_reschedule_tickets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_ticket_messages_ticket_id` ON `booking_ticket_messages` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `idx_ticket_messages_sender_id` ON `booking_ticket_messages` (`sender_id`);--> statement-breakpoint
CREATE TABLE `group_courses` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`course_id` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `group_courses_group_idx` ON `group_courses` (`group_id`);--> statement-breakpoint
CREATE INDEX `group_courses_course_idx` ON `group_courses` (`course_id`);--> statement-breakpoint
ALTER TABLE `bookings` ADD `status` text DEFAULT 'scheduled' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `session_date` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `start_time` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `end_time` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `mode` text DEFAULT 'online' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `location` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `google_meet_url` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `google_meet_space_name` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `last_modified_by` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `bookings` ADD `last_modified_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `topic` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `pre_session_notes` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `pre_session_attachments` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `post_session_notes` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `post_session_attachments` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `post_session_link_url` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `post_session_link_title` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `post_session_link_description` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `post_session_link_image` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `completed_at` integer;--> statement-breakpoint
ALTER TABLE `bookings` ADD `completed_by_id` text REFERENCES user(id);--> statement-breakpoint
CREATE INDEX `bookings_status_idx` ON `bookings` (`status`);--> statement-breakpoint
CREATE INDEX `bookings_session_date_idx` ON `bookings` (`session_date`);--> statement-breakpoint
ALTER TABLE `group_members` ADD `role` text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE `groups` ADD `package_type` text DEFAULT 'reguler_15' NOT NULL;--> statement-breakpoint
ALTER TABLE `groups` ADD `package_name` text DEFAULT 'Paket Reguler (15 Sesi)' NOT NULL;--> statement-breakpoint
ALTER TABLE `groups` ADD `total_quota_sessions` integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE `groups` ADD `used_quota_sessions` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `groups` ADD `academic_year` text DEFAULT '2026/2027' NOT NULL;--> statement-breakpoint
ALTER TABLE `groups` ADD `semester` text DEFAULT 'Ganjil' NOT NULL;--> statement-breakpoint
ALTER TABLE `groups` ADD `start_date` integer;--> statement-breakpoint
ALTER TABLE `groups` ADD `end_date` integer;--> statement-breakpoint
ALTER TABLE `groups` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `groups` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `tutor_slots` ADD `mode` text DEFAULT 'online' NOT NULL;--> statement-breakpoint
ALTER TABLE `tutor_slots` ADD `location` text;--> statement-breakpoint
ALTER TABLE `tutor_slots` ADD `session_date` text;