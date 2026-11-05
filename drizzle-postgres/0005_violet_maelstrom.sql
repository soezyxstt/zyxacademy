CREATE TABLE "admin_operation_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"session_id" text NOT NULL,
	"kind" text NOT NULL,
	"required_scope" text NOT NULL,
	"environment" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"result" jsonb,
	"error_code" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_operation_jobs" ADD CONSTRAINT "admin_operation_jobs_actor_id_pengguna_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."pengguna"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_operation_jobs_queue_idx" ON "admin_operation_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "admin_operation_jobs_actor_idx" ON "admin_operation_jobs" USING btree ("actor_id","created_at");