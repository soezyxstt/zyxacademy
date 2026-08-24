ALTER TABLE `live_quiz_sessions` ADD `delivery_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `live_quiz_sessions` ADD `delivered_at` integer;