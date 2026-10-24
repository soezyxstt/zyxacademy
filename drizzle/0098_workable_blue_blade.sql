CREATE TABLE `account_locale_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`locale` text NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "account_locale_preferences_locale_check" CHECK("account_locale_preferences"."locale" in ('id', 'en'))
);
