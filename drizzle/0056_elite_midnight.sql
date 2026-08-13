ALTER TABLE `impor_bundle` ADD `course_id` text REFERENCES courses(id);--> statement-breakpoint
ALTER TABLE `impor_bundle` ADD `validation_report` text NOT NULL;