CREATE TABLE "discussion_message_observations" (
	"message_id" text NOT NULL,
	"user_id" text NOT NULL,
	"revision" integer NOT NULL,
	CONSTRAINT "discussion_message_observations_message_id_user_id_pk" PRIMARY KEY("message_id","user_id"),
	CONSTRAINT "discussion_message_observations_revision_check" CHECK ("discussion_message_observations"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "discussion_thread_participants" (
	"thread_id" text NOT NULL,
	"user_id" text NOT NULL,
	"first_seq" integer NOT NULL,
	"first_created_at" timestamp with time zone NOT NULL,
	"earliest_created_at" timestamp with time zone NOT NULL,
	"earliest_created_seq" integer NOT NULL,
	CONSTRAINT "discussion_thread_participants_thread_id_user_id_pk" PRIMARY KEY("thread_id","user_id"),
	CONSTRAINT "discussion_thread_participants_bounds_check" CHECK ("discussion_thread_participants"."first_seq" > 0 and "discussion_thread_participants"."earliest_created_seq" >= "discussion_thread_participants"."first_seq" and "discussion_thread_participants"."earliest_created_at" <= "discussion_thread_participants"."first_created_at")
);
--> statement-breakpoint
ALTER TABLE "discussion_events" ADD COLUMN "message_revision" integer;--> statement-breakpoint
ALTER TABLE "discussion_events" ADD COLUMN "status_revision" integer;--> statement-breakpoint
ALTER TABLE "discussion_thread_reads" ADD COLUMN "seen_status_revision" integer;--> statement-breakpoint
ALTER TABLE "discussion_threads" ADD COLUMN "status_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discussion_message_observations" ADD CONSTRAINT "discussion_message_observations_message_id_discussion_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."discussion_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_message_observations" ADD CONSTRAINT "discussion_message_observations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_thread_participants" ADD CONSTRAINT "discussion_thread_participants_thread_id_discussion_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."discussion_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_thread_participants" ADD CONSTRAINT "discussion_thread_participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_threads" ADD CONSTRAINT "discussion_threads_status_revision_check" CHECK ("discussion_threads"."status_revision" >= 0);