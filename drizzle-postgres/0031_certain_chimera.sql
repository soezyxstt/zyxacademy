ALTER TABLE "discussion_channels" ADD COLUMN "count_revision" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discussion_messages" ADD COLUMN "submission_fingerprint" text;--> statement-breakpoint
ALTER TABLE "discussion_thread_participants" ADD COLUMN "channel_id" text;--> statement-breakpoint
ALTER TABLE "discussion_thread_participants" ADD CONSTRAINT "discussion_thread_participants_channel_id_discussion_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."discussion_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discussion_thread_participants_channel_user_thread_idx" ON "discussion_thread_participants" USING btree ("channel_id","user_id","thread_id");--> statement-breakpoint
ALTER TABLE "discussion_channels" ADD CONSTRAINT "discussion_channels_count_revision_check" CHECK ("discussion_channels"."count_revision" >= 0);