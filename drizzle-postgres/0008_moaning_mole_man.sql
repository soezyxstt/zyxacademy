CREATE TABLE "solution_collections" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"version" bigint NOT NULL,
	"course_id" text NOT NULL,
	"chapter_id" text NOT NULL,
	"import_id" text NOT NULL,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"trace" jsonb NOT NULL,
	"generation_hash" text NOT NULL,
	"status" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "solution_collections_version_check" CHECK ("solution_collections"."version" > 0),
	CONSTRAINT "solution_collections_status_check" CHECK ("solution_collections"."status" IN ('published', 'withdrawn'))
);
--> statement-breakpoint
ALTER TABLE "solution_collections" ADD CONSTRAINT "solution_collections_course_id_mata_kuliah_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solution_collections" ADD CONSTRAINT "solution_collections_chapter_id_bab_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."bab"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solution_collections" ADD CONSTRAINT "solution_collections_import_id_impor_bundle_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."impor_bundle"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "solution_collections_product_version_idx" ON "solution_collections" USING btree ("product_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "solution_collections_one_published_idx" ON "solution_collections" USING btree ("product_id") WHERE "solution_collections"."status" = 'published';--> statement-breakpoint
CREATE UNIQUE INDEX "solution_collections_import_idx" ON "solution_collections" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "solution_collections_course_chapter_status_idx" ON "solution_collections" USING btree ("course_id","chapter_id","status");