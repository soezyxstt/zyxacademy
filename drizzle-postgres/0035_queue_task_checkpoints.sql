CREATE TABLE "queue_task_checkpoints" (
	"task" text NOT NULL,
	"step" text NOT NULL,
	"value" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "queue_task_checkpoints_task_step_pk" PRIMARY KEY("task","step")
);
--> statement-breakpoint
CREATE INDEX "queue_task_checkpoints_recorded_at_idx" ON "queue_task_checkpoints" USING btree ("recorded_at");