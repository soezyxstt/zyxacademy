CREATE TABLE "activity_notification_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"discussions_enabled" boolean DEFAULT true NOT NULL,
	"flashcards_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_notification_preferences" ADD CONSTRAINT "activity_notification_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
