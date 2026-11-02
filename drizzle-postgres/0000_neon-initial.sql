CREATE TABLE "academic_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text DEFAULT 'official_exam' NOT NULL,
	"title" text NOT NULL,
	"course_id" text,
	"description" text,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone,
	"location" text,
	"created_by_id" text,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_ops_knowledge_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"chunk_index" bigint NOT NULL,
	"locator" text NOT NULL,
	"heading_hierarchy" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"start_offset" bigint NOT NULL,
	"end_offset" bigint NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"vector_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_ops_knowledge_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"source_path" text NOT NULL,
	"source_type" text NOT NULL,
	"title" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"content_hash" text NOT NULL,
	"manifest_hash" text NOT NULL,
	"chunk_count" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" jsonb,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_ops_knowledge_sync_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text,
	"action" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" bigint DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_allowance_leases" (
	"id" text PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"user_id" text NOT NULL,
	"peran" text NOT NULL,
	"access_tier" text DEFAULT 'standard' NOT NULL,
	"feature" text NOT NULL,
	"app_day" text NOT NULL,
	"units" bigint DEFAULT 1 NOT NULL,
	"interaction_units" bigint DEFAULT 1 NOT NULL,
	"premium" boolean DEFAULT false NOT NULL,
	"status" text NOT NULL,
	"control_plane_lease_id" text,
	"model" text,
	"request_type" text NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ai_allowance_leases_units_check" CHECK ("ai_allowance_leases"."units" >= 0),
	CONSTRAINT "ai_allowance_leases_interaction_units_check" CHECK ("ai_allowance_leases"."interaction_units" > 0),
	CONSTRAINT "ai_allowance_leases_access_tier_check" CHECK ("ai_allowance_leases"."access_tier" IN ('standard', 'free')),
	CONSTRAINT "ai_allowance_leases_status_check" CHECK ("ai_allowance_leases"."status" IN ('reserved', 'dispatched', 'committed', 'refunded'))
);
--> statement-breakpoint
CREATE TABLE "ai_extraction_failures" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text,
	"chapter_id" text,
	"step" text NOT NULL,
	"raw_output" text NOT NULL,
	"error_message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_generation_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"tutor_id" text NOT NULL,
	"course_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"prompt_parameters" jsonb NOT NULL,
	"target_count" bigint NOT NULL,
	"generated_count" bigint DEFAULT 0 NOT NULL,
	"token_usage" bigint DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_generation_traces" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"use_case" text,
	"stage_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"policy_version" text NOT NULL,
	"input_schema_version" text NOT NULL,
	"output_schema_version" text NOT NULL,
	"validator_version" text NOT NULL,
	"sanitized_input_hash" text NOT NULL,
	"evidence_hash" text,
	"model" text NOT NULL,
	"route" text,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"retry_count" bigint DEFAULT 0 NOT NULL,
	"terminal_outcome" text NOT NULL,
	"violation_codes" text,
	"latency_ms" bigint DEFAULT 0 NOT NULL,
	"cache_result" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_material_instance_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"section_id" text NOT NULL,
	"chunk_text" text NOT NULL,
	"order_index" bigint NOT NULL,
	"pinecone_vector_id" text NOT NULL,
	"is_synced" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_material_instance_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"material_instance_id" text NOT NULL,
	"title" text,
	"order_index" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_material_instances" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"title" text NOT NULL,
	"source_type" text NOT NULL,
	"summary" text NOT NULL,
	"learning_objectives" jsonb NOT NULL,
	"keywords" jsonb NOT NULL,
	"chapter_ids" jsonb,
	"pinecone_sync_status" text DEFAULT 'pending' NOT NULL,
	"last_sync_error" text,
	"thumbnail_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_question_bank" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"source_section_id" text,
	"origin" text DEFAULT 'zyx_original' NOT NULL,
	"source_event_name" text,
	"source_reference_id" text,
	"assessment_source_id" text,
	"source_question_number" text,
	"source_question_part" text,
	"source_page" bigint,
	"answer_provenance" text,
	"solution_provenance" text,
	"quiz_eligible" boolean DEFAULT false NOT NULL,
	"knowledge_object_id" text,
	"source_mtd_id" text,
	"source_mtd_version" bigint,
	"generation_hash" text,
	"generation_run_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"is_stale" boolean DEFAULT false NOT NULL,
	"difficulty" text DEFAULT 'medium' NOT NULL,
	"question_type" text DEFAULT 'multiple_choice' NOT NULL,
	"tags" jsonb NOT NULL,
	"prompt" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_indices" jsonb NOT NULL,
	"acceptable_answers" jsonb,
	"distractor_map" jsonb,
	"explanation" text NOT NULL,
	"review_status" text DEFAULT 'generated' NOT NULL,
	"quality_score" double precision,
	"use_count" bigint DEFAULT 0 NOT NULL,
	"styled_after_assessment_object_id" text,
	"pattern" text,
	"reasoning_type" text,
	"application_level" bigint,
	"estimated_steps" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"feature" text NOT NULL,
	"model" text NOT NULL,
	"tokens" bigint DEFAULT 0 NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"request_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alur_konten" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"course_id" text NOT NULL,
	"version" bigint NOT NULL,
	"state" text NOT NULL,
	"content_hash" text NOT NULL,
	"assigned_tutor_id" text,
	"last_request_id" text NOT NULL,
	"last_reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alur_konten_version_check" CHECK ("alur_konten"."version" > 0),
	CONSTRAINT "alur_konten_state_check" CHECK ("alur_konten"."state" IN ('uploaded', 'validated', 'staged', 'tutor_review', 'changes_requested', 'admin_review', 'approved', 'published', 'superseded', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "artikel" (
	"id" text PRIMARY KEY NOT NULL,
	"mata_kuliah_id" text NOT NULL,
	"bab_id" text,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"content_markdown" text NOT NULL,
	"structure_status" text DEFAULT 'legacy_unreviewed' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source_hash" text NOT NULL,
	"generation_hash" text NOT NULL,
	"creator_id" text NOT NULL,
	"curator_id" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artikel_version_check" CHECK ("artikel"."version" > 0),
	CONSTRAINT "artikel_status_check" CHECK ("artikel"."status" IN ('draft', 'in_review', 'published', 'withdrawn')),
	CONSTRAINT "artikel_structure_status_check" CHECK ("artikel"."structure_status" IN ('legacy_unreviewed', 'structured', 'needs_reauthoring'))
);
--> statement-breakpoint
CREATE TABLE "artikel_ide" (
	"id" text PRIMARY KEY NOT NULL,
	"artikel_id" text NOT NULL,
	"ide_id" text NOT NULL,
	"weight" double precision DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artikel_ide_weight_check" CHECK ("artikel_ide"."weight" > 0 AND "artikel_ide"."weight" <= 1)
);
--> statement-breakpoint
CREATE TABLE "asal_ide" (
	"id" text PRIMARY KEY NOT NULL,
	"ide_id" text NOT NULL,
	"source_chunk_id" text NOT NULL,
	"provenance_role" text DEFAULT 'supporting' NOT NULL,
	"start_offset" bigint NOT NULL,
	"end_offset" bigint NOT NULL,
	"source_checksum" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asal_ide_offset_check" CHECK ("asal_ide"."start_offset" >= 0 AND "asal_ide"."end_offset" > "asal_ide"."start_offset")
);
--> statement-breakpoint
CREATE TABLE "asesmen" (
	"id" text PRIMARY KEY NOT NULL,
	"blueprint_asesmen_id" text NOT NULL,
	"mata_kuliah_id" text NOT NULL,
	"title" text NOT NULL,
	"assessment_type" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"generation_hash" text NOT NULL,
	"creator_id" text NOT NULL,
	"curator_id" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asesmen_version_check" CHECK ("asesmen"."version" > 0),
	CONSTRAINT "asesmen_type_check" CHECK ("asesmen"."assessment_type" IN ('quiz', 'tryout'))
);
--> statement-breakpoint
CREATE TABLE "assessment_object_concepts" (
	"id" text PRIMARY KEY NOT NULL,
	"assessment_object_id" text NOT NULL,
	"concept_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_object_kos" (
	"id" text PRIMARY KEY NOT NULL,
	"assessment_object_id" text NOT NULL,
	"ko_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_objects" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"question_order" bigint NOT NULL,
	"source_question_number" text,
	"question_type" text NOT NULL,
	"difficulty" bigint NOT NULL,
	"application_level" bigint NOT NULL,
	"pattern" text NOT NULL,
	"reasoning_type" text NOT NULL,
	"estimated_steps" bigint NOT NULL,
	"question_markdown" text DEFAULT '' NOT NULL,
	"answer_markdown" text,
	"options" jsonb,
	"canonical_question_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"application_level" bigint NOT NULL,
	"difficulty_distribution" jsonb NOT NULL,
	"common_patterns" jsonb NOT NULL,
	"top_contexts" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_profiles_course_id_unique" UNIQUE("course_id")
);
--> statement-breakpoint
CREATE TABLE "assessment_source_chapters" (
	"id" text PRIMARY KEY NOT NULL,
	"assessment_source_id" text NOT NULL,
	"chapter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"title" text NOT NULL,
	"origin" text DEFAULT 'uploaded' NOT NULL,
	"category" text NOT NULL,
	"assessment_type" text,
	"year" bigint,
	"institution" text,
	"academic_year_label" text,
	"term" text,
	"canonical_course_id" text,
	"source_document_id" text,
	"solution_document_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"semester" bigint,
	"source_markdown" text NOT NULL,
	"source_hash" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"parser_version" text DEFAULT '1.0.0' NOT NULL,
	"ingestion_status" text DEFAULT 'pending' NOT NULL,
	"ingestion_error" text,
	"ingestion_started_at" timestamp with time zone,
	"ingestion_completed_at" timestamp with time zone,
	"original_filename" text,
	"uploadthing_key" text,
	"uploaded_by_user_id" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempt_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL,
	"question_index" bigint NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "uq_attempt_feedback_question" UNIQUE("attempt_id","question_index")
);
--> statement-breakpoint
CREATE TABLE "audit_mutasi" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"before_snapshot" jsonb,
	"after_snapshot" jsonb,
	"correlation_id" text,
	"course_id" text,
	"outcome" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_mutasi_outcome_check" CHECK ("audit_mutasi"."outcome" IS NULL OR "audit_mutasi"."outcome" IN ('success', 'rejected', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "bab" (
	"id" text PRIMARY KEY NOT NULL,
	"mata_kuliah_id" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"order_index" bigint NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"legacy_chapter_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bab_order_index_check" CHECK ("bab"."order_index" >= 0),
	CONSTRAINT "bab_status_check" CHECK ("bab"."status" IN ('draft', 'active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "bagian_artikel" (
	"id" text PRIMARY KEY NOT NULL,
	"artikel_id" text NOT NULL,
	"bagian_pembelajaran_id" text,
	"parent_section_id" text,
	"section_key" text NOT NULL,
	"section_kind" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"learning_objective" text NOT NULL,
	"order_index" bigint NOT NULL,
	"estimated_reading_minutes" bigint NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bagian_artikel_kind_check" CHECK ("bagian_artikel"."section_kind" IN ('overview', 'topic', 'summary')),
	CONSTRAINT "bagian_artikel_order_check" CHECK ("bagian_artikel"."order_index" >= 0),
	CONSTRAINT "bagian_artikel_minutes_check" CHECK ("bagian_artikel"."estimated_reading_minutes" > 0),
	CONSTRAINT "bagian_artikel_version_check" CHECK ("bagian_artikel"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "bagian_pembelajaran" (
	"id" text PRIMARY KEY NOT NULL,
	"mata_kuliah_id" text NOT NULL,
	"bab_id" text NOT NULL,
	"stable_key" text NOT NULL,
	"parent_section_id" text,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"order_index" bigint NOT NULL,
	"learning_objective" text NOT NULL,
	"source_chunk_ids" jsonb NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bagian_pembelajaran_order_check" CHECK ("bagian_pembelajaran"."order_index" >= 0),
	CONSTRAINT "bagian_pembelajaran_version_check" CHECK ("bagian_pembelajaran"."version" > 0),
	CONSTRAINT "bagian_pembelajaran_status_check" CHECK ("bagian_pembelajaran"."status" IN ('published', 'superseded', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "bagian_pembelajaran_ide" (
	"id" text PRIMARY KEY NOT NULL,
	"bagian_pembelajaran_id" text NOT NULL,
	"ide_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bagian_pembelajaran_ide_role_check" CHECK ("bagian_pembelajaran_ide"."role" IN ('primary', 'supporting'))
);
--> statement-breakpoint
CREATE TABLE "benchmark_soal" (
	"id" text PRIMARY KEY NOT NULL,
	"soal_itb_referensi_id" text,
	"dataset_key" text NOT NULL,
	"authoring_visibility" text NOT NULL,
	"question_snapshot" jsonb NOT NULL,
	"answer_snapshot" jsonb NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"checksum" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "benchmark_soal_visibility_check" CHECK ("benchmark_soal"."authoring_visibility" IN ('allowed', 'holdout')),
	CONSTRAINT "benchmark_soal_version_check" CHECK ("benchmark_soal"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "blog_articles" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"content" text NOT NULL,
	"thumbnail_url" text,
	"category" text NOT NULL,
	"read_minutes" bigint DEFAULT 5 NOT NULL,
	"tags" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blog_articles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "blok_artikel" (
	"id" text PRIMARY KEY NOT NULL,
	"artikel_id" text NOT NULL,
	"bagian_artikel_id" text,
	"block_key" text NOT NULL,
	"block_type" text NOT NULL,
	"title" text,
	"order_index" bigint NOT NULL,
	"content" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"generation_hash" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blok_artikel_order_check" CHECK ("blok_artikel"."order_index" >= 0),
	CONSTRAINT "blok_artikel_version_check" CHECK ("blok_artikel"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "blok_artikel_ide" (
	"id" text PRIMARY KEY NOT NULL,
	"blok_artikel_id" text NOT NULL,
	"ide_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blok_artikel_sumber" (
	"id" text PRIMARY KEY NOT NULL,
	"blok_artikel_id" text NOT NULL,
	"sumber_materi_id" text NOT NULL,
	"source_version" bigint NOT NULL,
	"source_checksum" text NOT NULL,
	"excerpt_ids" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blok_artikel_sumber_version_check" CHECK ("blok_artikel_sumber"."source_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "blueprint_asesmen" (
	"id" text PRIMARY KEY NOT NULL,
	"mata_kuliah_id" text NOT NULL,
	"title" text NOT NULL,
	"assessment_type" text NOT NULL,
	"blueprint" jsonb NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"generation_hash" text NOT NULL,
	"creator_id" text NOT NULL,
	"curator_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blueprint_asesmen_version_check" CHECK ("blueprint_asesmen"."version" > 0),
	CONSTRAINT "blueprint_asesmen_type_check" CHECK ("blueprint_asesmen"."assessment_type" IN ('quiz', 'tryout'))
);
--> statement-breakpoint
CREATE TABLE "booking_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"group_id" text,
	"actor_id" text,
	"action" text NOT NULL,
	"summary" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_reschedule_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"group_id" text NOT NULL,
	"requested_by_id" text NOT NULL,
	"tutor_id" text,
	"type" text DEFAULT 'reschedule' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text NOT NULL,
	"proposed_slot_id" text,
	"proposed_date" text,
	"decision_notes" text,
	"decided_at" timestamp with time zone,
	"decided_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_resources" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"phase" text NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"file_name" text,
	"mime_type" text,
	"size_bytes" bigint,
	"metadata" jsonb,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_resources_phase_check" CHECK ("booking_resources"."phase" IN ('pre', 'post')),
	CONSTRAINT "booking_resources_kind_check" CHECK ("booking_resources"."kind" IN ('link', 'file', 'recording')),
	CONSTRAINT "booking_resources_size_check" CHECK ("booking_resources"."size_bytes" IS NULL OR "booking_resources"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "booking_ticket_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"slot_id" text NOT NULL,
	"student_id" text NOT NULL,
	"course_id" text NOT NULL,
	"group_id" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"session_date" text,
	"start_time" text,
	"end_time" text,
	"mode" text DEFAULT 'online' NOT NULL,
	"location" text,
	"google_meet_url" text,
	"google_meet_space_name" text,
	"last_modified_by" text,
	"last_modified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"topic" text,
	"pre_session_notes" text,
	"pre_session_attachments" jsonb,
	"post_session_notes" text,
	"post_session_attachments" jsonb,
	"post_session_link_url" text,
	"post_session_link_title" text,
	"post_session_link_description" text,
	"post_session_link_image" text,
	"completed_at" timestamp with time zone,
	"completed_by_id" text,
	"booked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_slot_id_unique" UNIQUE("slot_id")
);
--> statement-breakpoint
CREATE TABLE "bukti_ide_jawaban" (
	"id" text PRIMARY KEY NOT NULL,
	"jawaban_murid_id" text NOT NULL,
	"ide_id" text NOT NULL,
	"score_contribution" double precision NOT NULL,
	"weight" double precision NOT NULL,
	"confidence" bigint NOT NULL,
	"evidence_source" text NOT NULL,
	"rubric_version" text NOT NULL,
	"derivation_status" text NOT NULL,
	"ambiguous" boolean DEFAULT false NOT NULL,
	"affects_mastery" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bukti_ide_jawaban_weight_check" CHECK ("bukti_ide_jawaban"."weight" > 0 AND "bukti_ide_jawaban"."weight" <= 1),
	CONSTRAINT "bukti_ide_jawaban_confidence_check" CHECK ("bukti_ide_jawaban"."confidence" >= 0 AND "bukti_ide_jawaban"."confidence" <= 100),
	CONSTRAINT "bukti_ide_jawaban_ambiguous_mastery_check" CHECK (NOT ("bukti_ide_jawaban"."ambiguous" AND "bukti_ide_jawaban"."affects_mastery"))
);
--> statement-breakpoint
CREATE TABLE "bukti_pdf_bundle" (
	"id" text PRIMARY KEY NOT NULL,
	"impor_bundle_id" text NOT NULL,
	"product_id" text NOT NULL,
	"article_version" bigint NOT NULL,
	"article_hash" text NOT NULL,
	"diktat_hash" text NOT NULL,
	"renderer_version" text NOT NULL,
	"print_profile" text NOT NULL,
	"storage_key" text,
	"page_count" bigint,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bukti_pdf_bundle_page_count_check" CHECK ("bukti_pdf_bundle"."page_count" IS NULL OR ("bukti_pdf_bundle"."page_count" >= 1 AND "bukti_pdf_bundle"."page_count" <= 4)),
	CONSTRAINT "bukti_pdf_bundle_status_check" CHECK ("bukti_pdf_bundle"."status" IN ('pending', 'ready', 'failed', 'stale')),
	CONSTRAINT "bukti_pdf_bundle_article_version_check" CHECK ("bukti_pdf_bundle"."article_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "bukti_pembelajaran" (
	"id" text PRIMARY KEY NOT NULL,
	"pengguna_id" text NOT NULL,
	"ide_id" text NOT NULL,
	"evidence_source" text NOT NULL,
	"source_id" text NOT NULL,
	"score_contribution" double precision NOT NULL,
	"confidence" bigint NOT NULL,
	"rubric_version" text NOT NULL,
	"derivation_status" text NOT NULL,
	"ambiguous" boolean DEFAULT false NOT NULL,
	"affects_mastery" boolean DEFAULT false NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bukti_pembelajaran_confidence_check" CHECK ("bukti_pembelajaran"."confidence" >= 0 AND "bukti_pembelajaran"."confidence" <= 100),
	CONSTRAINT "bukti_pembelajaran_ambiguous_mastery_check" CHECK (NOT ("bukti_pembelajaran"."ambiguous" AND "bukti_pembelajaran"."affects_mastery"))
);
--> statement-breakpoint
CREATE TABLE "cakupan_asesmen" (
	"id" text PRIMARY KEY NOT NULL,
	"asesmen_id" text NOT NULL,
	"bab_id" text NOT NULL,
	"order_index" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cakupan_asesmen_order_check" CHECK ("cakupan_asesmen"."order_index" >= 0)
);
--> statement-breakpoint
CREATE TABLE "career_path_concepts" (
	"id" text PRIMARY KEY NOT NULL,
	"career_path_template_id" text NOT NULL,
	"concept_id" text NOT NULL,
	CONSTRAINT "uq_career_path_concepts" UNIQUE("career_path_template_id","concept_id")
);
--> statement-breakpoint
CREATE TABLE "career_path_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_career_path_templates_title" UNIQUE("title")
);
--> statement-breakpoint
CREATE TABLE "chapter_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"chapter_id" text NOT NULL,
	"alias_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chapter_aliases_alias_name_unique" UNIQUE("alias_name")
);
--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"order_index" bigint NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"asset_gen_status" text DEFAULT 'idle' NOT NULL,
	"asset_gen_flashcards_total" bigint DEFAULT 0 NOT NULL,
	"asset_gen_flashcards_current" bigint DEFAULT 0 NOT NULL,
	"asset_gen_questions_total" bigint DEFAULT 0 NOT NULL,
	"asset_gen_questions_current" bigint DEFAULT 0 NOT NULL,
	"asset_gen_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_message_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"relevance_score" double precision DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"course_id" text NOT NULL,
	"title" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concept_graph_edges" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"source_concept" text NOT NULL,
	"target_concept" text NOT NULL,
	"type" text NOT NULL,
	CONSTRAINT "uq_cge_edge" UNIQUE("course_id","source_concept","target_concept","type")
);
--> statement-breakpoint
CREATE TABLE "concept_localizations" (
	"id" text PRIMARY KEY NOT NULL,
	"concept_id" text NOT NULL,
	"lang" text NOT NULL,
	"display_name" text NOT NULL,
	"aliases" jsonb NOT NULL,
	"technical_standard_term" text DEFAULT 'id' NOT NULL,
	"embedding" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_concept_loc_concept_lang" UNIQUE("concept_id","lang")
);
--> statement-breakpoint
CREATE TABLE "concepts" (
	"id" text PRIMARY KEY NOT NULL,
	"canonical_slug" text NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concepts_canonical_slug_unique" UNIQUE("canonical_slug")
);
--> statement-breakpoint
CREATE TABLE "content_quality_flags" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"question_id" text NOT NULL,
	"flag_type" text NOT NULL,
	"detail" jsonb NOT NULL,
	"sample_size" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_cqf_question_type" UNIQUE("question_id","flag_type")
);
--> statement-breakpoint
CREATE TABLE "course_analytics_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"date" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_course_snapshot_date" UNIQUE("course_id","date")
);
--> statement-breakpoint
CREATE TABLE "course_materials" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"subcategory" text,
	"year" bigint,
	"file_url" text NOT NULL,
	"checksum" text,
	"chapter_ids" jsonb NOT NULL,
	"thumbnail_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"max_application_level" bigint DEFAULT 2 NOT NULL,
	"max_estimated_steps" bigint DEFAULT 4 NOT NULL,
	"max_reading_complexity" bigint DEFAULT 2 NOT NULL,
	"allow_engineering_terms" boolean DEFAULT true NOT NULL,
	"forbidden_contexts" jsonb NOT NULL,
	"allowed_patterns" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_policies_course_id_unique" UNIQUE("course_id")
);
--> statement-breakpoint
CREATE TABLE "course_video_playlists" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"order_index" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_videos" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"playlist_id" text NOT NULL,
	"chapter_id" text,
	"title" text NOT NULL,
	"description" text,
	"video_url" text NOT NULL,
	"thumbnail_url" text,
	"duration" bigint,
	"file_size" bigint,
	"order_index" bigint DEFAULT 0 NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "custom_form_presets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'survey' NOT NULL,
	"questions" jsonb NOT NULL,
	"settings" jsonb,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_form_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"form_id" text NOT NULL,
	"responder_user_id" text,
	"responder_email" text,
	"answers" jsonb NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_forms" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'survey' NOT NULL,
	"questions" jsonb NOT NULL,
	"settings" jsonb,
	"google_form_id" text,
	"google_responder_uri" text,
	"spreadsheet_id" text,
	"spreadsheet_url" text,
	"created_by_id" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_forms_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "daily_recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"date" text NOT NULL,
	"payload" jsonb NOT NULL,
	"completed_items" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_daily_rec_student_date" UNIQUE("student_id","date")
);
--> statement-breakpoint
CREATE TABLE "diktat_ide" (
	"id" text PRIMARY KEY NOT NULL,
	"diktat_materi_id" text NOT NULL,
	"ide_id" text NOT NULL,
	"weight" double precision DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diktat_ide_weight_check" CHECK ("diktat_ide"."weight" > 0 AND "diktat_ide"."weight" <= 1)
);
--> statement-breakpoint
CREATE TABLE "diktat_materi" (
	"id" text PRIMARY KEY NOT NULL,
	"mata_kuliah_id" text NOT NULL,
	"bab_id" text,
	"title" text NOT NULL,
	"content_markdown" text NOT NULL,
	"file_key" text,
	"version" bigint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source_hash" text NOT NULL,
	"generation_hash" text NOT NULL,
	"creator_id" text NOT NULL,
	"curator_id" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diktat_materi_version_check" CHECK ("diktat_materi"."version" > 0),
	CONSTRAINT "diktat_materi_status_check" CHECK ("diktat_materi"."status" IN ('draft', 'in_review', 'published', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "diktat_pembahasan" (
	"id" text PRIMARY KEY NOT NULL,
	"diktat_materi_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"generation_hash" text NOT NULL,
	"creator_id" text NOT NULL,
	"curator_id" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diktat_pembahasan_version_check" CHECK ("diktat_pembahasan"."version" > 0),
	CONSTRAINT "diktat_pembahasan_status_check" CHECK ("diktat_pembahasan"."status" IN ('draft', 'in_review', 'published', 'retired'))
);
--> statement-breakpoint
CREATE TABLE "diktats" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"source_mtd_id" text NOT NULL,
	"source_mtd_version" bigint NOT NULL,
	"is_stale" boolean DEFAULT false NOT NULL,
	"generation_hash" text NOT NULL,
	"title" text NOT NULL,
	"file_url" text,
	"chapter_ids" jsonb NOT NULL,
	"settings" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"download_count" bigint DEFAULT 0 NOT NULL,
	"thumbnail_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discount_vouchers" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"discount_percent" bigint NOT NULL,
	"max_quota" bigint DEFAULT 1 NOT NULL,
	"used_quota" bigint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discount_vouchers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "distractor_provenance" (
	"id" text PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"option_index" bigint NOT NULL,
	"stable_option_id" text NOT NULL,
	"targeted_misconception" text NOT NULL,
	"misconception_ko_id" text,
	"supporting_source_ids" jsonb NOT NULL,
	"mapping_method" text DEFAULT 'unknown' NOT NULL,
	"score" double precision DEFAULT 0 NOT NULL,
	"method_version" text DEFAULT '2.0' NOT NULL,
	"uncertainty_state" text DEFAULT 'unknown' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_distractor_prov_option" UNIQUE("question_id","option_index")
);
--> statement-breakpoint
CREATE TABLE "drive_item" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"uploadthing_key" text,
	"ufs_url" text,
	"mime_type" text,
	"size_bytes" bigint,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_notification_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"course_updates" boolean DEFAULT true NOT NULL,
	"events_and_schedules" boolean DEFAULT true NOT NULL,
	"learning_reminders" boolean DEFAULT true NOT NULL,
	"news_and_offers" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollment_token_courses" (
	"token_id" text NOT NULL,
	"course_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollment_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"group_id" text NOT NULL,
	"capacity" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "enrollment_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"course_id" text NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"settings" jsonb,
	"open_at" timestamp with time zone,
	"close_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "export_spreadsheets" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"spreadsheet_id" text NOT NULL,
	"spreadsheet_url" text NOT NULL,
	"drive_folder_id" text NOT NULL,
	"folder_path" text NOT NULL,
	"last_header_count" bigint DEFAULT 0 NOT NULL,
	"last_row_count" bigint DEFAULT 0 NOT NULL,
	"last_written_fingerprint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"mtd_id" text NOT NULL,
	"chapter_id" text NOT NULL,
	"state" text DEFAULT 'staged' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flashcard" (
	"id" text PRIMARY KEY NOT NULL,
	"set_flashcard_id" text NOT NULL,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"explanation" text,
	"version" bigint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"generation_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flashcard_version_check" CHECK ("flashcard"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "flashcard_ide" (
	"id" text PRIMARY KEY NOT NULL,
	"flashcard_id" text NOT NULL,
	"ide_id" text NOT NULL,
	"weight" double precision DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flashcard_ide_weight_check" CHECK ("flashcard_ide"."weight" > 0 AND "flashcard_ide"."weight" <= 1)
);
--> statement-breakpoint
CREATE TABLE "flashcard_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"flashcard_id" text NOT NULL,
	"grade" bigint NOT NULL,
	"response_time_ms" bigint NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flashcard_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"chapter_id" text NOT NULL,
	"source_mtd_id" text NOT NULL,
	"source_mtd_version" bigint NOT NULL,
	"is_stale" boolean DEFAULT false NOT NULL,
	"generation_hash" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flashcards" (
	"id" text PRIMARY KEY NOT NULL,
	"set_id" text NOT NULL,
	"ko_id" text,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"explanation" text,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_forms" (
	"id" text PRIMARY KEY NOT NULL,
	"form_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"responder_uri" text NOT NULL,
	"edit_uri" text,
	"category" text DEFAULT 'survey' NOT NULL,
	"created_by_id" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_forms_form_id_unique" UNIQUE("form_id")
);
--> statement-breakpoint
CREATE TABLE "google_meet_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"space_name" text NOT NULL,
	"meeting_uri" text NOT NULL,
	"meeting_code" text NOT NULL,
	"access_type" text DEFAULT 'OPEN' NOT NULL,
	"created_by_id" text,
	"slug" text,
	"host_email" text,
	"co_host_emails" jsonb,
	"invited_emails" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_meet_sessions_space_name_unique" UNIQUE("space_name"),
	CONSTRAINT "google_meet_sessions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "group_courses" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"course_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"package_type" text DEFAULT 'reguler_15' NOT NULL,
	"package_name" text DEFAULT 'Paket Reguler (15 Sesi)' NOT NULL,
	"total_quota_sessions" bigint DEFAULT 15 NOT NULL,
	"used_quota_sessions" bigint DEFAULT 0 NOT NULL,
	"weekly_quota_sessions" bigint DEFAULT 2 NOT NULL,
	"academic_year" text DEFAULT '2026/2027' NOT NULL,
	"semester" text DEFAULT 'Ganjil' NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ide" (
	"id" text PRIMARY KEY NOT NULL,
	"mata_kuliah_id" text NOT NULL,
	"bab_id" text NOT NULL,
	"concept_id" text,
	"stable_key" text NOT NULL,
	"code" text NOT NULL,
	"canonical_statement" text NOT NULL,
	"concise_explanation" text NOT NULL,
	"latex" text,
	"knowledge_kind" text DEFAULT 'other' NOT NULL,
	"instructional_role" text DEFAULT 'core' NOT NULL,
	"difficulty_metadata" jsonb NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source_policy" text DEFAULT 'source_grounded' NOT NULL,
	"schema_version" text DEFAULT '1.0' NOT NULL,
	"semantic_hash" text NOT NULL,
	"generation_hash" text NOT NULL,
	"creator_id" text NOT NULL,
	"curator_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ide_version_check" CHECK ("ide"."version" > 0),
	CONSTRAINT "ide_status_check" CHECK ("ide"."status" IN ('draft', 'published', 'needs_review', 'withdrawn', 'superseded')),
	CONSTRAINT "ide_source_policy_check" CHECK ("ide"."source_policy" IN ('source_grounded', 'tutor_authored'))
);
--> statement-breakpoint
CREATE TABLE "impor_bundle" (
	"id" text PRIMARY KEY NOT NULL,
	"bundle_id" text NOT NULL,
	"checksum" text NOT NULL,
	"bundle_type" text NOT NULL,
	"course_id" text,
	"source_uri_or_key" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"validation_report" jsonb NOT NULL,
	"requested_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "impor_bundle_version_check" CHECK ("impor_bundle"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "important_links" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"icon" text,
	"category" text,
	"color" text,
	"sort_order" bigint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_id" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interventions" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"course_id" text NOT NULL,
	"concept_name" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "item_asesmen" (
	"id" text PRIMARY KEY NOT NULL,
	"asesmen_id" text NOT NULL,
	"soal_id" text NOT NULL,
	"order_index" bigint NOT NULL,
	"rendered_question_snapshot" jsonb NOT NULL,
	"option_order_snapshot" jsonb NOT NULL,
	"grading_policy_snapshot" jsonb NOT NULL,
	"content_version" bigint NOT NULL,
	"generation_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_asesmen_order_check" CHECK ("item_asesmen"."order_index" >= 0),
	CONSTRAINT "item_asesmen_content_version_check" CHECK ("item_asesmen"."content_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "item_diktat_pembahasan" (
	"id" text PRIMARY KEY NOT NULL,
	"diktat_pembahasan_id" text NOT NULL,
	"soal_id" text NOT NULL,
	"order_index" bigint NOT NULL,
	"content_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_diktat_pembahasan_order_check" CHECK ("item_diktat_pembahasan"."order_index" >= 0)
);
--> statement-breakpoint
CREATE TABLE "item_impor_bundle" (
	"id" text PRIMARY KEY NOT NULL,
	"impor_bundle_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"entity_version" bigint NOT NULL,
	"entity_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_impor_bundle_version_check" CHECK ("item_impor_bundle"."entity_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "jawaban_murid" (
	"id" text PRIMARY KEY NOT NULL,
	"percobaan_asesmen_id" text NOT NULL,
	"item_asesmen_id" text NOT NULL,
	"rendered_question_snapshot" jsonb NOT NULL,
	"option_order_snapshot" jsonb NOT NULL,
	"response_snapshot" jsonb NOT NULL,
	"grading_policy_snapshot" jsonb NOT NULL,
	"content_version" bigint NOT NULL,
	"score" double precision,
	"status" text DEFAULT 'ungraded' NOT NULL,
	"reviewer_id" text,
	"review_notes" text,
	"reviewed_at" timestamp with time zone,
	"review_revision" bigint DEFAULT 0 NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jawaban_murid_content_version_check" CHECK ("jawaban_murid"."content_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "kemajuan_baca_artikel" (
	"id" text PRIMARY KEY NOT NULL,
	"pengguna_id" text NOT NULL,
	"artikel_id" text NOT NULL,
	"artikel_version" bigint NOT NULL,
	"bagian_artikel_id" text NOT NULL,
	"max_read_percent" bigint DEFAULT 0 NOT NULL,
	"time_spent_seconds" bigint DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kemajuan_baca_artikel_version_check" CHECK ("kemajuan_baca_artikel"."artikel_version" > 0),
	CONSTRAINT "kemajuan_baca_artikel_percent_check" CHECK ("kemajuan_baca_artikel"."max_read_percent" >= 0 AND "kemajuan_baca_artikel"."max_read_percent" <= 100),
	CONSTRAINT "kemajuan_baca_artikel_time_check" CHECK ("kemajuan_baca_artikel"."time_spent_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "kemajuan_flashcard_murid" (
	"id" text PRIMARY KEY NOT NULL,
	"pengguna_id" text NOT NULL,
	"flashcard_id" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"interval_days" double precision DEFAULT 0 NOT NULL,
	"ease_factor" double precision DEFAULT 2.5 NOT NULL,
	"repetitions" bigint DEFAULT 0 NOT NULL,
	"lapses" bigint DEFAULT 0 NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kemajuan_flashcard_murid_interval_check" CHECK ("kemajuan_flashcard_murid"."interval_days" >= 0),
	CONSTRAINT "kemajuan_flashcard_murid_ease_check" CHECK ("kemajuan_flashcard_murid"."ease_factor" > 0)
);
--> statement-breakpoint
CREATE TABLE "ketergantungan_produk" (
	"id" text PRIMARY KEY NOT NULL,
	"upstream_entity_type" text NOT NULL,
	"upstream_entity_id" text NOT NULL,
	"upstream_version" bigint NOT NULL,
	"upstream_hash" text NOT NULL,
	"downstream_entity_type" text NOT NULL,
	"downstream_entity_id" text NOT NULL,
	"downstream_version" bigint NOT NULL,
	"downstream_hash" text NOT NULL,
	"freshness" text DEFAULT 'UP_TO_DATE' NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ketergantungan_produk_upstream_version_check" CHECK ("ketergantungan_produk"."upstream_version" > 0),
	CONSTRAINT "ketergantungan_produk_downstream_version_check" CHECK ("ketergantungan_produk"."downstream_version" > 0),
	CONSTRAINT "ketergantungan_produk_freshness_check" CHECK ("ketergantungan_produk"."freshness" IN ('UP_TO_DATE', 'NEEDS_REVIEW', 'STALE')),
	CONSTRAINT "ketergantungan_produk_no_self_check" CHECK (NOT ("ketergantungan_produk"."upstream_entity_type" = "ketergantungan_produk"."downstream_entity_type" AND "ketergantungan_produk"."upstream_entity_id" = "ketergantungan_produk"."downstream_entity_id"))
);
--> statement-breakpoint
CREATE TABLE "knowledge_object_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"ko_id" text NOT NULL,
	"source_document_id" text NOT NULL,
	"source_version" text DEFAULT '1.0' NOT NULL,
	"chapter_id" text NOT NULL,
	"start_offset" bigint NOT NULL,
	"end_offset" bigint NOT NULL,
	"source_hash" text NOT NULL,
	"excerpt_hash" text NOT NULL,
	"extraction_run_id" text,
	"support_role" text DEFAULT 'core' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_objects" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"mtd_id" text NOT NULL,
	"chapter_id" text NOT NULL,
	"concept_id" text NOT NULL,
	"learning_order" bigint NOT NULL,
	"title" text NOT NULL,
	"concept_name" text NOT NULL,
	"content" text NOT NULL,
	"type" text NOT NULL,
	"difficulty" text DEFAULT 'medium' NOT NULL,
	"bloom_level" text NOT NULL,
	"tags" jsonb NOT NULL,
	"importance" text DEFAULT 'medium' NOT NULL,
	"metadata" jsonb NOT NULL,
	"pinecone_vector_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"stable_key" text,
	"semantic_hash" text,
	"version" bigint DEFAULT 1 NOT NULL,
	"knowledge_kind" text DEFAULT 'other' NOT NULL,
	"instructional_role" text DEFAULT 'core' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_relationships" (
	"id" text PRIMARY KEY NOT NULL,
	"source_ko_id" text NOT NULL,
	"target_ko_id" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_events" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"course_id" text NOT NULL,
	"concept_name" text,
	"ko_id" text,
	"event_type" text NOT NULL,
	"correctness" double precision,
	"weight" double precision DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_objectives" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"chapter_id" text NOT NULL,
	"objective_text" text NOT NULL,
	"bloom_level" text NOT NULL,
	"evidence_source_ids" jsonb NOT NULL,
	"related_ko_ids" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_outcome_concepts" (
	"id" text PRIMARY KEY NOT NULL,
	"learning_outcome_id" text NOT NULL,
	"concept_id" text NOT NULL,
	CONSTRAINT "uq_lo_concepts" UNIQUE("learning_outcome_id","concept_id")
);
--> statement-breakpoint
CREATE TABLE "learning_outcomes" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"level" text NOT NULL,
	"parent_id" text,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"bloom_target" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_learning_outcomes_course_code" UNIQUE("course_id","code")
);
--> statement-breakpoint
CREATE TABLE "legacy_backfill_exceptions" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"legacy_table" text NOT NULL,
	"legacy_id" text NOT NULL,
	"reason_code" text NOT NULL,
	"preservation_path" text NOT NULL,
	"details" jsonb NOT NULL,
	"blocks_cutover" boolean DEFAULT false NOT NULL,
	"source_checksum" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_quiz_results" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"student_id" text NOT NULL,
	"course_id" text NOT NULL,
	"score" bigint DEFAULT 0 NOT NULL,
	"rank" bigint,
	"answers_snapshot" jsonb NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_live_result_session_student" UNIQUE("session_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "live_quiz_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"tutor_id" text NOT NULL,
	"template_id" text,
	"code" text NOT NULL,
	"state" text DEFAULT 'lobby' NOT NULL,
	"questions_snapshot" jsonb NOT NULL,
	"participant_count" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"delivery_status" text DEFAULT 'pending' NOT NULL,
	"delivery_claimed_at" timestamp with time zone,
	"delivery_claim_token" text,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "live_quiz_sessions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "master_teaching_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"source_id" text,
	"title" text NOT NULL,
	"markdown_content" text NOT NULL,
	"original_pdf_key" text,
	"canonical_markdown_key" text,
	"version" bigint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"type" text DEFAULT 'learning' NOT NULL,
	"source_hash" text,
	"derived_hash" text,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mastery_recompute_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"course_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text NOT NULL,
	"retries" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mata_kuliah" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"legacy_course_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mata_kuliah_status_check" CHECK ("mata_kuliah"."status" IN ('draft', 'active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "migration_checkpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"phase" text NOT NULL,
	"checkpoint" text NOT NULL,
	"status" text NOT NULL,
	"manifest_hash" text,
	"row_count" bigint,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "migration_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_number" text NOT NULL,
	"source_commit" text NOT NULL,
	"schema_version" text NOT NULL,
	"database_fingerprint" text NOT NULL,
	"phase" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"row_count_manifest_hash" text,
	"error_code" text
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"type" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"metadata" jsonb NOT NULL,
	"attempted" bigint DEFAULT 0 NOT NULL,
	"succeeded" bigint DEFAULT 0 NOT NULL,
	"failed_count" bigint DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_analytics" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"views" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pemahaman_ide" (
	"id" text PRIMARY KEY NOT NULL,
	"pengguna_id" text NOT NULL,
	"ide_id" text NOT NULL,
	"skor" bigint NOT NULL,
	"keyakinan" bigint NOT NULL,
	"evidence_count" bigint DEFAULT 0 NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"algorithm_version" text DEFAULT 'per-idea.v1' NOT NULL,
	"input_watermark" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pemahaman_ide_score_check" CHECK ("pemahaman_ide"."skor" >= 0 AND "pemahaman_ide"."skor" <= 100),
	CONSTRAINT "pemahaman_ide_confidence_check" CHECK ("pemahaman_ide"."keyakinan" >= 0 AND "pemahaman_ide"."keyakinan" <= 100),
	CONSTRAINT "pemahaman_ide_evidence_check" CHECK ("pemahaman_ide"."evidence_count" >= 0),
	CONSTRAINT "pemahaman_ide_version_check" CHECK ("pemahaman_ide"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "pembahasan_soal" (
	"id" text PRIMARY KEY NOT NULL,
	"soal_id" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"generation_hash" text NOT NULL,
	"creator_id" text NOT NULL,
	"curator_id" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pembahasan_soal_version_check" CHECK ("pembahasan_soal"."version" > 0),
	CONSTRAINT "pembahasan_soal_status_check" CHECK ("pembahasan_soal"."status" IN ('draft', 'in_review', 'published', 'retired'))
);
--> statement-breakpoint
CREATE TABLE "pendaftaran_murid" (
	"id" text PRIMARY KEY NOT NULL,
	"pengguna_id" text NOT NULL,
	"mata_kuliah_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"legacy_enrollment_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pendaftaran_murid_status_check" CHECK ("pendaftaran_murid"."status" IN ('pending', 'active', 'completed', 'cancelled', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "pengguna" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pengguna_peran" (
	"id" text PRIMARY KEY NOT NULL,
	"pengguna_id" text NOT NULL,
	"peran_id" text NOT NULL,
	"source" text NOT NULL,
	"audit_actor_pengguna_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "penugasan_tutor" (
	"id" text PRIMARY KEY NOT NULL,
	"pengguna_id" text NOT NULL,
	"mata_kuliah_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"assignment_scope" text DEFAULT 'course' NOT NULL,
	"legacy_tutor_course_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "penugasan_tutor_status_check" CHECK ("penugasan_tutor"."status" IN ('pending', 'active', 'suspended', 'ended', 'revoked')),
	CONSTRAINT "penugasan_tutor_scope_check" CHECK ("penugasan_tutor"."assignment_scope" IN ('course', 'chapter', 'content'))
);
--> statement-breakpoint
CREATE TABLE "peran" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "peran_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "percobaan_asesmen" (
	"id" text PRIMARY KEY NOT NULL,
	"asesmen_id" text NOT NULL,
	"pengguna_id" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"rendered_question_snapshot" jsonb NOT NULL,
	"option_order_snapshot" jsonb NOT NULL,
	"grading_policy_snapshot" jsonb NOT NULL,
	"content_version" bigint NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "percobaan_asesmen_content_version_check" CHECK ("percobaan_asesmen"."content_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "perubahan_pemahaman" (
	"id" text PRIMARY KEY NOT NULL,
	"pemahaman_ide_id" text NOT NULL,
	"evidence_id" text,
	"previous_score" bigint NOT NULL,
	"next_score" bigint NOT NULL,
	"previous_confidence" bigint NOT NULL,
	"next_confidence" bigint NOT NULL,
	"reason" text NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"algorithm_version" text DEFAULT 'per-idea.v1' NOT NULL,
	"input_watermark" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perubahan_pemahaman_score_check" CHECK ("perubahan_pemahaman"."previous_score" >= 0 AND "perubahan_pemahaman"."previous_score" <= 100 AND "perubahan_pemahaman"."next_score" >= 0 AND "perubahan_pemahaman"."next_score" <= 100),
	CONSTRAINT "perubahan_pemahaman_confidence_check" CHECK ("perubahan_pemahaman"."previous_confidence" >= 0 AND "perubahan_pemahaman"."previous_confidence" <= 100 AND "perubahan_pemahaman"."next_confidence" >= 0 AND "perubahan_pemahaman"."next_confidence" <= 100)
);
--> statement-breakpoint
CREATE TABLE "peta_id_legacy" (
	"id" text PRIMARY KEY NOT NULL,
	"legacy_table" text NOT NULL,
	"legacy_id" text NOT NULL,
	"target_table" text NOT NULL,
	"target_id" text NOT NULL,
	"mapping_version" bigint NOT NULL,
	"source_checksum" text NOT NULL,
	"target_checksum" text NOT NULL,
	"run_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "peta_id_legacy_mapping_version_check" CHECK ("peta_id_legacy"."mapping_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "pka_announcement_reads" (
	"announcement_id" text NOT NULL,
	"user_id" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pka_announcement_reads_announcement_id_user_id_pk" PRIMARY KEY("announcement_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "pka_announcements" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_by" text NOT NULL,
	"sent_at" timestamp with time zone,
	"recipient_count" bigint,
	"is_archived" boolean DEFAULT false NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pka_registrations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"full_name" text NOT NULL,
	"faculty" text NOT NULL,
	"email" text NOT NULL,
	"instagram_username" text NOT NULL,
	"proof_key" text NOT NULL,
	"receive_announcements" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pka_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"session_at" timestamp with time zone NOT NULL,
	"meet_link" text,
	"created_by" text NOT NULL,
	"sent_at" timestamp with time zone,
	"recipient_count" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pka_simulation_stages" (
	"id" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"stage" bigint NOT NULL,
	"quiz_template_id" text NOT NULL,
	"pass_score_threshold" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pka_stage_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"subject" text NOT NULL,
	"stage" bigint NOT NULL,
	"status" text DEFAULT 'locked' NOT NULL,
	"best_score" bigint,
	"passed" boolean,
	"attempt_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "potongan_sumber" (
	"id" text PRIMARY KEY NOT NULL,
	"sumber_materi_id" text NOT NULL,
	"source_version" bigint NOT NULL,
	"content" text NOT NULL,
	"page_number" bigint,
	"section_locator" text,
	"start_offset" bigint NOT NULL,
	"end_offset" bigint NOT NULL,
	"checksum" text NOT NULL,
	"embedding_eligible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "potongan_sumber_version_check" CHECK ("potongan_sumber"."source_version" > 0),
	CONSTRAINT "potongan_sumber_offset_check" CHECK ("potongan_sumber"."start_offset" >= 0 AND "potongan_sumber"."end_offset" > "potongan_sumber"."start_offset"),
	CONSTRAINT "potongan_sumber_page_check" CHECK ("potongan_sumber"."page_number" IS NULL OR "potongan_sumber"."page_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "progress" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"material_id" text,
	"status" text DEFAULT 'completed',
	"completed_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "publikasi_bundle" (
	"id" text PRIMARY KEY NOT NULL,
	"impor_bundle_id" text NOT NULL,
	"approved_review_id" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"publication_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"published_by" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publikasi_bundle_version_check" CHECK ("publikasi_bundle"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "question_generation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"blueprint_version" text DEFAULT '2.0' NOT NULL,
	"prompt_version" text DEFAULT '2.0' NOT NULL,
	"source_version" text,
	"shuffle_seed" bigint,
	"validator_version" text DEFAULT '2.0' NOT NULL,
	"slot_count" bigint DEFAULT 0 NOT NULL,
	"accepted_count" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_option_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"course_id" text NOT NULL,
	"option_index" bigint NOT NULL,
	"selected_count" bigint DEFAULT 0 NOT NULL,
	"total_attempts" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_qos_question_option" UNIQUE("question_id","option_index")
);
--> statement-breakpoint
CREATE TABLE "question_reference_links" (
	"id" text PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"reference_question_id" text NOT NULL,
	"role" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_ref_links_role_check" CHECK ("question_reference_links"."role" IN ('inspired_by', 'adapted_from', 'derived_from')),
	CONSTRAINT "question_ref_links_no_self_ref_check" CHECK ("question_reference_links"."question_id" != "question_reference_links"."reference_question_id")
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" text PRIMARY KEY NOT NULL,
	"exam_id" text NOT NULL,
	"type" text NOT NULL,
	"content" jsonb NOT NULL,
	"order" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_ai_insights" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text,
	"exam_id" text,
	"sample_size" bigint DEFAULT 0 NOT NULL,
	"insights" jsonb NOT NULL,
	"summary" text,
	"generated_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"visibility" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"time_limit_seconds" bigint,
	"max_attempts" bigint,
	"selection_rules" jsonb NOT NULL,
	"open_at" timestamp with time zone,
	"close_at" timestamp with time zone,
	"manual_status" text DEFAULT 'scheduled' NOT NULL,
	"show_discussion" boolean DEFAULT false NOT NULL,
	"spreadsheet_id" text,
	"spreadsheet_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rekomendasi_flashcard" (
	"id" text PRIMARY KEY NOT NULL,
	"pengguna_id" text NOT NULL,
	"flashcard_id" text NOT NULL,
	"ide_id" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relasi_ide" (
	"id" text PRIMARY KEY NOT NULL,
	"source_idea_id" text NOT NULL,
	"target_idea_id" text NOT NULL,
	"relation_type" text NOT NULL,
	"explanation" text,
	"version" bigint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relasi_ide_no_self_check" CHECK ("relasi_ide"."source_idea_id" <> "relasi_ide"."target_idea_id"),
	CONSTRAINT "relasi_ide_version_check" CHECK ("relasi_ide"."version" > 0),
	CONSTRAINT "relasi_ide_type_check" CHECK ("relasi_ide"."relation_type" IN ('prerequisite', 'related', 'extends', 'example_of', 'misconception_of'))
);
--> statement-breakpoint
CREATE TABLE "review_bundle" (
	"id" text PRIMARY KEY NOT NULL,
	"impor_bundle_id" text NOT NULL,
	"reviewer_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_flashcard" (
	"id" text PRIMARY KEY NOT NULL,
	"kemajuan_flashcard_murid_id" text NOT NULL,
	"grade" bigint NOT NULL,
	"response_ms" bigint,
	"previous_due_at" timestamp with time zone NOT NULL,
	"next_due_at" timestamp with time zone NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_flashcard_grade_check" CHECK ("review_flashcard"."grade" >= 0 AND "review_flashcard"."grade" <= 5),
	CONSTRAINT "review_flashcard_response_check" CHECK ("review_flashcard"."response_ms" IS NULL OR "review_flashcard"."response_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "review_item_bundle" (
	"id" text PRIMARY KEY NOT NULL,
	"impor_bundle_id" text NOT NULL,
	"reviewer_id" text NOT NULL,
	"product_id" text,
	"block_id" text,
	"target_type" text DEFAULT 'article_block' NOT NULL,
	"target_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_item_bundle_target_type_check" CHECK ("review_item_bundle"."target_type" IN ('idea', 'article_section', 'article_block'))
);
--> statement-breakpoint
CREATE TABLE "review_pedagogi_bundle" (
	"id" text PRIMARY KEY NOT NULL,
	"impor_bundle_id" text NOT NULL,
	"reviewer_id" text NOT NULL,
	"content_fingerprint" text NOT NULL,
	"policy_version" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"rubric" jsonb NOT NULL,
	"exceptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_pedagogi_bundle_status_check" CHECK ("review_pedagogi_bundle"."status" IN ('pending', 'approved', 'rejected', 'changes_requested'))
);
--> statement-breakpoint
CREATE TABLE "search_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"course_id" text,
	"title" text NOT NULL,
	"searchable_text" text NOT NULL,
	"path" text NOT NULL,
	"min_role" bigint DEFAULT 0 NOT NULL,
	"is_synced" boolean DEFAULT false NOT NULL,
	"sync_status" text DEFAULT 'pending' NOT NULL,
	"lease_id" text,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "set_flashcard" (
	"id" text PRIMARY KEY NOT NULL,
	"mata_kuliah_id" text NOT NULL,
	"bab_id" text,
	"title" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"generation_hash" text NOT NULL,
	"creator_id" text NOT NULL,
	"curator_id" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "set_flashcard_version_check" CHECK ("set_flashcard"."version" > 0),
	CONSTRAINT "set_flashcard_status_check" CHECK ("set_flashcard"."status" IN ('draft', 'in_review', 'published', 'retired'))
);
--> statement-breakpoint
CREATE TABLE "short_link" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"user_id" text,
	"clicks" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "short_link_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "soal" (
	"id" text PRIMARY KEY NOT NULL,
	"mata_kuliah_id" text NOT NULL,
	"bab_id" text,
	"question_type" text NOT NULL,
	"prompt" text NOT NULL,
	"options_snapshot" jsonb NOT NULL,
	"origin" text DEFAULT 'zyx_original' NOT NULL,
	"source_event_name" text,
	"source_reference_id" text,
	"assessment_source_id" text,
	"source_question_number" text,
	"source_question_part" text,
	"source_page" bigint,
	"source_locator" jsonb,
	"answer_provenance" text,
	"solution_provenance" text,
	"quiz_eligible" boolean DEFAULT false NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"difficulty" text NOT NULL,
	"cognitive_level" text NOT NULL,
	"reasoning_pattern" text NOT NULL,
	"generation_hash" text NOT NULL,
	"creator_id" text NOT NULL,
	"curator_id" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "soal_version_check" CHECK ("soal"."version" > 0),
	CONSTRAINT "soal_status_check" CHECK ("soal"."status" IN ('draft', 'in_review', 'published', 'retired'))
);
--> statement-breakpoint
CREATE TABLE "soal_ide" (
	"id" text PRIMARY KEY NOT NULL,
	"soal_id" text NOT NULL,
	"ide_id" text NOT NULL,
	"weight" double precision NOT NULL,
	"role" text DEFAULT 'supporting' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "soal_ide_weight_check" CHECK ("soal_ide"."weight" > 0 AND "soal_ide"."weight" <= 1)
);
--> statement-breakpoint
CREATE TABLE "soal_itb_referensi" (
	"id" text PRIMARY KEY NOT NULL,
	"soal_id" text,
	"source_label" text NOT NULL,
	"authoring_visibility" text NOT NULL,
	"content_snapshot" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "soal_itb_referensi_visibility_check" CHECK ("soal_itb_referensi"."authoring_visibility" IN ('allowed', 'holdout')),
	CONSTRAINT "soal_itb_referensi_version_check" CHECK ("soal_itb_referensi"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "soal_relasi_ide" (
	"id" text PRIMARY KEY NOT NULL,
	"soal_id" text NOT NULL,
	"ide_id" text NOT NULL,
	"relation_type" text NOT NULL,
	"rationale" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "soal_relasi_ide_type_check" CHECK ("soal_relasi_ide"."relation_type" IN ('required', 'prerequisite', 'related'))
);
--> statement-breakpoint
CREATE TABLE "student_chapter_mastery" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"course_id" text NOT NULL,
	"chapter_id" text NOT NULL,
	"mastery_score" bigint NOT NULL,
	"confidence" double precision NOT NULL,
	"evidence_count" bigint NOT NULL,
	"trend" text,
	"last_evidence_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_scm_student_chapter" UNIQUE("student_id","chapter_id")
);
--> statement-breakpoint
CREATE TABLE "student_chapter_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"chapter_id" text NOT NULL,
	"unlocked" boolean DEFAULT false NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_concept_mastery" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"course_id" text NOT NULL,
	"concept_name" text NOT NULL,
	"mastery_score" bigint NOT NULL,
	"confidence" bigint NOT NULL,
	"evidence_count" bigint NOT NULL,
	"trend" text,
	"last_evidence_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_scm_student_course_concept" UNIQUE("student_id","course_id","concept_name")
);
--> statement-breakpoint
CREATE TABLE "student_concept_mastery_history" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"course_id" text NOT NULL,
	"concept_name" text NOT NULL,
	"mastery_score" bigint NOT NULL,
	"confidence" bigint NOT NULL,
	"snapshot_date" text NOT NULL,
	CONSTRAINT "uq_scmh_student_concept_date" UNIQUE("student_id","concept_name","snapshot_date")
);
--> statement-breakpoint
CREATE TABLE "student_flashcard_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"flashcard_id" text NOT NULL,
	"ease_factor" double precision DEFAULT 2.5 NOT NULL,
	"interval_days" bigint DEFAULT 0 NOT NULL,
	"repetitions" bigint DEFAULT 0 NOT NULL,
	"lapses" bigint DEFAULT 0 NOT NULL,
	"due_date" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_student_flashcard" UNIQUE("student_id","flashcard_id")
);
--> statement-breakpoint
CREATE TABLE "student_material_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"material_id" text NOT NULL,
	"completion_percent" bigint DEFAULT 0 NOT NULL,
	"last_section_id" text,
	"last_position" jsonb,
	"time_spent_seconds" bigint DEFAULT 0 NOT NULL,
	"last_opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_student_material" UNIQUE("student_id","material_id")
);
--> statement-breakpoint
CREATE TABLE "student_quiz_analytics" (
	"id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL,
	"student_id" text NOT NULL,
	"template_id" text NOT NULL,
	"course_id" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"computed_metrics" jsonb,
	"ai_diagnosis" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_quiz_analytics_attempt_id_unique" UNIQUE("attempt_id")
);
--> statement-breakpoint
CREATE TABLE "student_quiz_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"template_id" text NOT NULL,
	"score" bigint,
	"duration_seconds" bigint,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"grading_status" text DEFAULT 'not_required' NOT NULL,
	"questions_snapshot" jsonb NOT NULL,
	"answers_snapshot" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"strong_areas" jsonb,
	"weak_areas" jsonb,
	"recommended_next_steps" jsonb,
	"mastery_before" jsonb
);
--> statement-breakpoint
CREATE TABLE "student_streaks" (
	"student_id" text PRIMARY KEY NOT NULL,
	"current_streak" bigint DEFAULT 0 NOT NULL,
	"longest_streak" bigint DEFAULT 0 NOT NULL,
	"last_active_date" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_paths" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"course_id" text NOT NULL,
	"path_json" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_study_paths_student_course" UNIQUE("student_id","course_id")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"exam_id" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"score" bigint,
	"teacher_notes" text,
	"answers_snapshot" jsonb,
	"questions_snapshot" jsonb,
	"submitted_at" timestamp with time zone DEFAULT now(),
	"attempt_number" bigint
);
--> statement-breakpoint
CREATE TABLE "sumber_materi" (
	"id" text PRIMARY KEY NOT NULL,
	"mata_kuliah_id" text NOT NULL,
	"bab_id" text,
	"source_type" text DEFAULT 'markdown' NOT NULL,
	"title" text NOT NULL,
	"canonical_uri_or_r2_key" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"checksum" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"creator_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sumber_materi_version_check" CHECK ("sumber_materi"."version" > 0),
	CONSTRAINT "sumber_materi_source_type_check" CHECK ("sumber_materi"."source_type" IN ('markdown', 'json', 'pdf', 'docx', 'html', 'url', 'transcript', 'tutor_note')),
	CONSTRAINT "sumber_materi_status_check" CHECK ("sumber_materi"."status" IN ('draft', 'active', 'withdrawn', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "tutor_chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"course_id" text NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"sources" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_courses" (
	"id" text PRIMARY KEY NOT NULL,
	"tutor_id" text NOT NULL,
	"course_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_session_summaries" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"course_id" text NOT NULL,
	"asked_concepts" jsonb NOT NULL,
	"question_count" bigint DEFAULT 0 NOT NULL,
	"last_session_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_tss_student_course" UNIQUE("student_id","course_id")
);
--> statement-breakpoint
CREATE TABLE "tutor_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"tutor_id" text NOT NULL,
	"day_of_week" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"mode" text DEFAULT 'online' NOT NULL,
	"location" text,
	"session_date" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text DEFAULT 'student',
	"last_activity_at" timestamp with time zone,
	"faculty" text,
	"major" text,
	"entry_year" bigint,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_push_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"device" text DEFAULT 'unknown' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_push_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "vector_sync_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"ko_id" text,
	"action" text NOT NULL,
	"namespace" text DEFAULT 'learning' NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" bigint DEFAULT 0 NOT NULL,
	"last_error" text,
	"lease_id" text,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "website_material_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"material_id" text NOT NULL,
	"version_number" bigint NOT NULL,
	"canonical_markdown" text NOT NULL,
	"structured_content" jsonb NOT NULL,
	"author_id" text,
	"change_summary" text,
	"is_ai_generated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "website_materials" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"chapter_id" text NOT NULL,
	"source_mtd_id" text NOT NULL,
	"source_mtd_version" bigint NOT NULL,
	"is_stale" boolean DEFAULT false NOT NULL,
	"generation_hash" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"canonical_markdown" text NOT NULL,
	"structured_content" jsonb NOT NULL,
	"term_index" jsonb,
	"content_version" bigint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"coverage_status" text DEFAULT 'not_verified' NOT NULL,
	"coverage_report" jsonb NOT NULL,
	"thumbnail_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_reflections" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"week_start" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_weekly_ref_student_week" UNIQUE("student_id","week_start")
);
--> statement-breakpoint
CREATE TABLE "zyra_learner_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"course_id" text NOT NULL,
	"pace" text,
	"representation" text,
	"explanation_length" text,
	"checkpoint_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_zyra_preferences_student_course" UNIQUE("student_id","course_id")
);
--> statement-breakpoint
CREATE TABLE "zyra_learner_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"course_id" text NOT NULL,
	"profile_version" text DEFAULT 'zyra-personalization-v1' NOT NULL,
	"inferred_pace" text DEFAULT 'unknown' NOT NULL,
	"inferred_representation" text DEFAULT 'unknown' NOT NULL,
	"support_intensity" text DEFAULT 'unknown' NOT NULL,
	"explanation_length" text DEFAULT 'unknown' NOT NULL,
	"checkpoint_type" text DEFAULT 'unknown' NOT NULL,
	"confidence" double precision DEFAULT 0 NOT NULL,
	"evidence_count" bigint DEFAULT 0 NOT NULL,
	"reason_codes" jsonb NOT NULL,
	"last_evidence_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"reset_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_zyra_profile_student_course" UNIQUE("student_id","course_id")
);
--> statement-breakpoint
CREATE TABLE "zyra_learning_events" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"course_id" text NOT NULL,
	"idea_id" text,
	"event_kind" text NOT NULL,
	"source_type" text NOT NULL,
	"evidence_ref" text,
	"outcome" text,
	"correctness" double precision,
	"response_latency_bucket" text DEFAULT 'unknown' NOT NULL,
	"hint_level" text DEFAULT 'unknown' NOT NULL,
	"representation" text DEFAULT 'unknown' NOT NULL,
	"weight" double precision DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "zyra_message_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"course_id" text NOT NULL,
	"session_id" text NOT NULL,
	"message_id" text,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"width" bigint NOT NULL,
	"height" bigint NOT NULL,
	"sanitized_sha256" text NOT NULL,
	"sanitizer_version" text NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"provider_dispatched_at" timestamp with time zone,
	CONSTRAINT "zyra_message_attachments_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE "zyra_operational_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_version" text NOT NULL,
	"event_type" text NOT NULL,
	"actor_role" text NOT NULL,
	"route_class" text NOT NULL,
	"model_class" text NOT NULL,
	"project_fingerprint" text,
	"course_fingerprint" text,
	"result_code" text NOT NULL,
	"latency_bucket" text NOT NULL,
	"size_bucket" text NOT NULL,
	"cache_result" text NOT NULL,
	"attachment_count" bigint DEFAULT 0 NOT NULL,
	"sanitizer_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zyra_proposal_events" (
	"id" text PRIMARY KEY NOT NULL,
	"proposal_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"reason_code" text NOT NULL,
	"diff_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zyra_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"role" text NOT NULL,
	"proposal_type" text NOT NULL,
	"course_id" text,
	"scope" jsonb NOT NULL,
	"evidence_refs" jsonb NOT NULL,
	"precondition_snapshot" jsonb NOT NULL,
	"operations" jsonb NOT NULL,
	"learner_impact" jsonb NOT NULL,
	"reversibility" jsonb NOT NULL,
	"warnings" jsonb NOT NULL,
	"proposer_trace" jsonb NOT NULL,
	"validator_result" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"precondition_version" bigint NOT NULL,
	"diff_hash" text NOT NULL,
	"audit_id" text,
	"failure_code" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_name_change_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"changed_by_id" text NOT NULL,
	"old_name" text NOT NULL,
	"new_name" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_slot_notes" (
	"slot_id" text PRIMARY KEY NOT NULL,
	"notes" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academic_schedules" ADD CONSTRAINT "academic_schedules_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_schedules" ADD CONSTRAINT "academic_schedules_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_ops_knowledge_chunks" ADD CONSTRAINT "admin_ops_knowledge_chunks_source_id_admin_ops_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."admin_ops_knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_ops_knowledge_sync_queue" ADD CONSTRAINT "admin_ops_knowledge_sync_queue_source_id_admin_ops_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."admin_ops_knowledge_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_allowance_leases" ADD CONSTRAINT "ai_allowance_leases_user_id_pengguna_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pengguna"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_extraction_failures" ADD CONSTRAINT "ai_extraction_failures_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_extraction_failures" ADD CONSTRAINT "ai_extraction_failures_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_tutor_id_user_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_traces" ADD CONSTRAINT "ai_generation_traces_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_material_instance_chunks" ADD CONSTRAINT "ai_material_instance_chunks_section_id_ai_material_instance_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."ai_material_instance_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_material_instance_sections" ADD CONSTRAINT "ai_material_instance_sections_material_instance_id_ai_material_instances_id_fk" FOREIGN KEY ("material_instance_id") REFERENCES "public"."ai_material_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_material_instances" ADD CONSTRAINT "ai_material_instances_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_question_bank" ADD CONSTRAINT "ai_question_bank_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_question_bank" ADD CONSTRAINT "ai_question_bank_source_section_id_ai_material_instance_sections_id_fk" FOREIGN KEY ("source_section_id") REFERENCES "public"."ai_material_instance_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_question_bank" ADD CONSTRAINT "ai_question_bank_assessment_source_id_assessment_sources_id_fk" FOREIGN KEY ("assessment_source_id") REFERENCES "public"."assessment_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_question_bank" ADD CONSTRAINT "ai_question_bank_knowledge_object_id_knowledge_objects_id_fk" FOREIGN KEY ("knowledge_object_id") REFERENCES "public"."knowledge_objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_question_bank" ADD CONSTRAINT "ai_question_bank_source_mtd_id_master_teaching_documents_id_fk" FOREIGN KEY ("source_mtd_id") REFERENCES "public"."master_teaching_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_question_bank" ADD CONSTRAINT "ai_question_bank_generation_run_id_question_generation_runs_id_fk" FOREIGN KEY ("generation_run_id") REFERENCES "public"."question_generation_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_question_bank" ADD CONSTRAINT "ai_question_bank_styled_after_assessment_object_id_assessment_objects_id_fk" FOREIGN KEY ("styled_after_assessment_object_id") REFERENCES "public"."assessment_objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alur_konten" ADD CONSTRAINT "alur_konten_assigned_tutor_id_pengguna_id_fk" FOREIGN KEY ("assigned_tutor_id") REFERENCES "public"."pengguna"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artikel" ADD CONSTRAINT "artikel_mata_kuliah_id_mata_kuliah_id_fk" FOREIGN KEY ("mata_kuliah_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artikel" ADD CONSTRAINT "artikel_bab_id_bab_id_fk" FOREIGN KEY ("bab_id") REFERENCES "public"."bab"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artikel" ADD CONSTRAINT "artikel_creator_id_pengguna_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."pengguna"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artikel" ADD CONSTRAINT "artikel_curator_id_pengguna_id_fk" FOREIGN KEY ("curator_id") REFERENCES "public"."pengguna"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artikel_ide" ADD CONSTRAINT "artikel_ide_artikel_id_artikel_id_fk" FOREIGN KEY ("artikel_id") REFERENCES "public"."artikel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artikel_ide" ADD CONSTRAINT "artikel_ide_ide_id_ide_id_fk" FOREIGN KEY ("ide_id") REFERENCES "public"."ide"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asal_ide" ADD CONSTRAINT "asal_ide_ide_id_ide_id_fk" FOREIGN KEY ("ide_id") REFERENCES "public"."ide"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asal_ide" ADD CONSTRAINT "asal_ide_source_chunk_id_potongan_sumber_id_fk" FOREIGN KEY ("source_chunk_id") REFERENCES "public"."potongan_sumber"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asesmen" ADD CONSTRAINT "asesmen_blueprint_asesmen_id_blueprint_asesmen_id_fk" FOREIGN KEY ("blueprint_asesmen_id") REFERENCES "public"."blueprint_asesmen"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asesmen" ADD CONSTRAINT "asesmen_mata_kuliah_id_mata_kuliah_id_fk" FOREIGN KEY ("mata_kuliah_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asesmen" ADD CONSTRAINT "asesmen_creator_id_pengguna_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."pengguna"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asesmen" ADD CONSTRAINT "asesmen_curator_id_pengguna_id_fk" FOREIGN KEY ("curator_id") REFERENCES "public"."pengguna"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_object_concepts" ADD CONSTRAINT "assessment_object_concepts_assessment_object_id_assessment_objects_id_fk" FOREIGN KEY ("assessment_object_id") REFERENCES "public"."assessment_objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_object_concepts" ADD CONSTRAINT "assessment_object_concepts_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_object_kos" ADD CONSTRAINT "assessment_object_kos_assessment_object_id_assessment_objects_id_fk" FOREIGN KEY ("assessment_object_id") REFERENCES "public"."assessment_objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_object_kos" ADD CONSTRAINT "assessment_object_kos_ko_id_knowledge_objects_id_fk" FOREIGN KEY ("ko_id") REFERENCES "public"."knowledge_objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_objects" ADD CONSTRAINT "assessment_objects_source_id_assessment_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."assessment_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_profiles" ADD CONSTRAINT "assessment_profiles_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_source_chapters" ADD CONSTRAINT "assessment_source_chapters_assessment_source_id_assessment_sources_id_fk" FOREIGN KEY ("assessment_source_id") REFERENCES "public"."assessment_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_source_chapters" ADD CONSTRAINT "assessment_source_chapters_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sources" ADD CONSTRAINT "assessment_sources_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sources" ADD CONSTRAINT "assessment_sources_canonical_course_id_mata_kuliah_id_fk" FOREIGN KEY ("canonical_course_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sources" ADD CONSTRAINT "assessment_sources_source_document_id_course_materials_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."course_materials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sources" ADD CONSTRAINT "assessment_sources_solution_document_id_course_materials_id_fk" FOREIGN KEY ("solution_document_id") REFERENCES "public"."course_materials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sources" ADD CONSTRAINT "assessment_sources_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sources" ADD CONSTRAINT "assessment_sources_deleted_by_user_id_user_id_fk" FOREIGN KEY ("deleted_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_feedback" ADD CONSTRAINT "attempt_feedback_attempt_id_student_quiz_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."student_quiz_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_mutasi" ADD CONSTRAINT "audit_mutasi_actor_id_pengguna_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."pengguna"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bab" ADD CONSTRAINT "bab_mata_kuliah_id_mata_kuliah_id_fk" FOREIGN KEY ("mata_kuliah_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bab" ADD CONSTRAINT "bab_legacy_chapter_id_chapters_id_fk" FOREIGN KEY ("legacy_chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bagian_artikel" ADD CONSTRAINT "bagian_artikel_artikel_id_artikel_id_fk" FOREIGN KEY ("artikel_id") REFERENCES "public"."artikel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bagian_artikel" ADD CONSTRAINT "bagian_artikel_bagian_pembelajaran_id_bagian_pembelajaran_id_fk" FOREIGN KEY ("bagian_pembelajaran_id") REFERENCES "public"."bagian_pembelajaran"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bagian_artikel" ADD CONSTRAINT "bagian_artikel_parent_section_id_bagian_artikel_id_fk" FOREIGN KEY ("parent_section_id") REFERENCES "public"."bagian_artikel"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bagian_pembelajaran" ADD CONSTRAINT "bagian_pembelajaran_mata_kuliah_id_mata_kuliah_id_fk" FOREIGN KEY ("mata_kuliah_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bagian_pembelajaran" ADD CONSTRAINT "bagian_pembelajaran_bab_id_bab_id_fk" FOREIGN KEY ("bab_id") REFERENCES "public"."bab"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bagian_pembelajaran" ADD CONSTRAINT "bagian_pembelajaran_parent_section_id_bagian_pembelajaran_id_fk" FOREIGN KEY ("parent_section_id") REFERENCES "public"."bagian_pembelajaran"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bagian_pembelajaran_ide" ADD CONSTRAINT "bagian_pembelajaran_ide_bagian_pembelajaran_id_bagian_pembelajaran_id_fk" FOREIGN KEY ("bagian_pembelajaran_id") REFERENCES "public"."bagian_pembelajaran"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bagian_pembelajaran_ide" ADD CONSTRAINT "bagian_pembelajaran_ide_ide_id_ide_id_fk" FOREIGN KEY ("ide_id") REFERENCES "public"."ide"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_soal" ADD CONSTRAINT "benchmark_soal_soal_itb_referensi_id_soal_itb_referensi_id_fk" FOREIGN KEY ("soal_itb_referensi_id") REFERENCES "public"."soal_itb_referensi"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_articles" ADD CONSTRAINT "blog_articles_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blok_artikel" ADD CONSTRAINT "blok_artikel_artikel_id_artikel_id_fk" FOREIGN KEY ("artikel_id") REFERENCES "public"."artikel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blok_artikel" ADD CONSTRAINT "blok_artikel_bagian_artikel_id_bagian_artikel_id_fk" FOREIGN KEY ("bagian_artikel_id") REFERENCES "public"."bagian_artikel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blok_artikel_ide" ADD CONSTRAINT "blok_artikel_ide_blok_artikel_id_blok_artikel_id_fk" FOREIGN KEY ("blok_artikel_id") REFERENCES "public"."blok_artikel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blok_artikel_ide" ADD CONSTRAINT "blok_artikel_ide_ide_id_ide_id_fk" FOREIGN KEY ("ide_id") REFERENCES "public"."ide"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blok_artikel_sumber" ADD CONSTRAINT "blok_artikel_sumber_blok_artikel_id_blok_artikel_id_fk" FOREIGN KEY ("blok_artikel_id") REFERENCES "public"."blok_artikel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blok_artikel_sumber" ADD CONSTRAINT "blok_artikel_sumber_sumber_materi_id_sumber_materi_id_fk" FOREIGN KEY ("sumber_materi_id") REFERENCES "public"."sumber_materi"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_asesmen" ADD CONSTRAINT "blueprint_asesmen_mata_kuliah_id_mata_kuliah_id_fk" FOREIGN KEY ("mata_kuliah_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_asesmen" ADD CONSTRAINT "blueprint_asesmen_creator_id_pengguna_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."pengguna"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_asesmen" ADD CONSTRAINT "blueprint_asesmen_curator_id_pengguna_id_fk" FOREIGN KEY ("curator_id") REFERENCES "public"."pengguna"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_audit_logs" ADD CONSTRAINT "booking_audit_logs_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_audit_logs" ADD CONSTRAINT "booking_audit_logs_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_audit_logs" ADD CONSTRAINT "booking_audit_logs_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_reschedule_tickets" ADD CONSTRAINT "booking_reschedule_tickets_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_reschedule_tickets" ADD CONSTRAINT "booking_reschedule_tickets_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_reschedule_tickets" ADD CONSTRAINT "booking_reschedule_tickets_requested_by_id_user_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_reschedule_tickets" ADD CONSTRAINT "booking_reschedule_tickets_tutor_id_user_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_reschedule_tickets" ADD CONSTRAINT "booking_reschedule_tickets_proposed_slot_id_tutor_slots_id_fk" FOREIGN KEY ("proposed_slot_id") REFERENCES "public"."tutor_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_reschedule_tickets" ADD CONSTRAINT "booking_reschedule_tickets_decided_by_id_user_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_resources" ADD CONSTRAINT "booking_resources_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_resources" ADD CONSTRAINT "booking_resources_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_ticket_messages" ADD CONSTRAINT "booking_ticket_messages_ticket_id_booking_reschedule_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."booking_reschedule_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_ticket_messages" ADD CONSTRAINT "booking_ticket_messages_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_slot_id_tutor_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."tutor_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_last_modified_by_user_id_fk" FOREIGN KEY ("last_modified_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_completed_by_id_user_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bukti_ide_jawaban" ADD CONSTRAINT "bukti_ide_jawaban_jawaban_murid_id_jawaban_murid_id_fk" FOREIGN KEY ("jawaban_murid_id") REFERENCES "public"."jawaban_murid"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bukti_ide_jawaban" ADD CONSTRAINT "bukti_ide_jawaban_ide_id_ide_id_fk" FOREIGN KEY ("ide_id") REFERENCES "public"."ide"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bukti_pdf_bundle" ADD CONSTRAINT "bukti_pdf_bundle_impor_bundle_id_impor_bundle_id_fk" FOREIGN KEY ("impor_bundle_id") REFERENCES "public"."impor_bundle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bukti_pembelajaran" ADD CONSTRAINT "bukti_pembelajaran_pengguna_id_pengguna_id_fk" FOREIGN KEY ("pengguna_id") REFERENCES "public"."pengguna"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bukti_pembelajaran" ADD CONSTRAINT "bukti_pembelajaran_ide_id_ide_id_fk" FOREIGN KEY ("ide_id") REFERENCES "public"."ide"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cakupan_asesmen" ADD CONSTRAINT "cakupan_asesmen_asesmen_id_asesmen_id_fk" FOREIGN KEY ("asesmen_id") REFERENCES "public"."asesmen"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cakupan_asesmen" ADD CONSTRAINT "cakupan_asesmen_bab_id_bab_id_fk" FOREIGN KEY ("bab_id") REFERENCES "public"."bab"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_path_concepts" ADD CONSTRAINT "career_path_concepts_career_path_template_id_career_path_templates_id_fk" FOREIGN KEY ("career_path_template_id") REFERENCES "public"."career_path_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_path_concepts" ADD CONSTRAINT "career_path_concepts_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_aliases" ADD CONSTRAINT "chapter_aliases_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_sources" ADD CONSTRAINT "chat_message_sources_message_id_tutor_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."tutor_chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_graph_edges" ADD CONSTRAINT "concept_graph_edges_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_localizations" ADD CONSTRAINT "concept_localizations_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_quality_flags" ADD CONSTRAINT "content_quality_flags_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_quality_flags" ADD CONSTRAINT "content_quality_flags_question_id_ai_question_bank_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."ai_question_bank"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_analytics_snapshots" ADD CONSTRAINT "course_analytics_snapshots_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_materials" ADD CONSTRAINT "course_materials_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_policies" ADD CONSTRAINT "course_policies_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_video_playlists" ADD CONSTRAINT "course_video_playlists_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_videos" ADD CONSTRAINT "course_videos_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_videos" ADD CONSTRAINT "course_videos_playlist_id_course_video_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."course_video_playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_videos" ADD CONSTRAINT "course_videos_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_videos" ADD CONSTRAINT "course_videos_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_form_presets" ADD CONSTRAINT "custom_form_presets_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_form_responses" ADD CONSTRAINT "custom_form_responses_form_id_custom_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."custom_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_form_responses" ADD CONSTRAINT "custom_form_responses_responder_user_id_user_id_fk" FOREIGN KEY ("responder_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_forms" ADD CONSTRAINT "custom_forms_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_recommendations" ADD CONSTRAINT "daily_recommendations_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diktat_ide" ADD CONSTRAINT "diktat_ide_diktat_materi_id_diktat_materi_id_fk" FOREIGN KEY ("diktat_materi_id") REFERENCES "public"."diktat_materi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diktat_ide" ADD CONSTRAINT "diktat_ide_ide_id_ide_id_fk" FOREIGN KEY ("ide_id") REFERENCES "public"."ide"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diktat_materi" ADD CONSTRAINT "diktat_materi_mata_kuliah_id_mata_kuliah_id_fk" FOREIGN KEY ("mata_kuliah_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diktat_materi" ADD CONSTRAINT "diktat_materi_bab_id_bab_id_fk" FOREIGN KEY ("bab_id") REFERENCES "public"."bab"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diktat_materi" ADD CONSTRAINT "diktat_materi_creator_id_pengguna_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."pengguna"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diktat_materi" ADD CONSTRAINT "diktat_materi_curator_id_pengguna_id_fk" FOREIGN KEY ("curator_id") REFERENCES "public"."pengguna"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diktat_pembahasan" ADD CONSTRAINT "diktat_pembahasan_diktat_materi_id_diktat_materi_id_fk" FOREIGN KEY ("diktat_materi_id") REFERENCES "public"."diktat_materi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diktat_pembahasan" ADD CONSTRAINT "diktat_pembahasan_creator_id_pengguna_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."pengguna"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diktat_pembahasan" ADD CONSTRAINT "diktat_pembahasan_curator_id_pengguna_id_fk" FOREIGN KEY ("curator_id") REFERENCES "public"."pengguna"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diktats" ADD CONSTRAINT "diktats_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diktats" ADD CONSTRAINT "diktats_source_mtd_id_master_teaching_documents_id_fk" FOREIGN KEY ("source_mtd_id") REFERENCES "public"."master_teaching_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distractor_provenance" ADD CONSTRAINT "distractor_provenance_question_id_ai_question_bank_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."ai_question_bank"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distractor_provenance" ADD CONSTRAINT "distractor_provenance_misconception_ko_id_knowledge_objects_id_fk" FOREIGN KEY ("misconception_ko_id") REFERENCES "public"."knowledge_objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_item" ADD CONSTRAINT "drive_item_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_notification_preferences" ADD CONSTRAINT "email_notification_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_token_courses" ADD CONSTRAINT "enrollment_token_courses_token_id_enrollment_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."enrollment_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_token_courses" ADD CONSTRAINT "enrollment_token_courses_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_tokens" ADD CONSTRAINT "enrollment_tokens_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_runs" ADD CONSTRAINT "extraction_runs_mtd_id_master_teaching_documents_id_fk" FOREIGN KEY ("mtd_id") REFERENCES "public"."master_teaching_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_runs" ADD CONSTRAINT "extraction_runs_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard" ADD CONSTRAINT "flashcard_set_flashcard_id_set_flashcard_id_fk" FOREIGN KEY ("set_flashcard_id") REFERENCES "public"."set_flashcard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_ide" ADD CONSTRAINT "flashcard_ide_flashcard_id_flashcard_id_fk" FOREIGN KEY ("flashcard_id") REFERENCES "public"."flashcard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_ide" ADD CONSTRAINT "flashcard_ide_ide_id_ide_id_fk" FOREIGN KEY ("ide_id") REFERENCES "public"."ide"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_reviews" ADD CONSTRAINT "flashcard_reviews_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_reviews" ADD CONSTRAINT "flashcard_reviews_flashcard_id_flashcards_id_fk" FOREIGN KEY ("flashcard_id") REFERENCES "public"."flashcards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_sets" ADD CONSTRAINT "flashcard_sets_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_sets" ADD CONSTRAINT "flashcard_sets_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_sets" ADD CONSTRAINT "flashcard_sets_source_mtd_id_master_teaching_documents_id_fk" FOREIGN KEY ("source_mtd_id") REFERENCES "public"."master_teaching_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_set_id_flashcard_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."flashcard_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_ko_id_knowledge_objects_id_fk" FOREIGN KEY ("ko_id") REFERENCES "public"."knowledge_objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_forms" ADD CONSTRAINT "google_forms_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_meet_sessions" ADD CONSTRAINT "google_meet_sessions_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_courses" ADD CONSTRAINT "group_courses_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_courses" ADD CONSTRAINT "group_courses_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ide" ADD CONSTRAINT "ide_mata_kuliah_id_mata_kuliah_id_fk" FOREIGN KEY ("mata_kuliah_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ide" ADD CONSTRAINT "ide_bab_id_bab_id_fk" FOREIGN KEY ("bab_id") REFERENCES "public"."bab"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ide" ADD CONSTRAINT "ide_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ide" ADD CONSTRAINT "ide_creator_id_pengguna_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."pengguna"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ide" ADD CONSTRAINT "ide_curator_id_pengguna_id_fk" FOREIGN KEY ("curator_id") REFERENCES "public"."pengguna"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impor_bundle" ADD CONSTRAINT "impor_bundle_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impor_bundle" ADD CONSTRAINT "impor_bundle_requested_by_pengguna_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."pengguna"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "important_links" ADD CONSTRAINT "important_links_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_asesmen" ADD CONSTRAINT "item_asesmen_asesmen_id_asesmen_id_fk" FOREIGN KEY ("asesmen_id") REFERENCES "public"."asesmen"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_asesmen" ADD CONSTRAINT "item_asesmen_soal_id_soal_id_fk" FOREIGN KEY ("soal_id") REFERENCES "public"."soal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_diktat_pembahasan" ADD CONSTRAINT "item_diktat_pembahasan_diktat_pembahasan_id_diktat_pembahasan_id_fk" FOREIGN KEY ("diktat_pembahasan_id") REFERENCES "public"."diktat_pembahasan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_diktat_pembahasan" ADD CONSTRAINT "item_diktat_pembahasan_soal_id_soal_id_fk" FOREIGN KEY ("soal_id") REFERENCES "public"."soal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_impor_bundle" ADD CONSTRAINT "item_impor_bundle_impor_bundle_id_impor_bundle_id_fk" FOREIGN KEY ("impor_bundle_id") REFERENCES "public"."impor_bundle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jawaban_murid" ADD CONSTRAINT "jawaban_murid_percobaan_asesmen_id_percobaan_asesmen_id_fk" FOREIGN KEY ("percobaan_asesmen_id") REFERENCES "public"."percobaan_asesmen"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jawaban_murid" ADD CONSTRAINT "jawaban_murid_item_asesmen_id_item_asesmen_id_fk" FOREIGN KEY ("item_asesmen_id") REFERENCES "public"."item_asesmen"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jawaban_murid" ADD CONSTRAINT "jawaban_murid_reviewer_id_pengguna_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."pengguna"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kemajuan_baca_artikel" ADD CONSTRAINT "kemajuan_baca_artikel_pengguna_id_pengguna_id_fk" FOREIGN KEY ("pengguna_id") REFERENCES "public"."pengguna"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kemajuan_baca_artikel" ADD CONSTRAINT "kemajuan_baca_artikel_artikel_id_artikel_id_fk" FOREIGN KEY ("artikel_id") REFERENCES "public"."artikel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kemajuan_baca_artikel" ADD CONSTRAINT "kemajuan_baca_artikel_bagian_artikel_id_bagian_artikel_id_fk" FOREIGN KEY ("bagian_artikel_id") REFERENCES "public"."bagian_artikel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kemajuan_flashcard_murid" ADD CONSTRAINT "kemajuan_flashcard_murid_pengguna_id_pengguna_id_fk" FOREIGN KEY ("pengguna_id") REFERENCES "public"."pengguna"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kemajuan_flashcard_murid" ADD CONSTRAINT "kemajuan_flashcard_murid_flashcard_id_flashcard_id_fk" FOREIGN KEY ("flashcard_id") REFERENCES "public"."flashcard"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_object_sources" ADD CONSTRAINT "knowledge_object_sources_ko_id_knowledge_objects_id_fk" FOREIGN KEY ("ko_id") REFERENCES "public"."knowledge_objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_object_sources" ADD CONSTRAINT "knowledge_object_sources_extraction_run_id_extraction_runs_id_fk" FOREIGN KEY ("extraction_run_id") REFERENCES "public"."extraction_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_objects" ADD CONSTRAINT "knowledge_objects_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_objects" ADD CONSTRAINT "knowledge_objects_mtd_id_master_teaching_documents_id_fk" FOREIGN KEY ("mtd_id") REFERENCES "public"."master_teaching_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_objects" ADD CONSTRAINT "knowledge_objects_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_objects" ADD CONSTRAINT "knowledge_objects_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_relationships" ADD CONSTRAINT "knowledge_relationships_source_ko_id_knowledge_objects_id_fk" FOREIGN KEY ("source_ko_id") REFERENCES "public"."knowledge_objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_relationships" ADD CONSTRAINT "knowledge_relationships_target_ko_id_knowledge_objects_id_fk" FOREIGN KEY ("target_ko_id") REFERENCES "public"."knowledge_objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_ko_id_knowledge_objects_id_fk" FOREIGN KEY ("ko_id") REFERENCES "public"."knowledge_objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_objectives" ADD CONSTRAINT "learning_objectives_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_objectives" ADD CONSTRAINT "learning_objectives_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_outcome_concepts" ADD CONSTRAINT "learning_outcome_concepts_learning_outcome_id_learning_outcomes_id_fk" FOREIGN KEY ("learning_outcome_id") REFERENCES "public"."learning_outcomes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_outcome_concepts" ADD CONSTRAINT "learning_outcome_concepts_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_outcomes" ADD CONSTRAINT "learning_outcomes_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_outcomes" ADD CONSTRAINT "learning_outcomes_parent_id_learning_outcomes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."learning_outcomes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_backfill_exceptions" ADD CONSTRAINT "legacy_backfill_exceptions_run_id_migration_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."migration_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_quiz_results" ADD CONSTRAINT "live_quiz_results_session_id_live_quiz_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_quiz_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_quiz_results" ADD CONSTRAINT "live_quiz_results_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_quiz_results" ADD CONSTRAINT "live_quiz_results_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_quiz_sessions" ADD CONSTRAINT "live_quiz_sessions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_quiz_sessions" ADD CONSTRAINT "live_quiz_sessions_tutor_id_user_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_quiz_sessions" ADD CONSTRAINT "live_quiz_sessions_template_id_quiz_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."quiz_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_teaching_documents" ADD CONSTRAINT "master_teaching_documents_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_teaching_documents" ADD CONSTRAINT "master_teaching_documents_source_id_drive_item_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."drive_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_teaching_documents" ADD CONSTRAINT "master_teaching_documents_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mastery_recompute_queue" ADD CONSTRAINT "mastery_recompute_queue_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mastery_recompute_queue" ADD CONSTRAINT "mastery_recompute_queue_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mata_kuliah" ADD CONSTRAINT "mata_kuliah_legacy_course_id_courses_id_fk" FOREIGN KEY ("legacy_course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_checkpoints" ADD CONSTRAINT "migration_checkpoints_run_id_migration_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."migration_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pemahaman_ide" ADD CONSTRAINT "pemahaman_ide_pengguna_id_pengguna_id_fk" FOREIGN KEY ("pengguna_id") REFERENCES "public"."pengguna"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pemahaman_ide" ADD CONSTRAINT "pemahaman_ide_ide_id_ide_id_fk" FOREIGN KEY ("ide_id") REFERENCES "public"."ide"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pembahasan_soal" ADD CONSTRAINT "pembahasan_soal_soal_id_soal_id_fk" FOREIGN KEY ("soal_id") REFERENCES "public"."soal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pembahasan_soal" ADD CONSTRAINT "pembahasan_soal_creator_id_pengguna_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."pengguna"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pembahasan_soal" ADD CONSTRAINT "pembahasan_soal_curator_id_pengguna_id_fk" FOREIGN KEY ("curator_id") REFERENCES "public"."pengguna"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pendaftaran_murid" ADD CONSTRAINT "pendaftaran_murid_pengguna_id_pengguna_id_fk" FOREIGN KEY ("pengguna_id") REFERENCES "public"."pengguna"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pendaftaran_murid" ADD CONSTRAINT "pendaftaran_murid_mata_kuliah_id_mata_kuliah_id_fk" FOREIGN KEY ("mata_kuliah_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pendaftaran_murid" ADD CONSTRAINT "pendaftaran_murid_legacy_enrollment_id_enrollments_id_fk" FOREIGN KEY ("legacy_enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pengguna" ADD CONSTRAINT "pengguna_id_user_id_fk" FOREIGN KEY ("id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pengguna_peran" ADD CONSTRAINT "pengguna_peran_pengguna_id_pengguna_id_fk" FOREIGN KEY ("pengguna_id") REFERENCES "public"."pengguna"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pengguna_peran" ADD CONSTRAINT "pengguna_peran_peran_id_peran_id_fk" FOREIGN KEY ("peran_id") REFERENCES "public"."peran"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pengguna_peran" ADD CONSTRAINT "pengguna_peran_audit_actor_pengguna_id_pengguna_id_fk" FOREIGN KEY ("audit_actor_pengguna_id") REFERENCES "public"."pengguna"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penugasan_tutor" ADD CONSTRAINT "penugasan_tutor_pengguna_id_pengguna_id_fk" FOREIGN KEY ("pengguna_id") REFERENCES "public"."pengguna"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penugasan_tutor" ADD CONSTRAINT "penugasan_tutor_mata_kuliah_id_mata_kuliah_id_fk" FOREIGN KEY ("mata_kuliah_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penugasan_tutor" ADD CONSTRAINT "penugasan_tutor_legacy_tutor_course_id_tutor_courses_id_fk" FOREIGN KEY ("legacy_tutor_course_id") REFERENCES "public"."tutor_courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "percobaan_asesmen" ADD CONSTRAINT "percobaan_asesmen_asesmen_id_asesmen_id_fk" FOREIGN KEY ("asesmen_id") REFERENCES "public"."asesmen"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "percobaan_asesmen" ADD CONSTRAINT "percobaan_asesmen_pengguna_id_pengguna_id_fk" FOREIGN KEY ("pengguna_id") REFERENCES "public"."pengguna"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perubahan_pemahaman" ADD CONSTRAINT "perubahan_pemahaman_pemahaman_ide_id_pemahaman_ide_id_fk" FOREIGN KEY ("pemahaman_ide_id") REFERENCES "public"."pemahaman_ide"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perubahan_pemahaman" ADD CONSTRAINT "perubahan_pemahaman_evidence_id_bukti_pembelajaran_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."bukti_pembelajaran"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peta_id_legacy" ADD CONSTRAINT "peta_id_legacy_run_id_migration_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."migration_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pka_announcement_reads" ADD CONSTRAINT "pka_announcement_reads_announcement_id_pka_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."pka_announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pka_announcement_reads" ADD CONSTRAINT "pka_announcement_reads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pka_announcements" ADD CONSTRAINT "pka_announcements_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pka_registrations" ADD CONSTRAINT "pka_registrations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pka_schedules" ADD CONSTRAINT "pka_schedules_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pka_simulation_stages" ADD CONSTRAINT "pka_simulation_stages_quiz_template_id_quiz_templates_id_fk" FOREIGN KEY ("quiz_template_id") REFERENCES "public"."quiz_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pka_stage_progress" ADD CONSTRAINT "pka_stage_progress_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pka_stage_progress" ADD CONSTRAINT "pka_stage_progress_attempt_id_student_quiz_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."student_quiz_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "potongan_sumber" ADD CONSTRAINT "potongan_sumber_sumber_materi_id_sumber_materi_id_fk" FOREIGN KEY ("sumber_materi_id") REFERENCES "public"."sumber_materi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publikasi_bundle" ADD CONSTRAINT "publikasi_bundle_impor_bundle_id_impor_bundle_id_fk" FOREIGN KEY ("impor_bundle_id") REFERENCES "public"."impor_bundle"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publikasi_bundle" ADD CONSTRAINT "publikasi_bundle_approved_review_id_review_bundle_id_fk" FOREIGN KEY ("approved_review_id") REFERENCES "public"."review_bundle"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publikasi_bundle" ADD CONSTRAINT "publikasi_bundle_published_by_pengguna_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."pengguna"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_generation_runs" ADD CONSTRAINT "question_generation_runs_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_option_stats" ADD CONSTRAINT "question_option_stats_question_id_ai_question_bank_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."ai_question_bank"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_option_stats" ADD CONSTRAINT "question_option_stats_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_reference_links" ADD CONSTRAINT "question_reference_links_question_id_soal_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."soal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_reference_links" ADD CONSTRAINT "question_reference_links_reference_question_id_soal_id_fk" FOREIGN KEY ("reference_question_id") REFERENCES "public"."soal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_ai_insights" ADD CONSTRAINT "quiz_ai_insights_template_id_quiz_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."quiz_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_ai_insights" ADD CONSTRAINT "quiz_ai_insights_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_ai_insights" ADD CONSTRAINT "quiz_ai_insights_generated_by_id_user_id_fk" FOREIGN KEY ("generated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_templates" ADD CONSTRAINT "quiz_templates_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rekomendasi_flashcard" ADD CONSTRAINT "rekomendasi_flashcard_pengguna_id_pengguna_id_fk" FOREIGN KEY ("pengguna_id") REFERENCES "public"."pengguna"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rekomendasi_flashcard" ADD CONSTRAINT "rekomendasi_flashcard_flashcard_id_flashcard_id_fk" FOREIGN KEY ("flashcard_id") REFERENCES "public"."flashcard"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rekomendasi_flashcard" ADD CONSTRAINT "rekomendasi_flashcard_ide_id_ide_id_fk" FOREIGN KEY ("ide_id") REFERENCES "public"."ide"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relasi_ide" ADD CONSTRAINT "relasi_ide_source_idea_id_ide_id_fk" FOREIGN KEY ("source_idea_id") REFERENCES "public"."ide"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relasi_ide" ADD CONSTRAINT "relasi_ide_target_idea_id_ide_id_fk" FOREIGN KEY ("target_idea_id") REFERENCES "public"."ide"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_bundle" ADD CONSTRAINT "review_bundle_impor_bundle_id_impor_bundle_id_fk" FOREIGN KEY ("impor_bundle_id") REFERENCES "public"."impor_bundle"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_bundle" ADD CONSTRAINT "review_bundle_reviewer_id_pengguna_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."pengguna"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_flashcard" ADD CONSTRAINT "review_flashcard_kemajuan_flashcard_murid_id_kemajuan_flashcard_murid_id_fk" FOREIGN KEY ("kemajuan_flashcard_murid_id") REFERENCES "public"."kemajuan_flashcard_murid"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_item_bundle" ADD CONSTRAINT "review_item_bundle_impor_bundle_id_impor_bundle_id_fk" FOREIGN KEY ("impor_bundle_id") REFERENCES "public"."impor_bundle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_item_bundle" ADD CONSTRAINT "review_item_bundle_reviewer_id_pengguna_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."pengguna"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_pedagogi_bundle" ADD CONSTRAINT "review_pedagogi_bundle_impor_bundle_id_impor_bundle_id_fk" FOREIGN KEY ("impor_bundle_id") REFERENCES "public"."impor_bundle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_pedagogi_bundle" ADD CONSTRAINT "review_pedagogi_bundle_reviewer_id_pengguna_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."pengguna"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_flashcard" ADD CONSTRAINT "set_flashcard_mata_kuliah_id_mata_kuliah_id_fk" FOREIGN KEY ("mata_kuliah_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_flashcard" ADD CONSTRAINT "set_flashcard_bab_id_bab_id_fk" FOREIGN KEY ("bab_id") REFERENCES "public"."bab"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_flashcard" ADD CONSTRAINT "set_flashcard_creator_id_pengguna_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."pengguna"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_flashcard" ADD CONSTRAINT "set_flashcard_curator_id_pengguna_id_fk" FOREIGN KEY ("curator_id") REFERENCES "public"."pengguna"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_link" ADD CONSTRAINT "short_link_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soal" ADD CONSTRAINT "soal_mata_kuliah_id_mata_kuliah_id_fk" FOREIGN KEY ("mata_kuliah_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soal" ADD CONSTRAINT "soal_bab_id_bab_id_fk" FOREIGN KEY ("bab_id") REFERENCES "public"."bab"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soal" ADD CONSTRAINT "soal_assessment_source_id_assessment_sources_id_fk" FOREIGN KEY ("assessment_source_id") REFERENCES "public"."assessment_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soal" ADD CONSTRAINT "soal_creator_id_pengguna_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."pengguna"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soal" ADD CONSTRAINT "soal_curator_id_pengguna_id_fk" FOREIGN KEY ("curator_id") REFERENCES "public"."pengguna"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soal_ide" ADD CONSTRAINT "soal_ide_soal_id_soal_id_fk" FOREIGN KEY ("soal_id") REFERENCES "public"."soal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soal_ide" ADD CONSTRAINT "soal_ide_ide_id_ide_id_fk" FOREIGN KEY ("ide_id") REFERENCES "public"."ide"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soal_itb_referensi" ADD CONSTRAINT "soal_itb_referensi_soal_id_soal_id_fk" FOREIGN KEY ("soal_id") REFERENCES "public"."soal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soal_relasi_ide" ADD CONSTRAINT "soal_relasi_ide_soal_id_soal_id_fk" FOREIGN KEY ("soal_id") REFERENCES "public"."soal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soal_relasi_ide" ADD CONSTRAINT "soal_relasi_ide_ide_id_ide_id_fk" FOREIGN KEY ("ide_id") REFERENCES "public"."ide"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_chapter_mastery" ADD CONSTRAINT "student_chapter_mastery_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_chapter_mastery" ADD CONSTRAINT "student_chapter_mastery_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_chapter_mastery" ADD CONSTRAINT "student_chapter_mastery_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_chapter_progress" ADD CONSTRAINT "student_chapter_progress_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_chapter_progress" ADD CONSTRAINT "student_chapter_progress_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_concept_mastery" ADD CONSTRAINT "student_concept_mastery_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_concept_mastery" ADD CONSTRAINT "student_concept_mastery_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_concept_mastery_history" ADD CONSTRAINT "student_concept_mastery_history_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_concept_mastery_history" ADD CONSTRAINT "student_concept_mastery_history_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_flashcard_progress" ADD CONSTRAINT "student_flashcard_progress_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_flashcard_progress" ADD CONSTRAINT "student_flashcard_progress_flashcard_id_flashcards_id_fk" FOREIGN KEY ("flashcard_id") REFERENCES "public"."flashcards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_material_progress" ADD CONSTRAINT "student_material_progress_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_material_progress" ADD CONSTRAINT "student_material_progress_material_id_website_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."website_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_quiz_analytics" ADD CONSTRAINT "student_quiz_analytics_attempt_id_student_quiz_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."student_quiz_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_quiz_analytics" ADD CONSTRAINT "student_quiz_analytics_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_quiz_analytics" ADD CONSTRAINT "student_quiz_analytics_template_id_quiz_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."quiz_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_quiz_analytics" ADD CONSTRAINT "student_quiz_analytics_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_quiz_attempts" ADD CONSTRAINT "student_quiz_attempts_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_quiz_attempts" ADD CONSTRAINT "student_quiz_attempts_template_id_quiz_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."quiz_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_streaks" ADD CONSTRAINT "student_streaks_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_paths" ADD CONSTRAINT "study_paths_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_paths" ADD CONSTRAINT "study_paths_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sumber_materi" ADD CONSTRAINT "sumber_materi_mata_kuliah_id_mata_kuliah_id_fk" FOREIGN KEY ("mata_kuliah_id") REFERENCES "public"."mata_kuliah"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sumber_materi" ADD CONSTRAINT "sumber_materi_bab_id_bab_id_fk" FOREIGN KEY ("bab_id") REFERENCES "public"."bab"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sumber_materi" ADD CONSTRAINT "sumber_materi_creator_id_pengguna_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."pengguna"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_chat_messages" ADD CONSTRAINT "tutor_chat_messages_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_chat_messages" ADD CONSTRAINT "tutor_chat_messages_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_chat_messages" ADD CONSTRAINT "tutor_chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_courses" ADD CONSTRAINT "tutor_courses_tutor_id_user_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_courses" ADD CONSTRAINT "tutor_courses_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_session_summaries" ADD CONSTRAINT "tutor_session_summaries_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_session_summaries" ADD CONSTRAINT "tutor_session_summaries_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_slots" ADD CONSTRAINT "tutor_slots_tutor_id_user_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_push_tokens" ADD CONSTRAINT "user_push_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vector_sync_queue" ADD CONSTRAINT "vector_sync_queue_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vector_sync_queue" ADD CONSTRAINT "vector_sync_queue_ko_id_knowledge_objects_id_fk" FOREIGN KEY ("ko_id") REFERENCES "public"."knowledge_objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_material_versions" ADD CONSTRAINT "website_material_versions_material_id_website_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."website_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_material_versions" ADD CONSTRAINT "website_material_versions_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_materials" ADD CONSTRAINT "website_materials_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_materials" ADD CONSTRAINT "website_materials_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_materials" ADD CONSTRAINT "website_materials_source_mtd_id_master_teaching_documents_id_fk" FOREIGN KEY ("source_mtd_id") REFERENCES "public"."master_teaching_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reflections" ADD CONSTRAINT "weekly_reflections_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zyra_learner_preferences" ADD CONSTRAINT "zyra_learner_preferences_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zyra_learner_preferences" ADD CONSTRAINT "zyra_learner_preferences_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zyra_learner_profiles" ADD CONSTRAINT "zyra_learner_profiles_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zyra_learner_profiles" ADD CONSTRAINT "zyra_learner_profiles_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zyra_learning_events" ADD CONSTRAINT "zyra_learning_events_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zyra_learning_events" ADD CONSTRAINT "zyra_learning_events_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zyra_learning_events" ADD CONSTRAINT "zyra_learning_events_idea_id_ide_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ide"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zyra_message_attachments" ADD CONSTRAINT "zyra_message_attachments_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zyra_message_attachments" ADD CONSTRAINT "zyra_message_attachments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zyra_message_attachments" ADD CONSTRAINT "zyra_message_attachments_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zyra_message_attachments" ADD CONSTRAINT "zyra_message_attachments_message_id_tutor_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."tutor_chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zyra_proposal_events" ADD CONSTRAINT "zyra_proposal_events_proposal_id_zyra_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."zyra_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zyra_proposal_events" ADD CONSTRAINT "zyra_proposal_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zyra_proposals" ADD CONSTRAINT "zyra_proposals_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zyra_proposals" ADD CONSTRAINT "zyra_proposals_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_name_change_audit" ADD CONSTRAINT "group_name_change_audit_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_name_change_audit" ADD CONSTRAINT "group_name_change_audit_changed_by_id_user_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_slot_notes" ADD CONSTRAINT "tutor_slot_notes_slot_id_tutor_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."tutor_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_academic_sched_type" ON "academic_schedules" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_academic_sched_course_id" ON "academic_schedules" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "idx_academic_sched_start_date" ON "academic_schedules" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_admin_ops_chunks_source" ON "admin_ops_knowledge_chunks" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "idx_admin_ops_chunks_status" ON "admin_ops_knowledge_chunks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_admin_ops_chunks_vector_id" ON "admin_ops_knowledge_chunks" USING btree ("vector_id");--> statement-breakpoint
CREATE INDEX "idx_admin_ops_chunks_content_hash" ON "admin_ops_knowledge_chunks" USING btree ("content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_admin_ops_chunks_source_index_ver" ON "admin_ops_knowledge_chunks" USING btree ("source_id","chunk_index","version");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_admin_ops_sources_path" ON "admin_ops_knowledge_sources" USING btree ("source_path");--> statement-breakpoint
CREATE INDEX "idx_admin_ops_sources_status" ON "admin_ops_knowledge_sources" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_admin_ops_sources_hash" ON "admin_ops_knowledge_sources" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "idx_admin_ops_sync_queue_status" ON "admin_ops_knowledge_sync_queue" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_allowance_leases_idempotency_idx" ON "ai_allowance_leases" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "ai_allowance_leases_user_day_idx" ON "ai_allowance_leases" USING btree ("user_id","app_day");--> statement-breakpoint
CREATE INDEX "ai_allowance_leases_user_tier_feature_day_idx" ON "ai_allowance_leases" USING btree ("user_id","access_tier","feature","app_day");--> statement-breakpoint
CREATE INDEX "ai_allowance_leases_user_status_idx" ON "ai_allowance_leases" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "ai_allowance_leases_control_plane_idx" ON "ai_allowance_leases" USING btree ("control_plane_lease_id");--> statement-breakpoint
CREATE INDEX "ai_allowance_leases_run_idx" ON "ai_allowance_leases" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_ai_fail_course" ON "ai_extraction_failures" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "idx_ai_fail_chapter" ON "ai_extraction_failures" USING btree ("chapter_id");--> statement-breakpoint
CREATE INDEX "idx_jobs_status" ON "ai_generation_jobs" USING btree ("course_id","status");--> statement-breakpoint
CREATE INDEX "idx_traces_user_created" ON "ai_generation_traces" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_traces_stage_prompt" ON "ai_generation_traces" USING btree ("stage_id","prompt_version");--> statement-breakpoint
CREATE INDEX "idx_chunks_section" ON "ai_material_instance_chunks" USING btree ("section_id","order_index");--> statement-breakpoint
CREATE INDEX "ai_sections_instance_idx" ON "ai_material_instance_sections" USING btree ("material_instance_id","order_index");--> statement-breakpoint
CREATE INDEX "ai_instances_course_idx" ON "ai_material_instances" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "idx_qbank_selection" ON "ai_question_bank" USING btree ("course_id","review_status","difficulty","use_count");--> statement-breakpoint
CREATE INDEX "idx_qbank_tags" ON "ai_question_bank" USING btree ("tags");--> statement-breakpoint
CREATE INDEX "idx_qbank_ko" ON "ai_question_bank" USING btree ("knowledge_object_id");--> statement-breakpoint
CREATE INDEX "idx_qbank_gen_run" ON "ai_question_bank" USING btree ("generation_run_id");--> statement-breakpoint
CREATE INDEX "idx_qbank_origin" ON "ai_question_bank" USING btree ("origin","source_event_name");--> statement-breakpoint
CREATE INDEX "idx_qbank_quiz_eligible" ON "ai_question_bank" USING btree ("course_id","review_status","quiz_eligible");--> statement-breakpoint
CREATE INDEX "idx_usage_user_created" ON "ai_usage_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "alur_konten_entity_version_idx" ON "alur_konten" USING btree ("entity_type","entity_id","version");--> statement-breakpoint
CREATE INDEX "alur_konten_course_state_idx" ON "alur_konten" USING btree ("course_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "artikel_slug_idx" ON "artikel" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "artikel_course_idx" ON "artikel" USING btree ("mata_kuliah_id");--> statement-breakpoint
CREATE INDEX "artikel_chapter_idx" ON "artikel" USING btree ("bab_id");--> statement-breakpoint
CREATE INDEX "artikel_status_version_idx" ON "artikel" USING btree ("status","version");--> statement-breakpoint
CREATE INDEX "artikel_structure_status_idx" ON "artikel" USING btree ("structure_status");--> statement-breakpoint
CREATE UNIQUE INDEX "artikel_ide_unique_idx" ON "artikel_ide" USING btree ("artikel_id","ide_id");--> statement-breakpoint
CREATE INDEX "artikel_ide_ide_idx" ON "artikel_ide" USING btree ("ide_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asal_ide_span_idx" ON "asal_ide" USING btree ("ide_id","source_chunk_id","start_offset","end_offset");--> statement-breakpoint
CREATE INDEX "asal_ide_ide_idx" ON "asal_ide" USING btree ("ide_id");--> statement-breakpoint
CREATE INDEX "asal_ide_source_idx" ON "asal_ide" USING btree ("source_chunk_id");--> statement-breakpoint
CREATE INDEX "asesmen_course_idx" ON "asesmen" USING btree ("mata_kuliah_id");--> statement-breakpoint
CREATE INDEX "asesmen_status_version_idx" ON "asesmen" USING btree ("status","version");--> statement-breakpoint
CREATE INDEX "idx_ao_concepts_ao" ON "assessment_object_concepts" USING btree ("assessment_object_id");--> statement-breakpoint
CREATE INDEX "idx_ao_concepts_concept" ON "assessment_object_concepts" USING btree ("concept_id");--> statement-breakpoint
CREATE INDEX "idx_ao_kos_ao" ON "assessment_object_kos" USING btree ("assessment_object_id");--> statement-breakpoint
CREATE INDEX "idx_ao_kos_ko" ON "assessment_object_kos" USING btree ("ko_id");--> statement-breakpoint
CREATE INDEX "idx_asc_source" ON "assessment_source_chapters" USING btree ("assessment_source_id");--> statement-breakpoint
CREATE INDEX "idx_asc_chapter" ON "assessment_source_chapters" USING btree ("chapter_id");--> statement-breakpoint
CREATE INDEX "assessment_sources_canonical_course_idx" ON "assessment_sources" USING btree ("canonical_course_id","status");--> statement-breakpoint
CREATE INDEX "assessment_sources_document_idx" ON "assessment_sources" USING btree ("source_document_id","solution_document_id");--> statement-breakpoint
CREATE INDEX "audit_mutasi_entity_idx" ON "audit_mutasi" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_mutasi_actor_idx" ON "audit_mutasi" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_mutasi_course_outcome_idx" ON "audit_mutasi" USING btree ("course_id","outcome","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bab_course_code_idx" ON "bab" USING btree ("mata_kuliah_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "bab_course_order_idx" ON "bab" USING btree ("mata_kuliah_id","order_index");--> statement-breakpoint
CREATE INDEX "bab_legacy_chapter_idx" ON "bab" USING btree ("legacy_chapter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bagian_artikel_key_idx" ON "bagian_artikel" USING btree ("artikel_id","version","section_key");--> statement-breakpoint
CREATE UNIQUE INDEX "bagian_artikel_slug_idx" ON "bagian_artikel" USING btree ("artikel_id","version","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "bagian_artikel_order_idx" ON "bagian_artikel" USING btree ("artikel_id","version","parent_section_id","order_index");--> statement-breakpoint
CREATE INDEX "bagian_artikel_learning_section_idx" ON "bagian_artikel" USING btree ("bagian_pembelajaran_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bagian_pembelajaran_stable_key_idx" ON "bagian_pembelajaran" USING btree ("stable_key");--> statement-breakpoint
CREATE UNIQUE INDEX "bagian_pembelajaran_slug_idx" ON "bagian_pembelajaran" USING btree ("mata_kuliah_id","bab_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "bagian_pembelajaran_order_idx" ON "bagian_pembelajaran" USING btree ("bab_id","parent_section_id","order_index");--> statement-breakpoint
CREATE INDEX "bagian_pembelajaran_parent_idx" ON "bagian_pembelajaran" USING btree ("parent_section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bagian_pembelajaran_ide_unique_idx" ON "bagian_pembelajaran_ide" USING btree ("bagian_pembelajaran_id","ide_id");--> statement-breakpoint
CREATE INDEX "bagian_pembelajaran_ide_ide_idx" ON "bagian_pembelajaran_ide" USING btree ("ide_id");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_soal_checksum_idx" ON "benchmark_soal" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "benchmark_soal_dataset_idx" ON "benchmark_soal" USING btree ("dataset_key");--> statement-breakpoint
CREATE INDEX "idx_blog_slug" ON "blog_articles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_blog_status" ON "blog_articles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_blog_category" ON "blog_articles" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "blok_artikel_key_idx" ON "blok_artikel" USING btree ("artikel_id","version","block_key");--> statement-breakpoint
CREATE INDEX "blok_artikel_order_idx" ON "blok_artikel" USING btree ("artikel_id","version","bagian_artikel_id","order_index");--> statement-breakpoint
CREATE INDEX "blok_artikel_section_idx" ON "blok_artikel" USING btree ("bagian_artikel_id");--> statement-breakpoint
CREATE INDEX "blok_artikel_status_idx" ON "blok_artikel" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "blok_artikel_ide_unique_idx" ON "blok_artikel_ide" USING btree ("blok_artikel_id","ide_id");--> statement-breakpoint
CREATE INDEX "blok_artikel_ide_ide_idx" ON "blok_artikel_ide" USING btree ("ide_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blok_artikel_sumber_unique_idx" ON "blok_artikel_sumber" USING btree ("blok_artikel_id","sumber_materi_id","source_version");--> statement-breakpoint
CREATE INDEX "blok_artikel_sumber_source_idx" ON "blok_artikel_sumber" USING btree ("sumber_materi_id");--> statement-breakpoint
CREATE INDEX "blueprint_asesmen_course_idx" ON "blueprint_asesmen" USING btree ("mata_kuliah_id");--> statement-breakpoint
CREATE INDEX "blueprint_asesmen_status_version_idx" ON "blueprint_asesmen" USING btree ("status","version");--> statement-breakpoint
CREATE INDEX "idx_booking_audit_booking_id" ON "booking_audit_logs" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_audit_group_id" ON "booking_audit_logs" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "idx_booking_audit_actor_id" ON "booking_audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "idx_reschedule_booking_id" ON "booking_reschedule_tickets" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_reschedule_group_id" ON "booking_reschedule_tickets" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "idx_reschedule_status" ON "booking_reschedule_tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "booking_resources_booking_idx" ON "booking_resources" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_resources_booking_phase_idx" ON "booking_resources" USING btree ("booking_id","phase");--> statement-breakpoint
CREATE INDEX "booking_resources_creator_idx" ON "booking_resources" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "idx_ticket_messages_ticket_id" ON "booking_ticket_messages" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "idx_ticket_messages_sender_id" ON "booking_ticket_messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "bookings_slot_idx" ON "bookings" USING btree ("slot_id");--> statement-breakpoint
CREATE INDEX "bookings_student_idx" ON "bookings" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "bookings_group_idx" ON "bookings" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bookings_session_date_idx" ON "bookings" USING btree ("session_date");--> statement-breakpoint
CREATE UNIQUE INDEX "bukti_ide_jawaban_unique_idx" ON "bukti_ide_jawaban" USING btree ("jawaban_murid_id","ide_id");--> statement-breakpoint
CREATE INDEX "bukti_ide_jawaban_ide_idx" ON "bukti_ide_jawaban" USING btree ("ide_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bukti_pdf_bundle_lineage_idx" ON "bukti_pdf_bundle" USING btree ("impor_bundle_id","product_id","diktat_hash","print_profile");--> statement-breakpoint
CREATE INDEX "bukti_pdf_bundle_import_idx" ON "bukti_pdf_bundle" USING btree ("impor_bundle_id");--> statement-breakpoint
CREATE INDEX "bukti_pdf_bundle_product_idx" ON "bukti_pdf_bundle" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "bukti_pdf_bundle_status_idx" ON "bukti_pdf_bundle" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bukti_pdf_bundle_diktat_hash_idx" ON "bukti_pdf_bundle" USING btree ("diktat_hash");--> statement-breakpoint
CREATE INDEX "bukti_pdf_bundle_article_hash_idx" ON "bukti_pdf_bundle" USING btree ("article_hash");--> statement-breakpoint
CREATE INDEX "bukti_pembelajaran_murid_ide_idx" ON "bukti_pembelajaran" USING btree ("pengguna_id","ide_id");--> statement-breakpoint
CREATE INDEX "bukti_pembelajaran_source_idx" ON "bukti_pembelajaran" USING btree ("evidence_source","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bukti_pembelajaran_idempotency_idx" ON "bukti_pembelajaran" USING btree ("evidence_source","source_id","ide_id","rubric_version");--> statement-breakpoint
CREATE UNIQUE INDEX "cakupan_asesmen_chapter_idx" ON "cakupan_asesmen" USING btree ("asesmen_id","bab_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cakupan_asesmen_order_idx" ON "cakupan_asesmen" USING btree ("asesmen_id","order_index");--> statement-breakpoint
CREATE INDEX "idx_career_path_concepts_template" ON "career_path_concepts" USING btree ("career_path_template_id");--> statement-breakpoint
CREATE INDEX "idx_career_path_concepts_concept" ON "career_path_concepts" USING btree ("concept_id");--> statement-breakpoint
CREATE INDEX "idx_chapters_course_order" ON "chapters" USING btree ("course_id","order_index");--> statement-breakpoint
CREATE INDEX "idx_cms_message" ON "chat_message_sources" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_cms_source" ON "chat_message_sources" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "idx_chat_sessions_student_course" ON "chat_sessions" USING btree ("student_id","course_id");--> statement-breakpoint
CREATE INDEX "idx_chat_sessions_last_message" ON "chat_sessions" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "idx_cge_course" ON "concept_graph_edges" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "idx_concept_loc_concept" ON "concept_localizations" USING btree ("concept_id");--> statement-breakpoint
CREATE INDEX "idx_cqf_course" ON "content_quality_flags" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "idx_cqf_question" ON "content_quality_flags" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_course_snapshot_lookup" ON "course_analytics_snapshots" USING btree ("course_id","date");--> statement-breakpoint
CREATE INDEX "idx_course_materials_course" ON "course_materials" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "idx_course_video_playlists_course" ON "course_video_playlists" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "idx_course_videos_course" ON "course_videos" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "idx_course_videos_playlist" ON "course_videos" USING btree ("playlist_id");--> statement-breakpoint
CREATE INDEX "idx_course_videos_chapter" ON "course_videos" USING btree ("chapter_id");--> statement-breakpoint
CREATE INDEX "idx_custom_form_presets_category" ON "custom_form_presets" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_custom_form_responses_form_id" ON "custom_form_responses" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX "idx_custom_form_responses_user_id" ON "custom_form_responses" USING btree ("responder_user_id");--> statement-breakpoint
CREATE INDEX "idx_custom_forms_slug" ON "custom_forms" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_custom_forms_category" ON "custom_forms" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_daily_rec_student" ON "daily_recommendations" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "diktat_ide_unique_idx" ON "diktat_ide" USING btree ("diktat_materi_id","ide_id");--> statement-breakpoint
CREATE INDEX "diktat_ide_ide_idx" ON "diktat_ide" USING btree ("ide_id");--> statement-breakpoint
CREATE INDEX "diktat_materi_course_idx" ON "diktat_materi" USING btree ("mata_kuliah_id");--> statement-breakpoint
CREATE INDEX "diktat_materi_chapter_idx" ON "diktat_materi" USING btree ("bab_id");--> statement-breakpoint
CREATE INDEX "diktat_materi_status_version_idx" ON "diktat_materi" USING btree ("status","version");--> statement-breakpoint
CREATE INDEX "diktat_pembahasan_diktat_idx" ON "diktat_pembahasan" USING btree ("diktat_materi_id");--> statement-breakpoint
CREATE INDEX "discount_vouchers_code_idx" ON "discount_vouchers" USING btree ("code");--> statement-breakpoint
CREATE INDEX "discount_vouchers_is_active_idx" ON "discount_vouchers" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_distractor_prov_q" ON "distractor_provenance" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_distractor_prov_ko" ON "distractor_provenance" USING btree ("misconception_ko_id");--> statement-breakpoint
CREATE INDEX "drive_item_parent_idx" ON "drive_item" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "drive_item_created_by_idx" ON "drive_item" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "token_courses_token_idx" ON "enrollment_token_courses" USING btree ("token_id");--> statement-breakpoint
CREATE INDEX "token_courses_course_idx" ON "enrollment_token_courses" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "export_spreadsheets_entity_idx" ON "export_spreadsheets" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_extraction_runs_chapter" ON "extraction_runs" USING btree ("chapter_id");--> statement-breakpoint
CREATE INDEX "idx_extraction_runs_state" ON "extraction_runs" USING btree ("state");--> statement-breakpoint
CREATE INDEX "flashcard_set_idx" ON "flashcard" USING btree ("set_flashcard_id");--> statement-breakpoint
CREATE INDEX "flashcard_status_version_idx" ON "flashcard" USING btree ("status","version");--> statement-breakpoint
CREATE UNIQUE INDEX "flashcard_ide_unique_idx" ON "flashcard_ide" USING btree ("flashcard_id","ide_id");--> statement-breakpoint
CREATE INDEX "flashcard_ide_ide_idx" ON "flashcard_ide" USING btree ("ide_id");--> statement-breakpoint
CREATE INDEX "idx_fc_reviews_student" ON "flashcard_reviews" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_fc_reviews_card" ON "flashcard_reviews" USING btree ("flashcard_id");--> statement-breakpoint
CREATE INDEX "idx_forms_form_id" ON "google_forms" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX "idx_forms_category" ON "google_forms" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_meet_space_name" ON "google_meet_sessions" USING btree ("space_name");--> statement-breakpoint
CREATE INDEX "idx_meet_code" ON "google_meet_sessions" USING btree ("meeting_code");--> statement-breakpoint
CREATE INDEX "idx_meet_slug" ON "google_meet_sessions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "group_courses_group_idx" ON "group_courses" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "group_courses_course_idx" ON "group_courses" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "group_members_group_idx" ON "group_members" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "group_members_user_idx" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ide_stable_key_idx" ON "ide" USING btree ("stable_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ide_course_code_idx" ON "ide" USING btree ("mata_kuliah_id","code");--> statement-breakpoint
CREATE INDEX "ide_bab_idx" ON "ide" USING btree ("bab_id");--> statement-breakpoint
CREATE INDEX "ide_concept_idx" ON "ide" USING btree ("concept_id");--> statement-breakpoint
CREATE INDEX "ide_status_idx" ON "ide" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "impor_bundle_identity_idx" ON "impor_bundle" USING btree ("bundle_id","checksum");--> statement-breakpoint
CREATE INDEX "impor_bundle_status_idx" ON "impor_bundle" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_important_links_category" ON "important_links" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_important_links_active" ON "important_links" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_active_intervention" ON "interventions" USING btree ("student_id","concept_name") WHERE "status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "item_asesmen_order_idx" ON "item_asesmen" USING btree ("asesmen_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "item_asesmen_soal_idx" ON "item_asesmen" USING btree ("asesmen_id","soal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_diktat_pembahasan_order_idx" ON "item_diktat_pembahasan" USING btree ("diktat_pembahasan_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "item_diktat_pembahasan_soal_idx" ON "item_diktat_pembahasan" USING btree ("diktat_pembahasan_id","soal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_impor_bundle_entity_idx" ON "item_impor_bundle" USING btree ("impor_bundle_id","entity_type","entity_id","entity_version");--> statement-breakpoint
CREATE INDEX "item_impor_bundle_status_idx" ON "item_impor_bundle" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "jawaban_murid_attempt_item_idx" ON "jawaban_murid" USING btree ("percobaan_asesmen_id","item_asesmen_id");--> statement-breakpoint
CREATE INDEX "jawaban_murid_status_idx" ON "jawaban_murid" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "kemajuan_baca_artikel_unique_idx" ON "kemajuan_baca_artikel" USING btree ("pengguna_id","artikel_id","artikel_version","bagian_artikel_id");--> statement-breakpoint
CREATE INDEX "kemajuan_baca_artikel_resume_idx" ON "kemajuan_baca_artikel" USING btree ("pengguna_id","artikel_id","last_read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "kemajuan_flashcard_murid_unique_idx" ON "kemajuan_flashcard_murid" USING btree ("pengguna_id","flashcard_id");--> statement-breakpoint
CREATE INDEX "kemajuan_flashcard_murid_due_idx" ON "kemajuan_flashcard_murid" USING btree ("pengguna_id","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ketergantungan_produk_edge_idx" ON "ketergantungan_produk" USING btree ("upstream_entity_type","upstream_entity_id","downstream_entity_type","downstream_entity_id");--> statement-breakpoint
CREATE INDEX "ketergantungan_produk_upstream_idx" ON "ketergantungan_produk" USING btree ("upstream_entity_type","upstream_entity_id");--> statement-breakpoint
CREATE INDEX "ketergantungan_produk_downstream_idx" ON "ketergantungan_produk" USING btree ("downstream_entity_type","downstream_entity_id");--> statement-breakpoint
CREATE INDEX "idx_ko_sources_ko" ON "knowledge_object_sources" USING btree ("ko_id");--> statement-breakpoint
CREATE INDEX "idx_ko_sources_doc_chapter" ON "knowledge_object_sources" USING btree ("source_document_id","chapter_id");--> statement-breakpoint
CREATE INDEX "idx_ko_course" ON "knowledge_objects" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "idx_ko_chapter" ON "knowledge_objects" USING btree ("chapter_id");--> statement-breakpoint
CREATE INDEX "idx_ko_concept" ON "knowledge_objects" USING btree ("concept_id");--> statement-breakpoint
CREATE INDEX "idx_ko_status" ON "knowledge_objects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ko_stable_key" ON "knowledge_objects" USING btree ("stable_key");--> statement-breakpoint
CREATE INDEX "idx_rel_source" ON "knowledge_relationships" USING btree ("source_ko_id");--> statement-breakpoint
CREATE INDEX "idx_rel_target" ON "knowledge_relationships" USING btree ("target_ko_id");--> statement-breakpoint
CREATE INDEX "idx_rel_source_target_type" ON "knowledge_relationships" USING btree ("source_ko_id","target_ko_id","type");--> statement-breakpoint
CREATE INDEX "idx_le_student_course_created" ON "learning_events" USING btree ("student_id","course_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_le_student_concept" ON "learning_events" USING btree ("student_id","concept_name");--> statement-breakpoint
CREATE INDEX "idx_learning_objectives_chapter" ON "learning_objectives" USING btree ("chapter_id");--> statement-breakpoint
CREATE INDEX "idx_lo_concepts_lo" ON "learning_outcome_concepts" USING btree ("learning_outcome_id");--> statement-breakpoint
CREATE INDEX "idx_lo_concepts_concept" ON "learning_outcome_concepts" USING btree ("concept_id");--> statement-breakpoint
CREATE INDEX "idx_learning_outcomes_course" ON "learning_outcomes" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "idx_learning_outcomes_parent" ON "learning_outcomes" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_backfill_exception_source_idx" ON "legacy_backfill_exceptions" USING btree ("run_id","legacy_table","legacy_id","reason_code");--> statement-breakpoint
CREATE INDEX "legacy_backfill_exception_run_idx" ON "legacy_backfill_exceptions" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "legacy_backfill_exception_blocking_idx" ON "legacy_backfill_exceptions" USING btree ("blocks_cutover");--> statement-breakpoint
CREATE INDEX "idx_live_results_session" ON "live_quiz_results" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_live_results_student" ON "live_quiz_results" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_live_sessions_code" ON "live_quiz_sessions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_live_sessions_course" ON "live_quiz_sessions" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "idx_mrq_status" ON "mastery_recompute_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_mrq_student_course" ON "mastery_recompute_queue" USING btree ("student_id","course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mata_kuliah_code_idx" ON "mata_kuliah" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "mata_kuliah_single_demo_idx" ON "mata_kuliah" USING btree ("is_demo") WHERE "mata_kuliah"."is_demo" = true;--> statement-breakpoint
CREATE INDEX "mata_kuliah_legacy_course_idx" ON "mata_kuliah" USING btree ("legacy_course_id");--> statement-breakpoint
CREATE INDEX "migration_checkpoints_run_idx" ON "migration_checkpoints" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "migration_runs_plan_idx" ON "migration_runs" USING btree ("plan_number");--> statement-breakpoint
CREATE INDEX "migration_runs_status_idx" ON "migration_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_read" ON "notifications" USING btree ("user_id","read");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_created" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pemahaman_ide_murid_ide_idx" ON "pemahaman_ide" USING btree ("pengguna_id","ide_id");--> statement-breakpoint
CREATE INDEX "pemahaman_ide_ide_idx" ON "pemahaman_ide" USING btree ("ide_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pembahasan_soal_version_idx" ON "pembahasan_soal" USING btree ("soal_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "pendaftaran_murid_legacy_idx" ON "pendaftaran_murid" USING btree ("legacy_enrollment_id");--> statement-breakpoint
CREATE INDEX "pendaftaran_murid_pengguna_idx" ON "pendaftaran_murid" USING btree ("pengguna_id");--> statement-breakpoint
CREATE INDEX "pendaftaran_murid_mata_kuliah_idx" ON "pendaftaran_murid" USING btree ("mata_kuliah_id");--> statement-breakpoint
CREATE INDEX "pengguna_status_idx" ON "pengguna" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "pengguna_peran_unique_idx" ON "pengguna_peran" USING btree ("pengguna_id","peran_id");--> statement-breakpoint
CREATE INDEX "pengguna_peran_pengguna_idx" ON "pengguna_peran" USING btree ("pengguna_id");--> statement-breakpoint
CREATE INDEX "pengguna_peran_peran_idx" ON "pengguna_peran" USING btree ("peran_id");--> statement-breakpoint
CREATE UNIQUE INDEX "penugasan_tutor_legacy_idx" ON "penugasan_tutor" USING btree ("legacy_tutor_course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "penugasan_tutor_scope_idx" ON "penugasan_tutor" USING btree ("pengguna_id","mata_kuliah_id","assignment_scope");--> statement-breakpoint
CREATE INDEX "penugasan_tutor_pengguna_idx" ON "penugasan_tutor" USING btree ("pengguna_id");--> statement-breakpoint
CREATE INDEX "penugasan_tutor_mata_kuliah_idx" ON "penugasan_tutor" USING btree ("mata_kuliah_id");--> statement-breakpoint
CREATE INDEX "percobaan_asesmen_murid_idx" ON "percobaan_asesmen" USING btree ("pengguna_id","created_at");--> statement-breakpoint
CREATE INDEX "percobaan_asesmen_assessment_idx" ON "percobaan_asesmen" USING btree ("asesmen_id","status");--> statement-breakpoint
CREATE INDEX "perubahan_pemahaman_ide_idx" ON "perubahan_pemahaman" USING btree ("pemahaman_ide_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "peta_id_legacy_source_idx" ON "peta_id_legacy" USING btree ("legacy_table","legacy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "peta_id_legacy_target_idx" ON "peta_id_legacy" USING btree ("target_table","target_id");--> statement-breakpoint
CREATE INDEX "peta_id_legacy_run_idx" ON "peta_id_legacy" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pka_registrations_user" ON "pka_registrations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pka_stages_subject_stage" ON "pka_simulation_stages" USING btree ("subject","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pka_progress_student_subject_stage" ON "pka_stage_progress" USING btree ("student_id","subject","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "potongan_sumber_span_idx" ON "potongan_sumber" USING btree ("sumber_materi_id","source_version","start_offset","end_offset");--> statement-breakpoint
CREATE INDEX "potongan_sumber_source_idx" ON "potongan_sumber" USING btree ("sumber_materi_id","source_version");--> statement-breakpoint
CREATE UNIQUE INDEX "publikasi_bundle_version_idx" ON "publikasi_bundle" USING btree ("impor_bundle_id","version");--> statement-breakpoint
CREATE INDEX "publikasi_bundle_status_idx" ON "publikasi_bundle" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_qgen_runs_course" ON "question_generation_runs" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "idx_qos_question" ON "question_option_stats" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_ref_links_unique_idx" ON "question_reference_links" USING btree ("question_id","reference_question_id","role");--> statement-breakpoint
CREATE INDEX "question_ref_links_q_idx" ON "question_reference_links" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "question_ref_links_ref_idx" ON "question_reference_links" USING btree ("reference_question_id");--> statement-breakpoint
CREATE INDEX "idx_qai_template" ON "quiz_ai_insights" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "idx_qai_exam" ON "quiz_ai_insights" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "idx_templates_search" ON "quiz_templates" USING btree ("course_id","category","visibility");--> statement-breakpoint
CREATE UNIQUE INDEX "rekomendasi_flashcard_unique_idx" ON "rekomendasi_flashcard" USING btree ("pengguna_id","flashcard_id","due_at");--> statement-breakpoint
CREATE INDEX "rekomendasi_flashcard_due_idx" ON "rekomendasi_flashcard" USING btree ("pengguna_id","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "relasi_ide_unique_idx" ON "relasi_ide" USING btree ("source_idea_id","target_idea_id","relation_type");--> statement-breakpoint
CREATE INDEX "relasi_ide_source_idx" ON "relasi_ide" USING btree ("source_idea_id");--> statement-breakpoint
CREATE INDEX "relasi_ide_target_idx" ON "relasi_ide" USING btree ("target_idea_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_bundle_reviewer_idx" ON "review_bundle" USING btree ("impor_bundle_id","reviewer_id");--> statement-breakpoint
CREATE INDEX "review_bundle_status_idx" ON "review_bundle" USING btree ("status");--> statement-breakpoint
CREATE INDEX "review_flashcard_progress_idx" ON "review_flashcard" USING btree ("kemajuan_flashcard_murid_id","reviewed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_item_bundle_target_idx" ON "review_item_bundle" USING btree ("impor_bundle_id","reviewer_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "review_item_bundle_import_idx" ON "review_item_bundle" USING btree ("impor_bundle_id");--> statement-breakpoint
CREATE INDEX "review_item_bundle_status_idx" ON "review_item_bundle" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "review_pedagogi_bundle_decision_idx" ON "review_pedagogi_bundle" USING btree ("impor_bundle_id","reviewer_id","content_fingerprint","policy_version");--> statement-breakpoint
CREATE INDEX "review_pedagogi_bundle_import_idx" ON "review_pedagogi_bundle" USING btree ("impor_bundle_id");--> statement-breakpoint
CREATE INDEX "review_pedagogi_bundle_reviewer_idx" ON "review_pedagogi_bundle" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "review_pedagogi_bundle_fingerprint_idx" ON "review_pedagogi_bundle" USING btree ("content_fingerprint");--> statement-breakpoint
CREATE INDEX "review_pedagogi_bundle_status_idx" ON "review_pedagogi_bundle" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_search_documents_entity" ON "search_documents" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_search_documents_synced" ON "search_documents" USING btree ("is_synced");--> statement-breakpoint
CREATE INDEX "idx_search_documents_sync_status" ON "search_documents" USING btree ("sync_status");--> statement-breakpoint
CREATE INDEX "idx_search_documents_min_role" ON "search_documents" USING btree ("min_role");--> statement-breakpoint
CREATE INDEX "idx_search_documents_course" ON "search_documents" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "set_flashcard_course_idx" ON "set_flashcard" USING btree ("mata_kuliah_id");--> statement-breakpoint
CREATE INDEX "set_flashcard_chapter_idx" ON "set_flashcard" USING btree ("bab_id");--> statement-breakpoint
CREATE INDEX "set_flashcard_status_version_idx" ON "set_flashcard" USING btree ("status","version");--> statement-breakpoint
CREATE INDEX "soal_course_idx" ON "soal" USING btree ("mata_kuliah_id");--> statement-breakpoint
CREATE INDEX "soal_chapter_idx" ON "soal" USING btree ("bab_id");--> statement-breakpoint
CREATE INDEX "soal_status_version_idx" ON "soal" USING btree ("status","version");--> statement-breakpoint
CREATE INDEX "soal_origin_idx" ON "soal" USING btree ("origin","source_event_name");--> statement-breakpoint
CREATE INDEX "soal_assessment_source_idx" ON "soal" USING btree ("assessment_source_id","source_question_number");--> statement-breakpoint
CREATE INDEX "soal_quiz_eligible_idx" ON "soal" USING btree ("mata_kuliah_id","status","quiz_eligible");--> statement-breakpoint
CREATE UNIQUE INDEX "soal_ide_unique_idx" ON "soal_ide" USING btree ("soal_id","ide_id");--> statement-breakpoint
CREATE INDEX "soal_ide_ide_idx" ON "soal_ide" USING btree ("ide_id");--> statement-breakpoint
CREATE UNIQUE INDEX "soal_itb_referensi_checksum_idx" ON "soal_itb_referensi" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "soal_itb_referensi_visibility_idx" ON "soal_itb_referensi" USING btree ("authoring_visibility");--> statement-breakpoint
CREATE UNIQUE INDEX "soal_relasi_ide_unique_idx" ON "soal_relasi_ide" USING btree ("soal_id","ide_id","relation_type");--> statement-breakpoint
CREATE INDEX "soal_relasi_ide_ide_idx" ON "soal_relasi_ide" USING btree ("ide_id");--> statement-breakpoint
CREATE INDEX "idx_scm_student_chapter_course" ON "student_chapter_mastery" USING btree ("student_id","course_id");--> statement-breakpoint
CREATE INDEX "idx_student_chap_prog" ON "student_chapter_progress" USING btree ("student_id","chapter_id");--> statement-breakpoint
CREATE INDEX "idx_scm_student_course_score" ON "student_concept_mastery" USING btree ("student_id","course_id","mastery_score");--> statement-breakpoint
CREATE INDEX "idx_scmh_student_course" ON "student_concept_mastery_history" USING btree ("student_id","course_id");--> statement-breakpoint
CREATE INDEX "idx_student_fc_due" ON "student_flashcard_progress" USING btree ("student_id","due_date");--> statement-breakpoint
CREATE INDEX "idx_student_mat_prog" ON "student_material_progress" USING btree ("student_id","material_id");--> statement-breakpoint
CREATE INDEX "idx_sqa_attempt" ON "student_quiz_analytics" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "idx_sqa_student" ON "student_quiz_analytics" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_sqa_template" ON "student_quiz_analytics" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "idx_attempts_student" ON "student_quiz_attempts" USING btree ("student_id","status");--> statement-breakpoint
CREATE INDEX "idx_attempts_completed" ON "student_quiz_attempts" USING btree ("template_id","score") WHERE "status" = 'completed';--> statement-breakpoint
CREATE INDEX "idx_attempts_grading_status" ON "student_quiz_attempts" USING btree ("template_id","grading_status");--> statement-breakpoint
CREATE INDEX "idx_study_paths_student" ON "study_paths" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_submissions_user_exam_attempt" ON "submissions" USING btree ("user_id","exam_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "sumber_materi_version_idx" ON "sumber_materi" USING btree ("mata_kuliah_id","canonical_uri_or_r2_key","version");--> statement-breakpoint
CREATE INDEX "sumber_materi_bab_idx" ON "sumber_materi" USING btree ("bab_id");--> statement-breakpoint
CREATE INDEX "sumber_materi_status_idx" ON "sumber_materi" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tcm_student_course" ON "tutor_chat_messages" USING btree ("student_id","course_id");--> statement-breakpoint
CREATE INDEX "idx_tcm_session" ON "tutor_chat_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_tcm_created_at" ON "tutor_chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tutor_courses_tutor_idx" ON "tutor_courses" USING btree ("tutor_id");--> statement-breakpoint
CREATE INDEX "tutor_courses_course_idx" ON "tutor_courses" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "tutor_slots_tutor_idx" ON "tutor_slots" USING btree ("tutor_id");--> statement-breakpoint
CREATE INDEX "tutor_slots_tutor_date_idx" ON "tutor_slots" USING btree ("tutor_id","session_date");--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_slots_exact_unique_idx" ON "tutor_slots" USING btree ("tutor_id","session_date","start_time","end_time");--> statement-breakpoint
CREATE INDEX "idx_push_tokens_user" ON "user_push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_push_tokens_token" ON "user_push_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_vector_sync_status" ON "vector_sync_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_vector_sync_lease" ON "vector_sync_queue" USING btree ("lease_expires_at");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "idx_web_mat_ver_mat" ON "website_material_versions" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "idx_web_mat_stale" ON "website_materials" USING btree ("is_stale");--> statement-breakpoint
CREATE INDEX "idx_web_mat_chapter" ON "website_materials" USING btree ("chapter_id");--> statement-breakpoint
CREATE INDEX "idx_weekly_ref_student" ON "weekly_reflections" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_zyra_preferences_student_course" ON "zyra_learner_preferences" USING btree ("student_id","course_id");--> statement-breakpoint
CREATE INDEX "idx_zyra_profile_student_course" ON "zyra_learner_profiles" USING btree ("student_id","course_id");--> statement-breakpoint
CREATE INDEX "idx_zyra_profile_expiry" ON "zyra_learner_profiles" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_zyra_event_student_course_created" ON "zyra_learning_events" USING btree ("student_id","course_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_zyra_event_student_course_kind" ON "zyra_learning_events" USING btree ("student_id","course_id","event_kind");--> statement-breakpoint
CREATE INDEX "idx_zyra_event_idea" ON "zyra_learning_events" USING btree ("idea_id");--> statement-breakpoint
CREATE INDEX "idx_zyra_attachment_owner_scope" ON "zyra_message_attachments" USING btree ("student_id","course_id","session_id");--> statement-breakpoint
CREATE INDEX "idx_zyra_attachment_expiry" ON "zyra_message_attachments" USING btree ("expires_at","status");--> statement-breakpoint
CREATE INDEX "idx_zyra_attachment_message" ON "zyra_message_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_zyra_ops_event_type_created" ON "zyra_operational_events" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "idx_zyra_ops_route_created" ON "zyra_operational_events" USING btree ("route_class","created_at");--> statement-breakpoint
CREATE INDEX "idx_zyra_proposal_event_proposal" ON "zyra_proposal_events" USING btree ("proposal_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_zyra_proposal_event_actor" ON "zyra_proposal_events" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_zyra_proposal_actor_status" ON "zyra_proposals" USING btree ("actor_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_zyra_proposal_course_status" ON "zyra_proposals" USING btree ("course_id","status");--> statement-breakpoint
CREATE INDEX "idx_zyra_proposal_expiry" ON "zyra_proposals" USING btree ("expires_at","status");--> statement-breakpoint
CREATE INDEX "group_name_change_group_time_idx" ON "group_name_change_audit" USING btree ("group_id","changed_at");--> statement-breakpoint
CREATE INDEX "group_name_change_actor_idx" ON "group_name_change_audit" USING btree ("changed_by_id");