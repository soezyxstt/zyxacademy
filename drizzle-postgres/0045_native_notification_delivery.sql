CREATE TABLE "deferred_notification_pushes" (
	"notification_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"deliver_after" timestamp with time zone NOT NULL,
	"claim_id" text,
	"lease_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_quiet_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"start_minute" integer DEFAULT 1320 NOT NULL,
	"end_minute" integer DEFAULT 420 NOT NULL,
	"time_zone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_quiet_minutes_check" CHECK ("notification_quiet_preferences"."start_minute" between 0 and 1439 and "notification_quiet_preferences"."end_minute" between 0 and 1439 and "notification_quiet_preferences"."start_minute" <> "notification_quiet_preferences"."end_minute")
);
--> statement-breakpoint
ALTER TABLE "user_push_tokens" ADD COLUMN "session_id" text;--> statement-breakpoint
ALTER TABLE "deferred_notification_pushes" ADD CONSTRAINT "deferred_notification_pushes_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deferred_notification_pushes" ADD CONSTRAINT "deferred_notification_pushes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_quiet_preferences" ADD CONSTRAINT "notification_quiet_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deferred_notification_pushes_due_idx" ON "deferred_notification_pushes" USING btree ("deliver_after","user_id");--> statement-breakpoint
CREATE INDEX "deferred_notification_pushes_user_idx" ON "deferred_notification_pushes" USING btree ("user_id","deliver_after");--> statement-breakpoint
ALTER TABLE "user_push_tokens" ADD CONSTRAINT "user_push_tokens_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_push_tokens_session" ON "user_push_tokens" USING btree ("session_id");
