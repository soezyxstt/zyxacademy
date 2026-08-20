CREATE TABLE `email_notification_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email_enabled` integer DEFAULT true NOT NULL,
	`course_updates` integer DEFAULT true NOT NULL,
	`events_and_schedules` integer DEFAULT true NOT NULL,
	`learning_reminders` integer DEFAULT true NOT NULL,
	`news_and_offers` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
