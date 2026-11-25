CREATE TABLE IF NOT EXISTS "tutor_slot_courses" (
  "slot_id" text NOT NULL,
  "course_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tutor_slot_courses_slot_id_course_id_pk" PRIMARY KEY ("slot_id", "course_id"),
  CONSTRAINT "tutor_slot_courses_slot_id_tutor_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "tutor_slots"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tutor_slot_courses_slot_idx" ON "tutor_slot_courses" ("slot_id");
