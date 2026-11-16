CREATE TABLE "discussion_notification_deliveries" (
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"staff_only" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"retry_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discussion_notification_deliveries_event_id_user_id_pk" PRIMARY KEY("event_id","user_id"),
	CONSTRAINT "discussion_notification_deliveries_attempts_check" CHECK ("discussion_notification_deliveries"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "discussion_attachments" ADD COLUMN "preview_storage_key" text;--> statement-breakpoint
ALTER TABLE "discussion_attachments" ADD COLUMN "preview_size" integer;--> statement-breakpoint
ALTER TABLE "discussion_threads" ADD COLUMN "answer_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discussion_notification_deliveries" ADD CONSTRAINT "discussion_notification_deliveries_event_id_discussion_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."discussion_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discussion_notification_deliveries_retry_idx" ON "discussion_notification_deliveries" USING btree ("event_id","retry_at","user_id");--> statement-breakpoint
CREATE INDEX "discussion_threads_activity_idx" ON "discussion_threads" USING btree ("last_activity_at","id");--> statement-breakpoint
ALTER TABLE "discussion_attachments" ADD CONSTRAINT "discussion_attachments_preview_check" CHECK ("discussion_attachments"."preview_size" is null or ("discussion_attachments"."preview_storage_key" is not null and "discussion_attachments"."preview_size" > 0 and "discussion_attachments"."preview_size" <= 131072));--> statement-breakpoint
ALTER TABLE "discussion_threads" ADD CONSTRAINT "discussion_threads_answer_count_check" CHECK ("discussion_threads"."answer_count" >= 0);