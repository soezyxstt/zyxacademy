ALTER TABLE "user_push_tokens" ADD COLUMN IF NOT EXISTS "platform" text DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_push_tokens" ADD COLUMN IF NOT EXISTS "transport" text DEFAULT 'fcm' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_push_tokens_user_transport" ON "user_push_tokens" USING btree ("user_id","transport");
