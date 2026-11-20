CREATE TABLE "discussion_ai_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"requested_by_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"request_id" text NOT NULL,
	"result_text" text,
	"answer_message_id" text,
	"error_code" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discussion_ai_requests_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "discussion_ai_requests_message_kind_unique" UNIQUE("message_id","kind"),
	CONSTRAINT "discussion_ai_requests_values_check" CHECK ("discussion_ai_requests"."kind" in ('zyra', 'label') and "discussion_ai_requests"."status" in ('pending', 'processing', 'completed', 'failed', 'uncertain') and "discussion_ai_requests"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "discussion_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"uploader_id" text NOT NULL,
	"message_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"storage_key" text NOT NULL,
	"name" text NOT NULL,
	"mime" text,
	"size" integer,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "discussion_attachments_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "discussion_attachments_status_check" CHECK ("discussion_attachments"."status" in ('pending', 'ready', 'attached', 'deleting', 'failed') and ("discussion_attachments"."status" <> 'attached' or "discussion_attachments"."message_id" is not null)),
	CONSTRAINT "discussion_attachments_dimensions_check" CHECK (("discussion_attachments"."size" is null or "discussion_attachments"."size" > 0) and ("discussion_attachments"."width" is null or "discussion_attachments"."width" > 0) and ("discussion_attachments"."height" is null or "discussion_attachments"."height" > 0))
);
--> statement-breakpoint
CREATE TABLE "discussion_channel_preferences" (
	"user_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discussion_channel_preferences_user_id_channel_id_pk" PRIMARY KEY("user_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "discussion_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"course_id" text,
	"legacy_course_id" text,
	"requester_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discussion_channels_scope_check" CHECK (("discussion_channels"."kind" = 'global' and "discussion_channels"."course_id" is null and "discussion_channels"."legacy_course_id" is null and "discussion_channels"."requester_id" is null) or ("discussion_channels"."kind" = 'course' and ("discussion_channels"."course_id" is not null or "discussion_channels"."legacy_course_id" is not null) and "discussion_channels"."requester_id" is null) or ("discussion_channels"."kind" in ('technical', 'academic') and "discussion_channels"."requester_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "discussion_events" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"message_id" text,
	"actor_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	CONSTRAINT "discussion_events_values_check" CHECK ("discussion_events"."kind" in ('question', 'message', 'edit', 'delete', 'resolved', 'report') and "discussion_events"."status" in ('pending', 'processing', 'completed', 'failed') and "discussion_events"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "discussion_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"author_id" text,
	"kind" text NOT NULL,
	"message_type" text NOT NULL,
	"body" text NOT NULL,
	"seq" integer NOT NULL,
	"request_id" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"reply_to_id" text,
	"forwarded_from_id" text,
	"skin_id" text,
	"mention_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ask_zyra" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"deleted_by_id" text,
	CONSTRAINT "discussion_messages_thread_seq_unique" UNIQUE("thread_id","seq"),
	CONSTRAINT "discussion_messages_kind_check" CHECK (("discussion_messages"."kind" = 'human' and "discussion_messages"."author_id" is not null) or ("discussion_messages"."kind" = 'zyra' and "discussion_messages"."author_id" is null and "discussion_messages"."message_type" = 'answer' and not "discussion_messages"."ask_zyra")),
	CONSTRAINT "discussion_messages_type_check" CHECK (("discussion_messages"."message_type" in ('question', 'answer') and "discussion_messages"."reply_to_id" is null and "discussion_messages"."forwarded_from_id" is null) or ("discussion_messages"."message_type" = 'reply' and "discussion_messages"."reply_to_id" is not null and "discussion_messages"."forwarded_from_id" is null) or ("discussion_messages"."message_type" = 'forward' and "discussion_messages"."reply_to_id" is null and "discussion_messages"."forwarded_from_id" is not null)),
	CONSTRAINT "discussion_messages_values_check" CHECK ("discussion_messages"."seq" > 0 and "discussion_messages"."revision" > 0 and length("discussion_messages"."request_id") > 0 and jsonb_typeof("discussion_messages"."mention_ids") = 'array' and (("discussion_messages"."deleted_at" is null) = ("discussion_messages"."deleted_by_id" is null)))
);
--> statement-breakpoint
CREATE TABLE "discussion_reactions" (
	"message_id" text NOT NULL,
	"user_id" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discussion_reactions_message_id_user_id_emoji_pk" PRIMARY KEY("message_id","user_id","emoji")
);
--> statement-breakpoint
CREATE TABLE "discussion_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"reporter_id" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_id" text,
	CONSTRAINT "discussion_reports_status_check" CHECK (("discussion_reports"."status" = 'pending' and "discussion_reports"."resolved_at" is null and "discussion_reports"."resolved_by_id" is null) or ("discussion_reports"."status" in ('resolved', 'dismissed') and "discussion_reports"."resolved_at" is not null and "discussion_reports"."resolved_by_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "discussion_thread_reads" (
	"user_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"through_seq" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discussion_thread_reads_user_id_thread_id_pk" PRIMARY KEY("user_id","thread_id"),
	CONSTRAINT "discussion_thread_reads_seq_check" CHECK ("discussion_thread_reads"."through_seq" >= 0)
);
--> statement-breakpoint
CREATE TABLE "discussion_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"author_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_seq" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discussion_threads_status_check" CHECK ("discussion_threads"."status" in ('open', 'resolved')),
	CONSTRAINT "discussion_threads_sequence_check" CHECK ("discussion_threads"."next_seq" > 0),
	CONSTRAINT "discussion_threads_labels_check" CHECK (jsonb_typeof("discussion_threads"."labels") = 'array')
);
--> statement-breakpoint
ALTER TABLE "discussion_ai_requests" ADD CONSTRAINT "discussion_ai_requests_message_id_discussion_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."discussion_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_ai_requests" ADD CONSTRAINT "discussion_ai_requests_requested_by_id_user_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_ai_requests" ADD CONSTRAINT "discussion_ai_requests_answer_message_id_discussion_messages_id_fk" FOREIGN KEY ("answer_message_id") REFERENCES "public"."discussion_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_attachments" ADD CONSTRAINT "discussion_attachments_channel_id_discussion_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."discussion_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_attachments" ADD CONSTRAINT "discussion_attachments_uploader_id_user_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_attachments" ADD CONSTRAINT "discussion_attachments_message_id_discussion_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."discussion_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_channel_preferences" ADD CONSTRAINT "discussion_channel_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_channel_preferences" ADD CONSTRAINT "discussion_channel_preferences_channel_id_discussion_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."discussion_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_channels" ADD CONSTRAINT "discussion_channels_course_id_mata_kuliah_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_channels" ADD CONSTRAINT "discussion_channels_legacy_course_id_courses_id_fk" FOREIGN KEY ("legacy_course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_channels" ADD CONSTRAINT "discussion_channels_requester_id_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_events" ADD CONSTRAINT "discussion_events_channel_id_discussion_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."discussion_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_events" ADD CONSTRAINT "discussion_events_thread_id_discussion_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."discussion_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_events" ADD CONSTRAINT "discussion_events_message_id_discussion_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."discussion_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_events" ADD CONSTRAINT "discussion_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_messages" ADD CONSTRAINT "discussion_messages_thread_id_discussion_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."discussion_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_messages" ADD CONSTRAINT "discussion_messages_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_messages" ADD CONSTRAINT "discussion_messages_reply_to_id_discussion_messages_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."discussion_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_messages" ADD CONSTRAINT "discussion_messages_forwarded_from_id_discussion_messages_id_fk" FOREIGN KEY ("forwarded_from_id") REFERENCES "public"."discussion_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_messages" ADD CONSTRAINT "discussion_messages_skin_id_gamification_cosmetics_id_fk" FOREIGN KEY ("skin_id") REFERENCES "public"."gamification_cosmetics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_messages" ADD CONSTRAINT "discussion_messages_deleted_by_id_user_id_fk" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_reactions" ADD CONSTRAINT "discussion_reactions_message_id_discussion_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."discussion_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_reactions" ADD CONSTRAINT "discussion_reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_reports" ADD CONSTRAINT "discussion_reports_message_id_discussion_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."discussion_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_reports" ADD CONSTRAINT "discussion_reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_reports" ADD CONSTRAINT "discussion_reports_resolved_by_id_user_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_thread_reads" ADD CONSTRAINT "discussion_thread_reads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_thread_reads" ADD CONSTRAINT "discussion_thread_reads_thread_id_discussion_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."discussion_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_threads" ADD CONSTRAINT "discussion_threads_channel_id_discussion_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."discussion_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_threads" ADD CONSTRAINT "discussion_threads_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discussion_ai_requests_pending_idx" ON "discussion_ai_requests" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE INDEX "discussion_attachments_message_idx" ON "discussion_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "discussion_attachments_expiry_idx" ON "discussion_attachments" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "discussion_channels_global_unique" ON "discussion_channels" USING btree ("kind") WHERE "discussion_channels"."kind" = 'global';--> statement-breakpoint
CREATE UNIQUE INDEX "discussion_channels_course_unique" ON "discussion_channels" USING btree ("course_id") WHERE "discussion_channels"."kind" = 'course' and "discussion_channels"."course_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "discussion_channels_legacy_course_unique" ON "discussion_channels" USING btree ("legacy_course_id") WHERE "discussion_channels"."kind" = 'course' and "discussion_channels"."legacy_course_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "discussion_channels_team_canonical_unique" ON "discussion_channels" USING btree ("requester_id","kind","course_id") WHERE "discussion_channels"."kind" in ('technical', 'academic') and "discussion_channels"."course_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "discussion_channels_team_legacy_unique" ON "discussion_channels" USING btree ("requester_id","kind","legacy_course_id") WHERE "discussion_channels"."kind" in ('technical', 'academic') and "discussion_channels"."legacy_course_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "discussion_channels_team_general_unique" ON "discussion_channels" USING btree ("requester_id","kind") WHERE "discussion_channels"."kind" in ('technical', 'academic') and "discussion_channels"."course_id" is null and "discussion_channels"."legacy_course_id" is null;--> statement-breakpoint
CREATE INDEX "discussion_channels_requester_idx" ON "discussion_channels" USING btree ("requester_id","kind");--> statement-breakpoint
CREATE INDEX "discussion_events_pending_idx" ON "discussion_events" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE INDEX "discussion_events_thread_idx" ON "discussion_events" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "discussion_messages_actor_request_unique" ON "discussion_messages" USING btree ("author_id","request_id") WHERE "discussion_messages"."author_id" is not null;--> statement-breakpoint
CREATE INDEX "discussion_messages_thread_type_idx" ON "discussion_messages" USING btree ("thread_id","message_type","seq");--> statement-breakpoint
CREATE INDEX "discussion_messages_author_created_idx" ON "discussion_messages" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "discussion_reactions_user_idx" ON "discussion_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discussion_reports_pending_unique" ON "discussion_reports" USING btree ("message_id","reporter_id") WHERE "discussion_reports"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "discussion_reports_status_created_idx" ON "discussion_reports" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE INDEX "discussion_reports_reporter_created_idx" ON "discussion_reports" USING btree ("reporter_id","created_at");--> statement-breakpoint
CREATE INDEX "discussion_threads_channel_activity_idx" ON "discussion_threads" USING btree ("channel_id","last_activity_at","id");--> statement-breakpoint
CREATE INDEX "discussion_threads_author_idx" ON "discussion_threads" USING btree ("author_id");