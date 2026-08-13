CREATE TABLE `zyra_learner_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`course_id` text NOT NULL,
	`pace` text,
	`representation` text,
	`explanation_length` text,
	`checkpoint_type` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_zyra_preferences_student_course` ON `zyra_learner_preferences` (`student_id`,`course_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_zyra_preferences_student_course` ON `zyra_learner_preferences` (`student_id`,`course_id`);--> statement-breakpoint
CREATE TABLE `zyra_learner_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`course_id` text NOT NULL,
	`profile_version` text DEFAULT 'zyra-personalization-v1' NOT NULL,
	`inferred_pace` text DEFAULT 'unknown' NOT NULL,
	`inferred_representation` text DEFAULT 'unknown' NOT NULL,
	`support_intensity` text DEFAULT 'unknown' NOT NULL,
	`explanation_length` text DEFAULT 'unknown' NOT NULL,
	`checkpoint_type` text DEFAULT 'unknown' NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`evidence_count` integer DEFAULT 0 NOT NULL,
	`reason_codes` text NOT NULL,
	`last_evidence_at` integer,
	`expires_at` integer,
	`reset_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_zyra_profile_student_course` ON `zyra_learner_profiles` (`student_id`,`course_id`);--> statement-breakpoint
CREATE INDEX `idx_zyra_profile_expiry` ON `zyra_learner_profiles` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_zyra_profile_student_course` ON `zyra_learner_profiles` (`student_id`,`course_id`);--> statement-breakpoint
CREATE TABLE `zyra_learning_events` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`course_id` text NOT NULL,
	`idea_id` text,
	`event_kind` text NOT NULL,
	`source_type` text NOT NULL,
	`evidence_ref` text,
	`outcome` text,
	`correctness` real,
	`response_latency_bucket` text DEFAULT 'unknown' NOT NULL,
	`hint_level` text DEFAULT 'unknown' NOT NULL,
	`representation` text DEFAULT 'unknown' NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`expires_at` integer,
	FOREIGN KEY (`student_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`idea_id`) REFERENCES `ide`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_zyra_event_student_course_created` ON `zyra_learning_events` (`student_id`,`course_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_zyra_event_student_course_kind` ON `zyra_learning_events` (`student_id`,`course_id`,`event_kind`);--> statement-breakpoint
CREATE INDEX `idx_zyra_event_idea` ON `zyra_learning_events` (`idea_id`);--> statement-breakpoint
CREATE TABLE `zyra_message_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`course_id` text NOT NULL,
	`session_id` text NOT NULL,
	`message_id` text,
	`object_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`sanitized_sha256` text NOT NULL,
	`sanitizer_version` text NOT NULL,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`failure_code` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL,
	`deleted_at` integer,
	`provider_dispatched_at` integer,
	FOREIGN KEY (`student_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `chat_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `tutor_chat_messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `zyra_message_attachments_object_key_unique` ON `zyra_message_attachments` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_zyra_attachment_owner_scope` ON `zyra_message_attachments` (`student_id`,`course_id`,`session_id`);--> statement-breakpoint
CREATE INDEX `idx_zyra_attachment_expiry` ON `zyra_message_attachments` (`expires_at`,`status`);--> statement-breakpoint
CREATE INDEX `idx_zyra_attachment_message` ON `zyra_message_attachments` (`message_id`);--> statement-breakpoint
CREATE TABLE `zyra_operational_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_version` text NOT NULL,
	`event_type` text NOT NULL,
	`actor_role` text NOT NULL,
	`route_class` text NOT NULL,
	`model_class` text NOT NULL,
	`project_fingerprint` text,
	`course_fingerprint` text,
	`result_code` text NOT NULL,
	`latency_bucket` text NOT NULL,
	`size_bucket` text NOT NULL,
	`cache_result` text NOT NULL,
	`attachment_count` integer DEFAULT 0 NOT NULL,
	`sanitizer_version` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_zyra_ops_event_type_created` ON `zyra_operational_events` (`event_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_zyra_ops_route_created` ON `zyra_operational_events` (`route_class`,`created_at`);--> statement-breakpoint
CREATE TABLE `zyra_proposal_events` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`reason_code` text NOT NULL,
	`diff_hash` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `zyra_proposals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_zyra_proposal_event_proposal` ON `zyra_proposal_events` (`proposal_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_zyra_proposal_event_actor` ON `zyra_proposal_events` (`actor_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `zyra_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`role` text NOT NULL,
	`proposal_type` text NOT NULL,
	`course_id` text,
	`scope` text NOT NULL,
	`evidence_refs` text NOT NULL,
	`precondition_snapshot` text NOT NULL,
	`operations` text NOT NULL,
	`learner_impact` text NOT NULL,
	`reversibility` text NOT NULL,
	`warnings` text NOT NULL,
	`proposer_trace` text NOT NULL,
	`validator_result` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`precondition_version` integer NOT NULL,
	`diff_hash` text NOT NULL,
	`audit_id` text,
	`failure_code` text,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`reviewed_at` integer,
	`confirmed_at` integer,
	`applied_at` integer,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_zyra_proposal_actor_status` ON `zyra_proposals` (`actor_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_zyra_proposal_course_status` ON `zyra_proposals` (`course_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_zyra_proposal_expiry` ON `zyra_proposals` (`expires_at`,`status`);