CREATE TABLE "offline_cache_policy" (
	"id" text PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"settings" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offline_cache_policy_singleton" CHECK ("offline_cache_policy"."id" = 'default')
);
--> statement-breakpoint
CREATE TABLE "offline_content_changes" (
	"cursor" bigint PRIMARY KEY NOT NULL,
	"course_id" text,
	"user_id" text,
	"kind" text NOT NULL,
	"resource_id" text,
	"action" text NOT NULL,
	"revision" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offline_content_changes_action_check" CHECK ("offline_content_changes"."action" in ('upsert', 'delete', 'invalidate'))
);
--> statement-breakpoint
CREATE TABLE "offline_sync_state" (
	"id" text PRIMARY KEY NOT NULL,
	"cursor" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offline_sync_state_singleton" CHECK ("offline_sync_state"."id" = 'default')
);
--> statement-breakpoint
ALTER TABLE "offline_cache_policy" ADD CONSTRAINT "offline_cache_policy_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "offline_content_changes_course_cursor_idx" ON "offline_content_changes" USING btree ("course_id","cursor");--> statement-breakpoint
CREATE INDEX "offline_content_changes_user_cursor_idx" ON "offline_content_changes" USING btree ("user_id","cursor");--> statement-breakpoint
CREATE INDEX "offline_content_changes_created_idx" ON "offline_content_changes" USING btree ("created_at");