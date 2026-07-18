ALTER TABLE `ai_usage_events` ADD `input_tokens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_usage_events` ADD `output_tokens` integer DEFAULT 0 NOT NULL;