CREATE TABLE IF NOT EXISTS "activity_notification_preferences" (
  "user_id" text PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  "discussions_enabled" boolean NOT NULL DEFAULT true,
  "flashcards_enabled" boolean NOT NULL DEFAULT true,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
