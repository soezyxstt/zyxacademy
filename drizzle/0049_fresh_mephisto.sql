CREATE TABLE `distractor_provenance` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`option_index` integer NOT NULL,
	`stable_option_id` text NOT NULL,
	`targeted_misconception` text NOT NULL,
	`misconception_ko_id` text,
	`supporting_source_ids` text NOT NULL,
	`mapping_method` text DEFAULT 'unknown' NOT NULL,
	`score` real DEFAULT 0 NOT NULL,
	`method_version` text DEFAULT '2.0' NOT NULL,
	`uncertainty_state` text DEFAULT 'unknown' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `ai_question_bank`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`misconception_ko_id`) REFERENCES `knowledge_objects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_distractor_prov_q` ON `distractor_provenance` (`question_id`);--> statement-breakpoint
CREATE INDEX `idx_distractor_prov_ko` ON `distractor_provenance` (`misconception_ko_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_distractor_prov_option` ON `distractor_provenance` (`question_id`,`option_index`);--> statement-breakpoint
CREATE TABLE `question_generation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`blueprint_version` text DEFAULT '2.0' NOT NULL,
	`prompt_version` text DEFAULT '2.0' NOT NULL,
	`source_version` text,
	`shuffle_seed` integer,
	`validator_version` text DEFAULT '2.0' NOT NULL,
	`slot_count` integer DEFAULT 0 NOT NULL,
	`accepted_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_qgen_runs_course` ON `question_generation_runs` (`course_id`);--> statement-breakpoint
DROP INDEX "account_userId_idx";--> statement-breakpoint
DROP INDEX "idx_ai_fail_course";--> statement-breakpoint
DROP INDEX "idx_ai_fail_chapter";--> statement-breakpoint
DROP INDEX "idx_jobs_status";--> statement-breakpoint
DROP INDEX "idx_traces_user_created";--> statement-breakpoint
DROP INDEX "idx_traces_stage_prompt";--> statement-breakpoint
DROP INDEX "idx_chunks_section";--> statement-breakpoint
DROP INDEX "ai_sections_instance_idx";--> statement-breakpoint
DROP INDEX "ai_instances_course_idx";--> statement-breakpoint
DROP INDEX "idx_qbank_selection";--> statement-breakpoint
DROP INDEX "idx_qbank_tags";--> statement-breakpoint
DROP INDEX "idx_qbank_ko";--> statement-breakpoint
DROP INDEX "idx_qbank_gen_run";--> statement-breakpoint
DROP INDEX "idx_usage_user_created";--> statement-breakpoint
DROP INDEX "idx_ao_concepts_ao";--> statement-breakpoint
DROP INDEX "idx_ao_concepts_concept";--> statement-breakpoint
DROP INDEX "idx_ao_kos_ao";--> statement-breakpoint
DROP INDEX "idx_ao_kos_ko";--> statement-breakpoint
DROP INDEX "assessment_profiles_course_id_unique";--> statement-breakpoint
DROP INDEX "idx_asc_source";--> statement-breakpoint
DROP INDEX "idx_asc_chapter";--> statement-breakpoint
DROP INDEX "uq_attempt_feedback_question";--> statement-breakpoint
DROP INDEX "blog_articles_slug_unique";--> statement-breakpoint
DROP INDEX "idx_blog_slug";--> statement-breakpoint
DROP INDEX "idx_blog_status";--> statement-breakpoint
DROP INDEX "idx_blog_category";--> statement-breakpoint
DROP INDEX "bookings_slot_id_unique";--> statement-breakpoint
DROP INDEX "bookings_slot_idx";--> statement-breakpoint
DROP INDEX "bookings_student_idx";--> statement-breakpoint
DROP INDEX "bookings_group_idx";--> statement-breakpoint
DROP INDEX "idx_career_path_concepts_template";--> statement-breakpoint
DROP INDEX "idx_career_path_concepts_concept";--> statement-breakpoint
DROP INDEX "uq_career_path_concepts";--> statement-breakpoint
DROP INDEX "uq_career_path_templates_title";--> statement-breakpoint
DROP INDEX "chapter_aliases_alias_name_unique";--> statement-breakpoint
DROP INDEX "idx_chapters_course_order";--> statement-breakpoint
DROP INDEX "idx_cms_message";--> statement-breakpoint
DROP INDEX "idx_cms_source";--> statement-breakpoint
DROP INDEX "idx_chat_sessions_student_course";--> statement-breakpoint
DROP INDEX "idx_chat_sessions_last_message";--> statement-breakpoint
DROP INDEX "idx_cge_course";--> statement-breakpoint
DROP INDEX "uq_cge_edge";--> statement-breakpoint
DROP INDEX "idx_concept_loc_concept";--> statement-breakpoint
DROP INDEX "uq_concept_loc_concept_lang";--> statement-breakpoint
DROP INDEX "concepts_canonical_slug_unique";--> statement-breakpoint
DROP INDEX "idx_cqf_course";--> statement-breakpoint
DROP INDEX "idx_cqf_question";--> statement-breakpoint
DROP INDEX "uq_cqf_question_type";--> statement-breakpoint
DROP INDEX "idx_course_snapshot_lookup";--> statement-breakpoint
DROP INDEX "uq_course_snapshot_date";--> statement-breakpoint
DROP INDEX "idx_course_materials_course";--> statement-breakpoint
DROP INDEX "course_policies_course_id_unique";--> statement-breakpoint
DROP INDEX "idx_daily_rec_student";--> statement-breakpoint
DROP INDEX "uq_daily_rec_student_date";--> statement-breakpoint
DROP INDEX "idx_distractor_prov_q";--> statement-breakpoint
DROP INDEX "idx_distractor_prov_ko";--> statement-breakpoint
DROP INDEX "uq_distractor_prov_option";--> statement-breakpoint
DROP INDEX "drive_item_parent_idx";--> statement-breakpoint
DROP INDEX "drive_item_created_by_idx";--> statement-breakpoint
DROP INDEX "token_courses_token_idx";--> statement-breakpoint
DROP INDEX "token_courses_course_idx";--> statement-breakpoint
DROP INDEX "enrollment_tokens_token_unique";--> statement-breakpoint
DROP INDEX "idx_extraction_runs_chapter";--> statement-breakpoint
DROP INDEX "idx_extraction_runs_state";--> statement-breakpoint
DROP INDEX "idx_fc_reviews_student";--> statement-breakpoint
DROP INDEX "idx_fc_reviews_card";--> statement-breakpoint
DROP INDEX "group_members_group_idx";--> statement-breakpoint
DROP INDEX "group_members_user_idx";--> statement-breakpoint
DROP INDEX "uq_active_intervention";--> statement-breakpoint
DROP INDEX "idx_ko_sources_ko";--> statement-breakpoint
DROP INDEX "idx_ko_sources_doc_chapter";--> statement-breakpoint
DROP INDEX "idx_ko_course";--> statement-breakpoint
DROP INDEX "idx_ko_chapter";--> statement-breakpoint
DROP INDEX "idx_ko_concept";--> statement-breakpoint
DROP INDEX "idx_ko_status";--> statement-breakpoint
DROP INDEX "idx_ko_stable_key";--> statement-breakpoint
DROP INDEX "idx_rel_source";--> statement-breakpoint
DROP INDEX "idx_rel_target";--> statement-breakpoint
DROP INDEX "idx_rel_source_target_type";--> statement-breakpoint
DROP INDEX "idx_le_student_course_created";--> statement-breakpoint
DROP INDEX "idx_le_student_concept";--> statement-breakpoint
DROP INDEX "idx_learning_objectives_chapter";--> statement-breakpoint
DROP INDEX "idx_lo_concepts_lo";--> statement-breakpoint
DROP INDEX "idx_lo_concepts_concept";--> statement-breakpoint
DROP INDEX "uq_lo_concepts";--> statement-breakpoint
DROP INDEX "idx_learning_outcomes_course";--> statement-breakpoint
DROP INDEX "idx_learning_outcomes_parent";--> statement-breakpoint
DROP INDEX "uq_learning_outcomes_course_code";--> statement-breakpoint
DROP INDEX "idx_live_results_session";--> statement-breakpoint
DROP INDEX "idx_live_results_student";--> statement-breakpoint
DROP INDEX "uq_live_result_session_student";--> statement-breakpoint
DROP INDEX "live_quiz_sessions_code_unique";--> statement-breakpoint
DROP INDEX "idx_live_sessions_code";--> statement-breakpoint
DROP INDEX "idx_live_sessions_course";--> statement-breakpoint
DROP INDEX "idx_mrq_status";--> statement-breakpoint
DROP INDEX "idx_mrq_student_course";--> statement-breakpoint
DROP INDEX "idx_notifications_user_read";--> statement-breakpoint
DROP INDEX "idx_notifications_user_created";--> statement-breakpoint
DROP INDEX "uq_pka_registrations_user";--> statement-breakpoint
DROP INDEX "uq_pka_stages_subject_stage";--> statement-breakpoint
DROP INDEX "uq_pka_progress_student_subject_stage";--> statement-breakpoint
DROP INDEX "idx_qgen_runs_course";--> statement-breakpoint
DROP INDEX "idx_qos_question";--> statement-breakpoint
DROP INDEX "uq_qos_question_option";--> statement-breakpoint
DROP INDEX "idx_qai_template";--> statement-breakpoint
DROP INDEX "idx_qai_exam";--> statement-breakpoint
DROP INDEX "idx_templates_search";--> statement-breakpoint
DROP INDEX "session_token_unique";--> statement-breakpoint
DROP INDEX "session_userId_idx";--> statement-breakpoint
DROP INDEX "short_link_slug_unique";--> statement-breakpoint
DROP INDEX "idx_scm_student_chapter_course";--> statement-breakpoint
DROP INDEX "uq_scm_student_chapter";--> statement-breakpoint
DROP INDEX "idx_student_chap_prog";--> statement-breakpoint
DROP INDEX "idx_scm_student_course_score";--> statement-breakpoint
DROP INDEX "uq_scm_student_course_concept";--> statement-breakpoint
DROP INDEX "idx_scmh_student_course";--> statement-breakpoint
DROP INDEX "uq_scmh_student_concept_date";--> statement-breakpoint
DROP INDEX "idx_student_fc_due";--> statement-breakpoint
DROP INDEX "uq_student_flashcard";--> statement-breakpoint
DROP INDEX "idx_student_mat_prog";--> statement-breakpoint
DROP INDEX "uq_student_material";--> statement-breakpoint
DROP INDEX "student_quiz_analytics_attempt_id_unique";--> statement-breakpoint
DROP INDEX "idx_sqa_attempt";--> statement-breakpoint
DROP INDEX "idx_sqa_student";--> statement-breakpoint
DROP INDEX "idx_sqa_template";--> statement-breakpoint
DROP INDEX "idx_attempts_student";--> statement-breakpoint
DROP INDEX "idx_attempts_completed";--> statement-breakpoint
DROP INDEX "idx_study_paths_student";--> statement-breakpoint
DROP INDEX "uq_study_paths_student_course";--> statement-breakpoint
DROP INDEX "idx_tcm_student_course";--> statement-breakpoint
DROP INDEX "idx_tcm_session";--> statement-breakpoint
DROP INDEX "idx_tcm_created_at";--> statement-breakpoint
DROP INDEX "tutor_courses_tutor_idx";--> statement-breakpoint
DROP INDEX "tutor_courses_course_idx";--> statement-breakpoint
DROP INDEX "uq_tss_student_course";--> statement-breakpoint
DROP INDEX "tutor_slots_tutor_idx";--> statement-breakpoint
DROP INDEX "user_email_unique";--> statement-breakpoint
DROP INDEX "user_push_tokens_token_unique";--> statement-breakpoint
DROP INDEX "idx_push_tokens_user";--> statement-breakpoint
DROP INDEX "idx_push_tokens_token";--> statement-breakpoint
DROP INDEX "idx_vector_sync_status";--> statement-breakpoint
DROP INDEX "verification_identifier_idx";--> statement-breakpoint
DROP INDEX "idx_web_mat_ver_mat";--> statement-breakpoint
DROP INDEX "idx_web_mat_stale";--> statement-breakpoint
DROP INDEX "idx_web_mat_chapter";--> statement-breakpoint
DROP INDEX "idx_weekly_ref_student";--> statement-breakpoint
DROP INDEX "uq_weekly_ref_student_week";--> statement-breakpoint
ALTER TABLE `ai_question_bank` ALTER COLUMN "quality_score" TO "quality_score" real;--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_ai_fail_course` ON `ai_extraction_failures` (`course_id`);--> statement-breakpoint
CREATE INDEX `idx_ai_fail_chapter` ON `ai_extraction_failures` (`chapter_id`);--> statement-breakpoint
CREATE INDEX `idx_jobs_status` ON `ai_generation_jobs` (`course_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_traces_user_created` ON `ai_generation_traces` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_traces_stage_prompt` ON `ai_generation_traces` (`stage_id`,`prompt_version`);--> statement-breakpoint
CREATE INDEX `idx_chunks_section` ON `ai_material_instance_chunks` (`section_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `ai_sections_instance_idx` ON `ai_material_instance_sections` (`material_instance_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `ai_instances_course_idx` ON `ai_material_instances` (`course_id`);--> statement-breakpoint
CREATE INDEX `idx_qbank_selection` ON `ai_question_bank` (`course_id`,`review_status`,`difficulty`,`use_count`);--> statement-breakpoint
CREATE INDEX `idx_qbank_tags` ON `ai_question_bank` (`tags`);--> statement-breakpoint
CREATE INDEX `idx_qbank_ko` ON `ai_question_bank` (`knowledge_object_id`);--> statement-breakpoint
CREATE INDEX `idx_qbank_gen_run` ON `ai_question_bank` (`generation_run_id`);--> statement-breakpoint
CREATE INDEX `idx_usage_user_created` ON `ai_usage_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ao_concepts_ao` ON `assessment_object_concepts` (`assessment_object_id`);--> statement-breakpoint
CREATE INDEX `idx_ao_concepts_concept` ON `assessment_object_concepts` (`concept_id`);--> statement-breakpoint
CREATE INDEX `idx_ao_kos_ao` ON `assessment_object_kos` (`assessment_object_id`);--> statement-breakpoint
CREATE INDEX `idx_ao_kos_ko` ON `assessment_object_kos` (`ko_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_profiles_course_id_unique` ON `assessment_profiles` (`course_id`);--> statement-breakpoint
CREATE INDEX `idx_asc_source` ON `assessment_source_chapters` (`assessment_source_id`);--> statement-breakpoint
CREATE INDEX `idx_asc_chapter` ON `assessment_source_chapters` (`chapter_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_attempt_feedback_question` ON `attempt_feedback` (`attempt_id`,`question_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `blog_articles_slug_unique` ON `blog_articles` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_blog_slug` ON `blog_articles` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_blog_status` ON `blog_articles` (`status`);--> statement-breakpoint
CREATE INDEX `idx_blog_category` ON `blog_articles` (`category`);--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_slot_id_unique` ON `bookings` (`slot_id`);--> statement-breakpoint
CREATE INDEX `bookings_slot_idx` ON `bookings` (`slot_id`);--> statement-breakpoint
CREATE INDEX `bookings_student_idx` ON `bookings` (`student_id`);--> statement-breakpoint
CREATE INDEX `bookings_group_idx` ON `bookings` (`group_id`);--> statement-breakpoint
CREATE INDEX `idx_career_path_concepts_template` ON `career_path_concepts` (`career_path_template_id`);--> statement-breakpoint
CREATE INDEX `idx_career_path_concepts_concept` ON `career_path_concepts` (`concept_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_career_path_concepts` ON `career_path_concepts` (`career_path_template_id`,`concept_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_career_path_templates_title` ON `career_path_templates` (`title`);--> statement-breakpoint
CREATE UNIQUE INDEX `chapter_aliases_alias_name_unique` ON `chapter_aliases` (`alias_name`);--> statement-breakpoint
CREATE INDEX `idx_chapters_course_order` ON `chapters` (`course_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `idx_cms_message` ON `chat_message_sources` (`message_id`);--> statement-breakpoint
CREATE INDEX `idx_cms_source` ON `chat_message_sources` (`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `idx_chat_sessions_student_course` ON `chat_sessions` (`student_id`,`course_id`);--> statement-breakpoint
CREATE INDEX `idx_chat_sessions_last_message` ON `chat_sessions` (`last_message_at`);--> statement-breakpoint
CREATE INDEX `idx_cge_course` ON `concept_graph_edges` (`course_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_cge_edge` ON `concept_graph_edges` (`course_id`,`source_concept`,`target_concept`,`type`);--> statement-breakpoint
CREATE INDEX `idx_concept_loc_concept` ON `concept_localizations` (`concept_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_concept_loc_concept_lang` ON `concept_localizations` (`concept_id`,`lang`);--> statement-breakpoint
CREATE UNIQUE INDEX `concepts_canonical_slug_unique` ON `concepts` (`canonical_slug`);--> statement-breakpoint
CREATE INDEX `idx_cqf_course` ON `content_quality_flags` (`course_id`);--> statement-breakpoint
CREATE INDEX `idx_cqf_question` ON `content_quality_flags` (`question_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_cqf_question_type` ON `content_quality_flags` (`question_id`,`flag_type`);--> statement-breakpoint
CREATE INDEX `idx_course_snapshot_lookup` ON `course_analytics_snapshots` (`course_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_course_snapshot_date` ON `course_analytics_snapshots` (`course_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_course_materials_course` ON `course_materials` (`course_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `course_policies_course_id_unique` ON `course_policies` (`course_id`);--> statement-breakpoint
CREATE INDEX `idx_daily_rec_student` ON `daily_recommendations` (`student_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_daily_rec_student_date` ON `daily_recommendations` (`student_id`,`date`);--> statement-breakpoint
CREATE INDEX `drive_item_parent_idx` ON `drive_item` (`parent_id`);--> statement-breakpoint
CREATE INDEX `drive_item_created_by_idx` ON `drive_item` (`created_by_user_id`);--> statement-breakpoint
CREATE INDEX `token_courses_token_idx` ON `enrollment_token_courses` (`token_id`);--> statement-breakpoint
CREATE INDEX `token_courses_course_idx` ON `enrollment_token_courses` (`course_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `enrollment_tokens_token_unique` ON `enrollment_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_extraction_runs_chapter` ON `extraction_runs` (`chapter_id`);--> statement-breakpoint
CREATE INDEX `idx_extraction_runs_state` ON `extraction_runs` (`state`);--> statement-breakpoint
CREATE INDEX `idx_fc_reviews_student` ON `flashcard_reviews` (`student_id`);--> statement-breakpoint
CREATE INDEX `idx_fc_reviews_card` ON `flashcard_reviews` (`flashcard_id`);--> statement-breakpoint
CREATE INDEX `group_members_group_idx` ON `group_members` (`group_id`);--> statement-breakpoint
CREATE INDEX `group_members_user_idx` ON `group_members` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_active_intervention` ON `interventions` (`student_id`,`concept_name`) WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX `idx_ko_sources_ko` ON `knowledge_object_sources` (`ko_id`);--> statement-breakpoint
CREATE INDEX `idx_ko_sources_doc_chapter` ON `knowledge_object_sources` (`source_document_id`,`chapter_id`);--> statement-breakpoint
CREATE INDEX `idx_ko_course` ON `knowledge_objects` (`course_id`);--> statement-breakpoint
CREATE INDEX `idx_ko_chapter` ON `knowledge_objects` (`chapter_id`);--> statement-breakpoint
CREATE INDEX `idx_ko_concept` ON `knowledge_objects` (`concept_id`);--> statement-breakpoint
CREATE INDEX `idx_ko_status` ON `knowledge_objects` (`status`);--> statement-breakpoint
CREATE INDEX `idx_ko_stable_key` ON `knowledge_objects` (`stable_key`);--> statement-breakpoint
CREATE INDEX `idx_rel_source` ON `knowledge_relationships` (`source_ko_id`);--> statement-breakpoint
CREATE INDEX `idx_rel_target` ON `knowledge_relationships` (`target_ko_id`);--> statement-breakpoint
CREATE INDEX `idx_rel_source_target_type` ON `knowledge_relationships` (`source_ko_id`,`target_ko_id`,`type`);--> statement-breakpoint
CREATE INDEX `idx_le_student_course_created` ON `learning_events` (`student_id`,`course_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_le_student_concept` ON `learning_events` (`student_id`,`concept_name`);--> statement-breakpoint
CREATE INDEX `idx_learning_objectives_chapter` ON `learning_objectives` (`chapter_id`);--> statement-breakpoint
CREATE INDEX `idx_lo_concepts_lo` ON `learning_outcome_concepts` (`learning_outcome_id`);--> statement-breakpoint
CREATE INDEX `idx_lo_concepts_concept` ON `learning_outcome_concepts` (`concept_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_lo_concepts` ON `learning_outcome_concepts` (`learning_outcome_id`,`concept_id`);--> statement-breakpoint
CREATE INDEX `idx_learning_outcomes_course` ON `learning_outcomes` (`course_id`);--> statement-breakpoint
CREATE INDEX `idx_learning_outcomes_parent` ON `learning_outcomes` (`parent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_learning_outcomes_course_code` ON `learning_outcomes` (`course_id`,`code`);--> statement-breakpoint
CREATE INDEX `idx_live_results_session` ON `live_quiz_results` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_live_results_student` ON `live_quiz_results` (`student_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_live_result_session_student` ON `live_quiz_results` (`session_id`,`student_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `live_quiz_sessions_code_unique` ON `live_quiz_sessions` (`code`);--> statement-breakpoint
CREATE INDEX `idx_live_sessions_code` ON `live_quiz_sessions` (`code`);--> statement-breakpoint
CREATE INDEX `idx_live_sessions_course` ON `live_quiz_sessions` (`course_id`);--> statement-breakpoint
CREATE INDEX `idx_mrq_status` ON `mastery_recompute_queue` (`status`);--> statement-breakpoint
CREATE INDEX `idx_mrq_student_course` ON `mastery_recompute_queue` (`student_id`,`course_id`);--> statement-breakpoint
CREATE INDEX `idx_notifications_user_read` ON `notifications` (`user_id`,`read`);--> statement-breakpoint
CREATE INDEX `idx_notifications_user_created` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_pka_registrations_user` ON `pka_registrations` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_pka_stages_subject_stage` ON `pka_simulation_stages` (`subject`,`stage`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_pka_progress_student_subject_stage` ON `pka_stage_progress` (`student_id`,`subject`,`stage`);--> statement-breakpoint
CREATE INDEX `idx_qos_question` ON `question_option_stats` (`question_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_qos_question_option` ON `question_option_stats` (`question_id`,`option_index`);--> statement-breakpoint
CREATE INDEX `idx_qai_template` ON `quiz_ai_insights` (`template_id`);--> statement-breakpoint
CREATE INDEX `idx_qai_exam` ON `quiz_ai_insights` (`exam_id`);--> statement-breakpoint
CREATE INDEX `idx_templates_search` ON `quiz_templates` (`course_id`,`category`,`visibility`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `short_link_slug_unique` ON `short_link` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_scm_student_chapter_course` ON `student_chapter_mastery` (`student_id`,`course_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_scm_student_chapter` ON `student_chapter_mastery` (`student_id`,`chapter_id`);--> statement-breakpoint
CREATE INDEX `idx_student_chap_prog` ON `student_chapter_progress` (`student_id`,`chapter_id`);--> statement-breakpoint
CREATE INDEX `idx_scm_student_course_score` ON `student_concept_mastery` (`student_id`,`course_id`,`mastery_score`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_scm_student_course_concept` ON `student_concept_mastery` (`student_id`,`course_id`,`concept_name`);--> statement-breakpoint
CREATE INDEX `idx_scmh_student_course` ON `student_concept_mastery_history` (`student_id`,`course_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_scmh_student_concept_date` ON `student_concept_mastery_history` (`student_id`,`concept_name`,`snapshot_date`);--> statement-breakpoint
CREATE INDEX `idx_student_fc_due` ON `student_flashcard_progress` (`student_id`,`due_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_student_flashcard` ON `student_flashcard_progress` (`student_id`,`flashcard_id`);--> statement-breakpoint
CREATE INDEX `idx_student_mat_prog` ON `student_material_progress` (`student_id`,`material_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_student_material` ON `student_material_progress` (`student_id`,`material_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `student_quiz_analytics_attempt_id_unique` ON `student_quiz_analytics` (`attempt_id`);--> statement-breakpoint
CREATE INDEX `idx_sqa_attempt` ON `student_quiz_analytics` (`attempt_id`);--> statement-breakpoint
CREATE INDEX `idx_sqa_student` ON `student_quiz_analytics` (`student_id`);--> statement-breakpoint
CREATE INDEX `idx_sqa_template` ON `student_quiz_analytics` (`template_id`);--> statement-breakpoint
CREATE INDEX `idx_attempts_student` ON `student_quiz_attempts` (`student_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_attempts_completed` ON `student_quiz_attempts` (`template_id`,`score`) WHERE "status" = 'completed';--> statement-breakpoint
CREATE INDEX `idx_study_paths_student` ON `study_paths` (`student_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_study_paths_student_course` ON `study_paths` (`student_id`,`course_id`);--> statement-breakpoint
CREATE INDEX `idx_tcm_student_course` ON `tutor_chat_messages` (`student_id`,`course_id`);--> statement-breakpoint
CREATE INDEX `idx_tcm_session` ON `tutor_chat_messages` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_tcm_created_at` ON `tutor_chat_messages` (`created_at`);--> statement-breakpoint
CREATE INDEX `tutor_courses_tutor_idx` ON `tutor_courses` (`tutor_id`);--> statement-breakpoint
CREATE INDEX `tutor_courses_course_idx` ON `tutor_courses` (`course_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_tss_student_course` ON `tutor_session_summaries` (`student_id`,`course_id`);--> statement-breakpoint
CREATE INDEX `tutor_slots_tutor_idx` ON `tutor_slots` (`tutor_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_push_tokens_token_unique` ON `user_push_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_push_tokens_user` ON `user_push_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_push_tokens_token` ON `user_push_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_vector_sync_status` ON `vector_sync_queue` (`status`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `idx_web_mat_ver_mat` ON `website_material_versions` (`material_id`);--> statement-breakpoint
CREATE INDEX `idx_web_mat_stale` ON `website_materials` (`is_stale`);--> statement-breakpoint
CREATE INDEX `idx_web_mat_chapter` ON `website_materials` (`chapter_id`);--> statement-breakpoint
CREATE INDEX `idx_weekly_ref_student` ON `weekly_reflections` (`student_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_weekly_ref_student_week` ON `weekly_reflections` (`student_id`,`week_start`);--> statement-breakpoint
ALTER TABLE `ai_question_bank` ADD `generation_run_id` text REFERENCES question_generation_runs(id);