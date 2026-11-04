CREATE TABLE "public_demo_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_demo_snapshots_course_id_unique" UNIQUE("course_id")
);
--> statement-breakpoint
ALTER TABLE "public_demo_snapshots" ADD CONSTRAINT "public_demo_snapshots_course_id_mata_kuliah_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE cascade ON UPDATE no action;