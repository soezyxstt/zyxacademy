CREATE TABLE "google_calendar_sync" (
  "target" text PRIMARY KEY NOT NULL,
  "user_id" text,
  "requested_at" timestamp with time zone,
  "last_synced_at" timestamp with time zone,
  "error" text,
  CONSTRAINT "google_calendar_sync_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
);
