CREATE TABLE `ai_generation_traces` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`use_case` text,
	`stage_id` text NOT NULL,
	`prompt_version` text NOT NULL,
	`policy_version` text NOT NULL,
	`input_schema_version` text NOT NULL,
	`output_schema_version` text NOT NULL,
	`validator_version` text NOT NULL,
	`sanitized_input_hash` text NOT NULL,
	`evidence_hash` text,
	`model` text NOT NULL,
	`route` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`terminal_outcome` text NOT NULL,
	`violation_codes` text,
	`latency_ms` integer DEFAULT 0 NOT NULL,
	`cache_result` text DEFAULT 'none' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_traces_user_created` ON `ai_generation_traces` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_traces_stage_prompt` ON `ai_generation_traces` (`stage_id`,`prompt_version`);