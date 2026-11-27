ALTER TABLE "activity_notification_preferences" ADD COLUMN "tutor_availability_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_notification_preferences" ADD COLUMN "tutorial_session_email_enabled" boolean DEFAULT true NOT NULL;
