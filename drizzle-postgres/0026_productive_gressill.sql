ALTER TABLE "discussion_events" ADD COLUMN "recipient_cursor" text;--> statement-breakpoint
ALTER TABLE "discussion_events" ADD COLUMN "retry_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "discussion_threads" ADD COLUMN "help_kind" text;--> statement-breakpoint
CREATE INDEX "discussion_events_retry_idx" ON "discussion_events" USING btree ("status","retry_at","created_at","id");--> statement-breakpoint
ALTER TABLE "discussion_threads" ADD CONSTRAINT "discussion_threads_help_kind_check" CHECK ("discussion_threads"."help_kind" is null or "discussion_threads"."help_kind" in ('academic', 'bug', 'feature', 'operations'));