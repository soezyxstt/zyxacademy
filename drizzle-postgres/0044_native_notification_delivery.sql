ALTER TABLE "user_push_tokens" ADD COLUMN "session_id" text REFERENCES "session"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX "idx_push_tokens_session" ON "user_push_tokens" ("session_id");
--> statement-breakpoint
CREATE TABLE "notification_quiet_preferences" (
 "user_id" text PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
 "enabled" boolean NOT NULL DEFAULT false,
 "start_minute" integer NOT NULL DEFAULT 1320,
 "end_minute" integer NOT NULL DEFAULT 420,
 "time_zone" text NOT NULL DEFAULT 'Asia/Jakarta',
 "updated_at" timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT "notification_quiet_minutes_check" CHECK ("start_minute" BETWEEN 0 AND 1439 AND "end_minute" BETWEEN 0 AND 1439 AND "start_minute" <> "end_minute")
);
--> statement-breakpoint
CREATE TABLE "deferred_notification_pushes" (
 "notification_id" text PRIMARY KEY REFERENCES "notifications"("id") ON DELETE CASCADE,
 "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
 "deliver_after" timestamptz NOT NULL,
 "claim_id" text,
 "lease_until" timestamptz
);
--> statement-breakpoint
CREATE INDEX "deferred_notification_pushes_due_idx" ON "deferred_notification_pushes" ("deliver_after", "user_id");
--> statement-breakpoint
CREATE INDEX "deferred_notification_pushes_user_idx" ON "deferred_notification_pushes" ("user_id", "deliver_after");
