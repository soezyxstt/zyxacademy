ALTER TABLE `submissions` ADD `attempt_number` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_submissions_user_exam_attempt` ON `submissions` (`user_id`,`exam_id`,`attempt_number`);