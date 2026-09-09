CREATE TABLE `question_reference_links` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`reference_question_id` text NOT NULL,
	`role` text NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `soal`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reference_question_id`) REFERENCES `soal`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "question_ref_links_role_check" CHECK("question_reference_links"."role" IN ('inspired_by', 'adapted_from', 'derived_from')),
	CONSTRAINT "question_ref_links_no_self_ref_check" CHECK("question_reference_links"."question_id" != "question_reference_links"."reference_question_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `question_ref_links_unique_idx` ON `question_reference_links` (`question_id`,`reference_question_id`,`role`);--> statement-breakpoint
CREATE INDEX `question_ref_links_q_idx` ON `question_reference_links` (`question_id`);--> statement-breakpoint
CREATE INDEX `question_ref_links_ref_idx` ON `question_reference_links` (`reference_question_id`);--> statement-breakpoint
DROP INDEX IF EXISTS "idx_academic_sched_type";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_academic_sched_course_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_academic_sched_start_date";--> statement-breakpoint
DROP INDEX IF EXISTS "account_userId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_admin_ops_chunks_source";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_admin_ops_chunks_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_admin_ops_chunks_vector_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_admin_ops_chunks_content_hash";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_admin_ops_chunks_source_index_ver";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_admin_ops_sources_path";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_admin_ops_sources_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_admin_ops_sources_hash";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_admin_ops_sync_queue_status";--> statement-breakpoint
DROP INDEX IF EXISTS "ai_allowance_leases_idempotency_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ai_allowance_leases_user_day_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ai_allowance_leases_user_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ai_allowance_leases_control_plane_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ai_allowance_leases_run_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_ai_fail_course";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_ai_fail_chapter";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_jobs_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_traces_user_created";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_traces_stage_prompt";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_chunks_section";--> statement-breakpoint
DROP INDEX IF EXISTS "ai_sections_instance_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ai_instances_course_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_qbank_selection";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_qbank_tags";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_qbank_ko";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_qbank_gen_run";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_qbank_origin";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_qbank_quiz_eligible";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_usage_user_created";--> statement-breakpoint
DROP INDEX IF EXISTS "alur_konten_entity_version_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "alur_konten_course_state_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "artikel_slug_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "artikel_course_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "artikel_chapter_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "artikel_status_version_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "artikel_structure_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "artikel_ide_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "artikel_ide_ide_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "asal_ide_span_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "asal_ide_ide_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "asal_ide_source_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "asesmen_course_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "asesmen_status_version_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_ao_concepts_ao";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_ao_concepts_concept";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_ao_kos_ao";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_ao_kos_ko";--> statement-breakpoint
DROP INDEX IF EXISTS "assessment_profiles_course_id_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_asc_source";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_asc_chapter";--> statement-breakpoint
DROP INDEX IF EXISTS "assessment_sources_canonical_course_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "assessment_sources_document_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_attempt_feedback_question";--> statement-breakpoint
DROP INDEX IF EXISTS "audit_mutasi_entity_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "audit_mutasi_actor_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "audit_mutasi_course_outcome_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bab_course_code_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bab_course_order_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bab_legacy_chapter_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bagian_artikel_key_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bagian_artikel_slug_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bagian_artikel_order_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bagian_artikel_learning_section_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bagian_pembelajaran_stable_key_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bagian_pembelajaran_slug_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bagian_pembelajaran_order_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bagian_pembelajaran_parent_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bagian_pembelajaran_ide_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bagian_pembelajaran_ide_ide_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "benchmark_soal_checksum_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "benchmark_soal_dataset_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "blog_articles_slug_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_blog_slug";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_blog_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_blog_category";--> statement-breakpoint
DROP INDEX IF EXISTS "blok_artikel_key_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "blok_artikel_order_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "blok_artikel_section_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "blok_artikel_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "blok_artikel_ide_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "blok_artikel_ide_ide_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "blok_artikel_sumber_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "blok_artikel_sumber_source_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "blueprint_asesmen_course_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "blueprint_asesmen_status_version_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_booking_audit_booking_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_booking_audit_group_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_booking_audit_actor_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_reschedule_booking_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_reschedule_group_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_reschedule_status";--> statement-breakpoint
DROP INDEX IF EXISTS "booking_resources_booking_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "booking_resources_booking_phase_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "booking_resources_creator_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_ticket_messages_ticket_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_ticket_messages_sender_id";--> statement-breakpoint
DROP INDEX IF EXISTS "bookings_slot_id_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "bookings_slot_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bookings_student_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bookings_group_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bookings_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bookings_session_date_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bukti_ide_jawaban_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bukti_ide_jawaban_ide_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bukti_pdf_bundle_lineage_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bukti_pdf_bundle_import_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bukti_pdf_bundle_product_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bukti_pdf_bundle_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bukti_pdf_bundle_diktat_hash_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bukti_pdf_bundle_article_hash_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bukti_pembelajaran_murid_ide_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bukti_pembelajaran_source_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bukti_pembelajaran_idempotency_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "cakupan_asesmen_chapter_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "cakupan_asesmen_order_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_career_path_concepts_template";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_career_path_concepts_concept";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_career_path_concepts";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_career_path_templates_title";--> statement-breakpoint
DROP INDEX IF EXISTS "chapter_aliases_alias_name_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_chapters_course_order";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_cms_message";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_cms_source";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_chat_sessions_student_course";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_chat_sessions_last_message";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_cge_course";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_cge_edge";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_concept_loc_concept";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_concept_loc_concept_lang";--> statement-breakpoint
DROP INDEX IF EXISTS "concepts_canonical_slug_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_cqf_course";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_cqf_question";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_cqf_question_type";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_course_snapshot_lookup";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_course_snapshot_date";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_course_materials_course";--> statement-breakpoint
DROP INDEX IF EXISTS "course_policies_course_id_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_custom_form_presets_category";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_custom_form_responses_form_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_custom_form_responses_user_id";--> statement-breakpoint
DROP INDEX IF EXISTS "custom_forms_slug_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_custom_forms_slug";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_custom_forms_category";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_daily_rec_student";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_daily_rec_student_date";--> statement-breakpoint
DROP INDEX IF EXISTS "diktat_ide_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "diktat_ide_ide_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "diktat_materi_course_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "diktat_materi_chapter_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "diktat_materi_status_version_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "diktat_pembahasan_diktat_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_distractor_prov_q";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_distractor_prov_ko";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_distractor_prov_option";--> statement-breakpoint
DROP INDEX IF EXISTS "drive_item_parent_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "drive_item_created_by_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "token_courses_token_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "token_courses_course_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "enrollment_tokens_token_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "export_spreadsheets_entity_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_extraction_runs_chapter";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_extraction_runs_state";--> statement-breakpoint
DROP INDEX IF EXISTS "flashcard_set_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "flashcard_status_version_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "flashcard_ide_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "flashcard_ide_ide_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_fc_reviews_student";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_fc_reviews_card";--> statement-breakpoint
DROP INDEX IF EXISTS "google_forms_form_id_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_forms_form_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_forms_category";--> statement-breakpoint
DROP INDEX IF EXISTS "google_meet_sessions_space_name_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "google_meet_sessions_slug_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_meet_space_name";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_meet_code";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_meet_slug";--> statement-breakpoint
DROP INDEX IF EXISTS "group_courses_group_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "group_courses_course_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "group_members_group_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "group_members_user_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ide_stable_key_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ide_course_code_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ide_bab_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ide_concept_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ide_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "impor_bundle_identity_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "impor_bundle_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_important_links_category";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_important_links_active";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_active_intervention";--> statement-breakpoint
DROP INDEX IF EXISTS "item_asesmen_order_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "item_asesmen_soal_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "item_diktat_pembahasan_order_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "item_diktat_pembahasan_soal_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "item_impor_bundle_entity_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "item_impor_bundle_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "jawaban_murid_attempt_item_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "jawaban_murid_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "kemajuan_baca_artikel_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "kemajuan_baca_artikel_resume_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "kemajuan_flashcard_murid_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "kemajuan_flashcard_murid_due_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ketergantungan_produk_edge_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ketergantungan_produk_upstream_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ketergantungan_produk_downstream_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_ko_sources_ko";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_ko_sources_doc_chapter";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_ko_course";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_ko_chapter";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_ko_concept";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_ko_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_ko_stable_key";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_rel_source";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_rel_target";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_rel_source_target_type";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_le_student_course_created";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_le_student_concept";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_learning_objectives_chapter";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_lo_concepts_lo";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_lo_concepts_concept";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_lo_concepts";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_learning_outcomes_course";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_learning_outcomes_parent";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_learning_outcomes_course_code";--> statement-breakpoint
DROP INDEX IF EXISTS "legacy_backfill_exception_source_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "legacy_backfill_exception_run_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "legacy_backfill_exception_blocking_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_live_results_session";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_live_results_student";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_live_result_session_student";--> statement-breakpoint
DROP INDEX IF EXISTS "live_quiz_sessions_code_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_live_sessions_code";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_live_sessions_course";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_mrq_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_mrq_student_course";--> statement-breakpoint
DROP INDEX IF EXISTS "mata_kuliah_code_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "mata_kuliah_legacy_course_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "migration_checkpoints_run_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "migration_runs_plan_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "migration_runs_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_notifications_user_read";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_notifications_user_created";--> statement-breakpoint
DROP INDEX IF EXISTS "pemahaman_ide_murid_ide_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "pemahaman_ide_ide_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "pembahasan_soal_version_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "pendaftaran_murid_legacy_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "pendaftaran_murid_pengguna_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "pendaftaran_murid_mata_kuliah_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "pengguna_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "pengguna_peran_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "pengguna_peran_pengguna_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "pengguna_peran_peran_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "penugasan_tutor_legacy_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "penugasan_tutor_scope_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "penugasan_tutor_pengguna_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "penugasan_tutor_mata_kuliah_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "peran_code_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "percobaan_asesmen_murid_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "percobaan_asesmen_assessment_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "perubahan_pemahaman_ide_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "peta_id_legacy_source_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "peta_id_legacy_target_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "peta_id_legacy_run_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_pka_registrations_user";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_pka_stages_subject_stage";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_pka_progress_student_subject_stage";--> statement-breakpoint
DROP INDEX IF EXISTS "potongan_sumber_span_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "potongan_sumber_source_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "publikasi_bundle_version_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "publikasi_bundle_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_qgen_runs_course";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_qos_question";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_qos_question_option";--> statement-breakpoint
DROP INDEX IF EXISTS "question_ref_links_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "question_ref_links_q_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "question_ref_links_ref_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_qai_template";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_qai_exam";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_templates_search";--> statement-breakpoint
DROP INDEX IF EXISTS "rekomendasi_flashcard_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "rekomendasi_flashcard_due_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "relasi_ide_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "relasi_ide_source_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "relasi_ide_target_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "review_bundle_reviewer_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "review_bundle_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "review_flashcard_progress_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "review_item_bundle_target_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "review_item_bundle_import_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "review_item_bundle_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "review_pedagogi_bundle_decision_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "review_pedagogi_bundle_import_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "review_pedagogi_bundle_reviewer_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "review_pedagogi_bundle_fingerprint_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "review_pedagogi_bundle_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_search_documents_entity";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_search_documents_synced";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_search_documents_sync_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_search_documents_min_role";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_search_documents_course";--> statement-breakpoint
DROP INDEX IF EXISTS "session_token_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "session_userId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "set_flashcard_course_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "set_flashcard_chapter_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "set_flashcard_status_version_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "short_link_slug_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "soal_course_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "soal_chapter_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "soal_status_version_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "soal_origin_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "soal_assessment_source_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "soal_quiz_eligible_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "soal_ide_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "soal_ide_ide_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "soal_itb_referensi_checksum_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "soal_itb_referensi_visibility_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "soal_relasi_ide_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "soal_relasi_ide_ide_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_scm_student_chapter_course";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_scm_student_chapter";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_student_chap_prog";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_scm_student_course_score";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_scm_student_course_concept";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_scmh_student_course";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_scmh_student_concept_date";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_student_fc_due";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_student_flashcard";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_student_mat_prog";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_student_material";--> statement-breakpoint
DROP INDEX IF EXISTS "student_quiz_analytics_attempt_id_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_sqa_attempt";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_sqa_student";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_sqa_template";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_attempts_student";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_attempts_completed";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_attempts_grading_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_study_paths_student";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_study_paths_student_course";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_submissions_user_exam_attempt";--> statement-breakpoint
DROP INDEX IF EXISTS "sumber_materi_version_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "sumber_materi_bab_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "sumber_materi_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_tcm_student_course";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_tcm_session";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_tcm_created_at";--> statement-breakpoint
DROP INDEX IF EXISTS "tutor_courses_tutor_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "tutor_courses_course_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_tss_student_course";--> statement-breakpoint
DROP INDEX IF EXISTS "tutor_slots_tutor_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "tutor_slots_tutor_date_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "tutor_slots_exact_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "user_email_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "user_push_tokens_token_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_push_tokens_user";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_push_tokens_token";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_vector_sync_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_vector_sync_lease";--> statement-breakpoint
DROP INDEX IF EXISTS "verification_identifier_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_web_mat_ver_mat";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_web_mat_stale";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_web_mat_chapter";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_weekly_ref_student";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_weekly_ref_student_week";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_zyra_preferences_student_course";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_zyra_preferences_student_course";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_zyra_profile_student_course";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_zyra_profile_expiry";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_zyra_profile_student_course";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_zyra_event_student_course_created";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_zyra_event_student_course_kind";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_zyra_event_idea";--> statement-breakpoint
DROP INDEX IF EXISTS "zyra_message_attachments_object_key_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_zyra_attachment_owner_scope";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_zyra_attachment_expiry";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_zyra_attachment_message";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_zyra_ops_event_type_created";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_zyra_ops_route_created";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_zyra_proposal_event_proposal";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_zyra_proposal_event_actor";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_zyra_proposal_actor_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_zyra_proposal_course_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_zyra_proposal_expiry";--> statement-breakpoint
-- SQLite and Turso do not support ALTER COLUMN. Rebuild the table while preserving existing rows.
CREATE TABLE `assessment_sources_new` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`title` text NOT NULL,
	`origin` text DEFAULT 'uploaded' NOT NULL,
	`category` text NOT NULL,
	`year` integer,
	`semester` integer,
	`source_markdown` text NOT NULL,
	`source_hash` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`parser_version` text DEFAULT '1.0.0' NOT NULL,
	`ingestion_status` text DEFAULT 'pending' NOT NULL,
	`ingestion_error` text,
	`ingestion_started_at` integer,
	`ingestion_completed_at` integer,
	`original_filename` text,
	`uploadthing_key` text,
	`uploaded_by_user_id` text NOT NULL,
	`deleted_at` integer,
	`deleted_by_user_id` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `assessment_sources_new` (
	`id`, `course_id`, `title`, `origin`, `category`, `year`, `semester`,
	`source_markdown`, `source_hash`, `version`, `parser_version`, `ingestion_status`,
	`ingestion_error`, `ingestion_started_at`, `ingestion_completed_at`, `original_filename`,
	`uploadthing_key`, `uploaded_by_user_id`, `deleted_at`, `deleted_by_user_id`,
	`created_at`, `updated_at`
)
SELECT
	`id`, `course_id`, `title`, `origin`, `category`, `year`, `semester`,
	`source_markdown`, `source_hash`, `version`, `parser_version`, `ingestion_status`,
	`ingestion_error`, `ingestion_started_at`, `ingestion_completed_at`, `original_filename`,
	`uploadthing_key`, `uploaded_by_user_id`, `deleted_at`, `deleted_by_user_id`,
	`created_at`, `updated_at`
FROM `assessment_sources`;--> statement-breakpoint
DROP TABLE `assessment_sources`;--> statement-breakpoint
ALTER TABLE `assessment_sources_new` RENAME TO `assessment_sources`;--> statement-breakpoint
ALTER TABLE `assessment_sources` ADD `assessment_type` text;--> statement-breakpoint
ALTER TABLE `assessment_sources` ADD `institution` text;--> statement-breakpoint
ALTER TABLE `assessment_sources` ADD `academic_year_label` text;--> statement-breakpoint
ALTER TABLE `assessment_sources` ADD `term` text;--> statement-breakpoint
ALTER TABLE `assessment_sources` ADD `canonical_course_id` text REFERENCES mata_kuliah(id);--> statement-breakpoint
ALTER TABLE `assessment_sources` ADD `source_document_id` text REFERENCES course_materials(id);--> statement-breakpoint
ALTER TABLE `assessment_sources` ADD `solution_document_id` text REFERENCES course_materials(id);--> statement-breakpoint
ALTER TABLE `assessment_sources` ADD `status` text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_question_bank` ADD `assessment_source_id` text REFERENCES assessment_sources(id);--> statement-breakpoint
ALTER TABLE `ai_question_bank` ADD `source_question_number` text;--> statement-breakpoint
ALTER TABLE `ai_question_bank` ADD `source_question_part` text;--> statement-breakpoint
ALTER TABLE `ai_question_bank` ADD `source_page` integer;--> statement-breakpoint
ALTER TABLE `ai_question_bank` ADD `answer_provenance` text;--> statement-breakpoint
ALTER TABLE `ai_question_bank` ADD `solution_provenance` text;--> statement-breakpoint
ALTER TABLE `ai_question_bank` ADD `quiz_eligible` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `soal` ADD `assessment_source_id` text REFERENCES assessment_sources(id);--> statement-breakpoint
ALTER TABLE `soal` ADD `source_question_number` text;--> statement-breakpoint
ALTER TABLE `soal` ADD `source_question_part` text;--> statement-breakpoint
ALTER TABLE `soal` ADD `source_page` integer;--> statement-breakpoint
ALTER TABLE `soal` ADD `source_locator` text;--> statement-breakpoint
ALTER TABLE `soal` ADD `answer_provenance` text;--> statement-breakpoint
ALTER TABLE `soal` ADD `solution_provenance` text;--> statement-breakpoint
ALTER TABLE `soal` ADD `quiz_eligible` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_academic_sched_type` ON `academic_schedules` (`type`);--> statement-breakpoint
CREATE INDEX `idx_academic_sched_course_id` ON `academic_schedules` (`course_id`);--> statement-breakpoint
CREATE INDEX `idx_academic_sched_start_date` ON `academic_schedules` (`start_date`);--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_admin_ops_chunks_source` ON `admin_ops_knowledge_chunks` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_admin_ops_chunks_status` ON `admin_ops_knowledge_chunks` (`status`);--> statement-breakpoint
CREATE INDEX `idx_admin_ops_chunks_vector_id` ON `admin_ops_knowledge_chunks` (`vector_id`);--> statement-breakpoint
CREATE INDEX `idx_admin_ops_chunks_content_hash` ON `admin_ops_knowledge_chunks` (`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_admin_ops_chunks_source_index_ver` ON `admin_ops_knowledge_chunks` (`source_id`,`chunk_index`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_admin_ops_sources_path` ON `admin_ops_knowledge_sources` (`source_path`);--> statement-breakpoint
CREATE INDEX `idx_admin_ops_sources_status` ON `admin_ops_knowledge_sources` (`status`);--> statement-breakpoint
CREATE INDEX `idx_admin_ops_sources_hash` ON `admin_ops_knowledge_sources` (`content_hash`);--> statement-breakpoint
CREATE INDEX `idx_admin_ops_sync_queue_status` ON `admin_ops_knowledge_sync_queue` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_allowance_leases_idempotency_idx` ON `ai_allowance_leases` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `ai_allowance_leases_user_day_idx` ON `ai_allowance_leases` (`user_id`,`app_day`);--> statement-breakpoint
CREATE INDEX `ai_allowance_leases_user_status_idx` ON `ai_allowance_leases` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `ai_allowance_leases_control_plane_idx` ON `ai_allowance_leases` (`control_plane_lease_id`);--> statement-breakpoint
CREATE INDEX `ai_allowance_leases_run_idx` ON `ai_allowance_leases` (`run_id`);--> statement-breakpoint
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
CREATE INDEX `idx_qbank_origin` ON `ai_question_bank` (`origin`,`source_event_name`);--> statement-breakpoint
CREATE INDEX `idx_qbank_quiz_eligible` ON `ai_question_bank` (`course_id`,`review_status`,`quiz_eligible`);--> statement-breakpoint
CREATE INDEX `idx_usage_user_created` ON `ai_usage_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `alur_konten_entity_version_idx` ON `alur_konten` (`entity_type`,`entity_id`,`version`);--> statement-breakpoint
CREATE INDEX `alur_konten_course_state_idx` ON `alur_konten` (`course_id`,`state`);--> statement-breakpoint
CREATE UNIQUE INDEX `artikel_slug_idx` ON `artikel` (`slug`);--> statement-breakpoint
CREATE INDEX `artikel_course_idx` ON `artikel` (`mata_kuliah_id`);--> statement-breakpoint
CREATE INDEX `artikel_chapter_idx` ON `artikel` (`bab_id`);--> statement-breakpoint
CREATE INDEX `artikel_status_version_idx` ON `artikel` (`status`,`version`);--> statement-breakpoint
CREATE INDEX `artikel_structure_status_idx` ON `artikel` (`structure_status`);--> statement-breakpoint
CREATE UNIQUE INDEX `artikel_ide_unique_idx` ON `artikel_ide` (`artikel_id`,`ide_id`);--> statement-breakpoint
CREATE INDEX `artikel_ide_ide_idx` ON `artikel_ide` (`ide_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `asal_ide_span_idx` ON `asal_ide` (`ide_id`,`source_chunk_id`,`start_offset`,`end_offset`);--> statement-breakpoint
CREATE INDEX `asal_ide_ide_idx` ON `asal_ide` (`ide_id`);--> statement-breakpoint
CREATE INDEX `asal_ide_source_idx` ON `asal_ide` (`source_chunk_id`);--> statement-breakpoint
CREATE INDEX `asesmen_course_idx` ON `asesmen` (`mata_kuliah_id`);--> statement-breakpoint
CREATE INDEX `asesmen_status_version_idx` ON `asesmen` (`status`,`version`);--> statement-breakpoint
CREATE INDEX `idx_ao_concepts_ao` ON `assessment_object_concepts` (`assessment_object_id`);--> statement-breakpoint
CREATE INDEX `idx_ao_concepts_concept` ON `assessment_object_concepts` (`concept_id`);--> statement-breakpoint
CREATE INDEX `idx_ao_kos_ao` ON `assessment_object_kos` (`assessment_object_id`);--> statement-breakpoint
CREATE INDEX `idx_ao_kos_ko` ON `assessment_object_kos` (`ko_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_profiles_course_id_unique` ON `assessment_profiles` (`course_id`);--> statement-breakpoint
CREATE INDEX `idx_asc_source` ON `assessment_source_chapters` (`assessment_source_id`);--> statement-breakpoint
CREATE INDEX `idx_asc_chapter` ON `assessment_source_chapters` (`chapter_id`);--> statement-breakpoint
CREATE INDEX `assessment_sources_canonical_course_idx` ON `assessment_sources` (`canonical_course_id`,`status`);--> statement-breakpoint
CREATE INDEX `assessment_sources_document_idx` ON `assessment_sources` (`source_document_id`,`solution_document_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_attempt_feedback_question` ON `attempt_feedback` (`attempt_id`,`question_index`);--> statement-breakpoint
CREATE INDEX `audit_mutasi_entity_idx` ON `audit_mutasi` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_mutasi_actor_idx` ON `audit_mutasi` (`actor_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_mutasi_course_outcome_idx` ON `audit_mutasi` (`course_id`,`outcome`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `bab_course_code_idx` ON `bab` (`mata_kuliah_id`,`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `bab_course_order_idx` ON `bab` (`mata_kuliah_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `bab_legacy_chapter_idx` ON `bab` (`legacy_chapter_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bagian_artikel_key_idx` ON `bagian_artikel` (`artikel_id`,`version`,`section_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `bagian_artikel_slug_idx` ON `bagian_artikel` (`artikel_id`,`version`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `bagian_artikel_order_idx` ON `bagian_artikel` (`artikel_id`,`version`,`parent_section_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `bagian_artikel_learning_section_idx` ON `bagian_artikel` (`bagian_pembelajaran_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bagian_pembelajaran_stable_key_idx` ON `bagian_pembelajaran` (`stable_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `bagian_pembelajaran_slug_idx` ON `bagian_pembelajaran` (`mata_kuliah_id`,`bab_id`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `bagian_pembelajaran_order_idx` ON `bagian_pembelajaran` (`bab_id`,`parent_section_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `bagian_pembelajaran_parent_idx` ON `bagian_pembelajaran` (`parent_section_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bagian_pembelajaran_ide_unique_idx` ON `bagian_pembelajaran_ide` (`bagian_pembelajaran_id`,`ide_id`);--> statement-breakpoint
CREATE INDEX `bagian_pembelajaran_ide_ide_idx` ON `bagian_pembelajaran_ide` (`ide_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `benchmark_soal_checksum_idx` ON `benchmark_soal` (`checksum`);--> statement-breakpoint
CREATE INDEX `benchmark_soal_dataset_idx` ON `benchmark_soal` (`dataset_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `blog_articles_slug_unique` ON `blog_articles` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_blog_slug` ON `blog_articles` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_blog_status` ON `blog_articles` (`status`);--> statement-breakpoint
CREATE INDEX `idx_blog_category` ON `blog_articles` (`category`);--> statement-breakpoint
CREATE UNIQUE INDEX `blok_artikel_key_idx` ON `blok_artikel` (`artikel_id`,`version`,`block_key`);--> statement-breakpoint
CREATE INDEX `blok_artikel_order_idx` ON `blok_artikel` (`artikel_id`,`version`,`bagian_artikel_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `blok_artikel_section_idx` ON `blok_artikel` (`bagian_artikel_id`);--> statement-breakpoint
CREATE INDEX `blok_artikel_status_idx` ON `blok_artikel` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `blok_artikel_ide_unique_idx` ON `blok_artikel_ide` (`blok_artikel_id`,`ide_id`);--> statement-breakpoint
CREATE INDEX `blok_artikel_ide_ide_idx` ON `blok_artikel_ide` (`ide_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `blok_artikel_sumber_unique_idx` ON `blok_artikel_sumber` (`blok_artikel_id`,`sumber_materi_id`,`source_version`);--> statement-breakpoint
CREATE INDEX `blok_artikel_sumber_source_idx` ON `blok_artikel_sumber` (`sumber_materi_id`);--> statement-breakpoint
CREATE INDEX `blueprint_asesmen_course_idx` ON `blueprint_asesmen` (`mata_kuliah_id`);--> statement-breakpoint
CREATE INDEX `blueprint_asesmen_status_version_idx` ON `blueprint_asesmen` (`status`,`version`);--> statement-breakpoint
CREATE INDEX `idx_booking_audit_booking_id` ON `booking_audit_logs` (`booking_id`);--> statement-breakpoint
CREATE INDEX `idx_booking_audit_group_id` ON `booking_audit_logs` (`group_id`);--> statement-breakpoint
CREATE INDEX `idx_booking_audit_actor_id` ON `booking_audit_logs` (`actor_id`);--> statement-breakpoint
CREATE INDEX `idx_reschedule_booking_id` ON `booking_reschedule_tickets` (`booking_id`);--> statement-breakpoint
CREATE INDEX `idx_reschedule_group_id` ON `booking_reschedule_tickets` (`group_id`);--> statement-breakpoint
CREATE INDEX `idx_reschedule_status` ON `booking_reschedule_tickets` (`status`);--> statement-breakpoint
CREATE INDEX `booking_resources_booking_idx` ON `booking_resources` (`booking_id`);--> statement-breakpoint
CREATE INDEX `booking_resources_booking_phase_idx` ON `booking_resources` (`booking_id`,`phase`);--> statement-breakpoint
CREATE INDEX `booking_resources_creator_idx` ON `booking_resources` (`created_by_id`);--> statement-breakpoint
CREATE INDEX `idx_ticket_messages_ticket_id` ON `booking_ticket_messages` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `idx_ticket_messages_sender_id` ON `booking_ticket_messages` (`sender_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_slot_id_unique` ON `bookings` (`slot_id`);--> statement-breakpoint
CREATE INDEX `bookings_slot_idx` ON `bookings` (`slot_id`);--> statement-breakpoint
CREATE INDEX `bookings_student_idx` ON `bookings` (`student_id`);--> statement-breakpoint
CREATE INDEX `bookings_group_idx` ON `bookings` (`group_id`);--> statement-breakpoint
CREATE INDEX `bookings_status_idx` ON `bookings` (`status`);--> statement-breakpoint
CREATE INDEX `bookings_session_date_idx` ON `bookings` (`session_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `bukti_ide_jawaban_unique_idx` ON `bukti_ide_jawaban` (`jawaban_murid_id`,`ide_id`);--> statement-breakpoint
CREATE INDEX `bukti_ide_jawaban_ide_idx` ON `bukti_ide_jawaban` (`ide_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bukti_pdf_bundle_lineage_idx` ON `bukti_pdf_bundle` (`impor_bundle_id`,`product_id`,`diktat_hash`,`print_profile`);--> statement-breakpoint
CREATE INDEX `bukti_pdf_bundle_import_idx` ON `bukti_pdf_bundle` (`impor_bundle_id`);--> statement-breakpoint
CREATE INDEX `bukti_pdf_bundle_product_idx` ON `bukti_pdf_bundle` (`product_id`);--> statement-breakpoint
CREATE INDEX `bukti_pdf_bundle_status_idx` ON `bukti_pdf_bundle` (`status`);--> statement-breakpoint
CREATE INDEX `bukti_pdf_bundle_diktat_hash_idx` ON `bukti_pdf_bundle` (`diktat_hash`);--> statement-breakpoint
CREATE INDEX `bukti_pdf_bundle_article_hash_idx` ON `bukti_pdf_bundle` (`article_hash`);--> statement-breakpoint
CREATE INDEX `bukti_pembelajaran_murid_ide_idx` ON `bukti_pembelajaran` (`pengguna_id`,`ide_id`);--> statement-breakpoint
CREATE INDEX `bukti_pembelajaran_source_idx` ON `bukti_pembelajaran` (`evidence_source`,`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bukti_pembelajaran_idempotency_idx` ON `bukti_pembelajaran` (`evidence_source`,`source_id`,`ide_id`,`rubric_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `cakupan_asesmen_chapter_idx` ON `cakupan_asesmen` (`asesmen_id`,`bab_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cakupan_asesmen_order_idx` ON `cakupan_asesmen` (`asesmen_id`,`order_index`);--> statement-breakpoint
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
CREATE INDEX `idx_custom_form_presets_category` ON `custom_form_presets` (`category`);--> statement-breakpoint
CREATE INDEX `idx_custom_form_responses_form_id` ON `custom_form_responses` (`form_id`);--> statement-breakpoint
CREATE INDEX `idx_custom_form_responses_user_id` ON `custom_form_responses` (`responder_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `custom_forms_slug_unique` ON `custom_forms` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_custom_forms_slug` ON `custom_forms` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_custom_forms_category` ON `custom_forms` (`category`);--> statement-breakpoint
CREATE INDEX `idx_daily_rec_student` ON `daily_recommendations` (`student_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_daily_rec_student_date` ON `daily_recommendations` (`student_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `diktat_ide_unique_idx` ON `diktat_ide` (`diktat_materi_id`,`ide_id`);--> statement-breakpoint
CREATE INDEX `diktat_ide_ide_idx` ON `diktat_ide` (`ide_id`);--> statement-breakpoint
CREATE INDEX `diktat_materi_course_idx` ON `diktat_materi` (`mata_kuliah_id`);--> statement-breakpoint
CREATE INDEX `diktat_materi_chapter_idx` ON `diktat_materi` (`bab_id`);--> statement-breakpoint
CREATE INDEX `diktat_materi_status_version_idx` ON `diktat_materi` (`status`,`version`);--> statement-breakpoint
CREATE INDEX `diktat_pembahasan_diktat_idx` ON `diktat_pembahasan` (`diktat_materi_id`);--> statement-breakpoint
CREATE INDEX `idx_distractor_prov_q` ON `distractor_provenance` (`question_id`);--> statement-breakpoint
CREATE INDEX `idx_distractor_prov_ko` ON `distractor_provenance` (`misconception_ko_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_distractor_prov_option` ON `distractor_provenance` (`question_id`,`option_index`);--> statement-breakpoint
CREATE INDEX `drive_item_parent_idx` ON `drive_item` (`parent_id`);--> statement-breakpoint
CREATE INDEX `drive_item_created_by_idx` ON `drive_item` (`created_by_user_id`);--> statement-breakpoint
CREATE INDEX `token_courses_token_idx` ON `enrollment_token_courses` (`token_id`);--> statement-breakpoint
CREATE INDEX `token_courses_course_idx` ON `enrollment_token_courses` (`course_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `enrollment_tokens_token_unique` ON `enrollment_tokens` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `export_spreadsheets_entity_idx` ON `export_spreadsheets` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_extraction_runs_chapter` ON `extraction_runs` (`chapter_id`);--> statement-breakpoint
CREATE INDEX `idx_extraction_runs_state` ON `extraction_runs` (`state`);--> statement-breakpoint
CREATE INDEX `flashcard_set_idx` ON `flashcard` (`set_flashcard_id`);--> statement-breakpoint
CREATE INDEX `flashcard_status_version_idx` ON `flashcard` (`status`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `flashcard_ide_unique_idx` ON `flashcard_ide` (`flashcard_id`,`ide_id`);--> statement-breakpoint
CREATE INDEX `flashcard_ide_ide_idx` ON `flashcard_ide` (`ide_id`);--> statement-breakpoint
CREATE INDEX `idx_fc_reviews_student` ON `flashcard_reviews` (`student_id`);--> statement-breakpoint
CREATE INDEX `idx_fc_reviews_card` ON `flashcard_reviews` (`flashcard_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `google_forms_form_id_unique` ON `google_forms` (`form_id`);--> statement-breakpoint
CREATE INDEX `idx_forms_form_id` ON `google_forms` (`form_id`);--> statement-breakpoint
CREATE INDEX `idx_forms_category` ON `google_forms` (`category`);--> statement-breakpoint
CREATE UNIQUE INDEX `google_meet_sessions_space_name_unique` ON `google_meet_sessions` (`space_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `google_meet_sessions_slug_unique` ON `google_meet_sessions` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_meet_space_name` ON `google_meet_sessions` (`space_name`);--> statement-breakpoint
CREATE INDEX `idx_meet_code` ON `google_meet_sessions` (`meeting_code`);--> statement-breakpoint
CREATE INDEX `idx_meet_slug` ON `google_meet_sessions` (`slug`);--> statement-breakpoint
CREATE INDEX `group_courses_group_idx` ON `group_courses` (`group_id`);--> statement-breakpoint
CREATE INDEX `group_courses_course_idx` ON `group_courses` (`course_id`);--> statement-breakpoint
CREATE INDEX `group_members_group_idx` ON `group_members` (`group_id`);--> statement-breakpoint
CREATE INDEX `group_members_user_idx` ON `group_members` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ide_stable_key_idx` ON `ide` (`stable_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `ide_course_code_idx` ON `ide` (`mata_kuliah_id`,`code`);--> statement-breakpoint
CREATE INDEX `ide_bab_idx` ON `ide` (`bab_id`);--> statement-breakpoint
CREATE INDEX `ide_concept_idx` ON `ide` (`concept_id`);--> statement-breakpoint
CREATE INDEX `ide_status_idx` ON `ide` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `impor_bundle_identity_idx` ON `impor_bundle` (`bundle_id`,`checksum`);--> statement-breakpoint
CREATE INDEX `impor_bundle_status_idx` ON `impor_bundle` (`status`);--> statement-breakpoint
CREATE INDEX `idx_important_links_category` ON `important_links` (`category`);--> statement-breakpoint
CREATE INDEX `idx_important_links_active` ON `important_links` (`is_active`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_active_intervention` ON `interventions` (`student_id`,`concept_name`) WHERE "status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX `item_asesmen_order_idx` ON `item_asesmen` (`asesmen_id`,`order_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `item_asesmen_soal_idx` ON `item_asesmen` (`asesmen_id`,`soal_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `item_diktat_pembahasan_order_idx` ON `item_diktat_pembahasan` (`diktat_pembahasan_id`,`order_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `item_diktat_pembahasan_soal_idx` ON `item_diktat_pembahasan` (`diktat_pembahasan_id`,`soal_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `item_impor_bundle_entity_idx` ON `item_impor_bundle` (`impor_bundle_id`,`entity_type`,`entity_id`,`entity_version`);--> statement-breakpoint
CREATE INDEX `item_impor_bundle_status_idx` ON `item_impor_bundle` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `jawaban_murid_attempt_item_idx` ON `jawaban_murid` (`percobaan_asesmen_id`,`item_asesmen_id`);--> statement-breakpoint
CREATE INDEX `jawaban_murid_status_idx` ON `jawaban_murid` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `kemajuan_baca_artikel_unique_idx` ON `kemajuan_baca_artikel` (`pengguna_id`,`artikel_id`,`artikel_version`,`bagian_artikel_id`);--> statement-breakpoint
CREATE INDEX `kemajuan_baca_artikel_resume_idx` ON `kemajuan_baca_artikel` (`pengguna_id`,`artikel_id`,`last_read_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `kemajuan_flashcard_murid_unique_idx` ON `kemajuan_flashcard_murid` (`pengguna_id`,`flashcard_id`);--> statement-breakpoint
CREATE INDEX `kemajuan_flashcard_murid_due_idx` ON `kemajuan_flashcard_murid` (`pengguna_id`,`due_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `ketergantungan_produk_edge_idx` ON `ketergantungan_produk` (`upstream_entity_type`,`upstream_entity_id`,`downstream_entity_type`,`downstream_entity_id`);--> statement-breakpoint
CREATE INDEX `ketergantungan_produk_upstream_idx` ON `ketergantungan_produk` (`upstream_entity_type`,`upstream_entity_id`);--> statement-breakpoint
CREATE INDEX `ketergantungan_produk_downstream_idx` ON `ketergantungan_produk` (`downstream_entity_type`,`downstream_entity_id`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `legacy_backfill_exception_source_idx` ON `legacy_backfill_exceptions` (`run_id`,`legacy_table`,`legacy_id`,`reason_code`);--> statement-breakpoint
CREATE INDEX `legacy_backfill_exception_run_idx` ON `legacy_backfill_exceptions` (`run_id`);--> statement-breakpoint
CREATE INDEX `legacy_backfill_exception_blocking_idx` ON `legacy_backfill_exceptions` (`blocks_cutover`);--> statement-breakpoint
CREATE INDEX `idx_live_results_session` ON `live_quiz_results` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_live_results_student` ON `live_quiz_results` (`student_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_live_result_session_student` ON `live_quiz_results` (`session_id`,`student_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `live_quiz_sessions_code_unique` ON `live_quiz_sessions` (`code`);--> statement-breakpoint
CREATE INDEX `idx_live_sessions_code` ON `live_quiz_sessions` (`code`);--> statement-breakpoint
CREATE INDEX `idx_live_sessions_course` ON `live_quiz_sessions` (`course_id`);--> statement-breakpoint
CREATE INDEX `idx_mrq_status` ON `mastery_recompute_queue` (`status`);--> statement-breakpoint
CREATE INDEX `idx_mrq_student_course` ON `mastery_recompute_queue` (`student_id`,`course_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `mata_kuliah_code_idx` ON `mata_kuliah` (`code`);--> statement-breakpoint
CREATE INDEX `mata_kuliah_legacy_course_idx` ON `mata_kuliah` (`legacy_course_id`);--> statement-breakpoint
CREATE INDEX `migration_checkpoints_run_idx` ON `migration_checkpoints` (`run_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `migration_runs_plan_idx` ON `migration_runs` (`plan_number`);--> statement-breakpoint
CREATE INDEX `migration_runs_status_idx` ON `migration_runs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_notifications_user_read` ON `notifications` (`user_id`,`read`);--> statement-breakpoint
CREATE INDEX `idx_notifications_user_created` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `pemahaman_ide_murid_ide_idx` ON `pemahaman_ide` (`pengguna_id`,`ide_id`);--> statement-breakpoint
CREATE INDEX `pemahaman_ide_ide_idx` ON `pemahaman_ide` (`ide_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pembahasan_soal_version_idx` ON `pembahasan_soal` (`soal_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `pendaftaran_murid_legacy_idx` ON `pendaftaran_murid` (`legacy_enrollment_id`);--> statement-breakpoint
CREATE INDEX `pendaftaran_murid_pengguna_idx` ON `pendaftaran_murid` (`pengguna_id`);--> statement-breakpoint
CREATE INDEX `pendaftaran_murid_mata_kuliah_idx` ON `pendaftaran_murid` (`mata_kuliah_id`);--> statement-breakpoint
CREATE INDEX `pengguna_status_idx` ON `pengguna` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `pengguna_peran_unique_idx` ON `pengguna_peran` (`pengguna_id`,`peran_id`);--> statement-breakpoint
CREATE INDEX `pengguna_peran_pengguna_idx` ON `pengguna_peran` (`pengguna_id`);--> statement-breakpoint
CREATE INDEX `pengguna_peran_peran_idx` ON `pengguna_peran` (`peran_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `penugasan_tutor_legacy_idx` ON `penugasan_tutor` (`legacy_tutor_course_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `penugasan_tutor_scope_idx` ON `penugasan_tutor` (`pengguna_id`,`mata_kuliah_id`,`assignment_scope`);--> statement-breakpoint
CREATE INDEX `penugasan_tutor_pengguna_idx` ON `penugasan_tutor` (`pengguna_id`);--> statement-breakpoint
CREATE INDEX `penugasan_tutor_mata_kuliah_idx` ON `penugasan_tutor` (`mata_kuliah_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `peran_code_unique` ON `peran` (`code`);--> statement-breakpoint
CREATE INDEX `percobaan_asesmen_murid_idx` ON `percobaan_asesmen` (`pengguna_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `percobaan_asesmen_assessment_idx` ON `percobaan_asesmen` (`asesmen_id`,`status`);--> statement-breakpoint
CREATE INDEX `perubahan_pemahaman_ide_idx` ON `perubahan_pemahaman` (`pemahaman_ide_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `peta_id_legacy_source_idx` ON `peta_id_legacy` (`legacy_table`,`legacy_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `peta_id_legacy_target_idx` ON `peta_id_legacy` (`target_table`,`target_id`);--> statement-breakpoint
CREATE INDEX `peta_id_legacy_run_idx` ON `peta_id_legacy` (`run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_pka_registrations_user` ON `pka_registrations` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_pka_stages_subject_stage` ON `pka_simulation_stages` (`subject`,`stage`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_pka_progress_student_subject_stage` ON `pka_stage_progress` (`student_id`,`subject`,`stage`);--> statement-breakpoint
CREATE UNIQUE INDEX `potongan_sumber_span_idx` ON `potongan_sumber` (`sumber_materi_id`,`source_version`,`start_offset`,`end_offset`);--> statement-breakpoint
CREATE INDEX `potongan_sumber_source_idx` ON `potongan_sumber` (`sumber_materi_id`,`source_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `publikasi_bundle_version_idx` ON `publikasi_bundle` (`impor_bundle_id`,`version`);--> statement-breakpoint
CREATE INDEX `publikasi_bundle_status_idx` ON `publikasi_bundle` (`status`);--> statement-breakpoint
CREATE INDEX `idx_qgen_runs_course` ON `question_generation_runs` (`course_id`);--> statement-breakpoint
CREATE INDEX `idx_qos_question` ON `question_option_stats` (`question_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_qos_question_option` ON `question_option_stats` (`question_id`,`option_index`);--> statement-breakpoint
CREATE INDEX `idx_qai_template` ON `quiz_ai_insights` (`template_id`);--> statement-breakpoint
CREATE INDEX `idx_qai_exam` ON `quiz_ai_insights` (`exam_id`);--> statement-breakpoint
CREATE INDEX `idx_templates_search` ON `quiz_templates` (`course_id`,`category`,`visibility`);--> statement-breakpoint
CREATE UNIQUE INDEX `rekomendasi_flashcard_unique_idx` ON `rekomendasi_flashcard` (`pengguna_id`,`flashcard_id`,`due_at`);--> statement-breakpoint
CREATE INDEX `rekomendasi_flashcard_due_idx` ON `rekomendasi_flashcard` (`pengguna_id`,`due_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `relasi_ide_unique_idx` ON `relasi_ide` (`source_idea_id`,`target_idea_id`,`relation_type`);--> statement-breakpoint
CREATE INDEX `relasi_ide_source_idx` ON `relasi_ide` (`source_idea_id`);--> statement-breakpoint
CREATE INDEX `relasi_ide_target_idx` ON `relasi_ide` (`target_idea_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_bundle_reviewer_idx` ON `review_bundle` (`impor_bundle_id`,`reviewer_id`);--> statement-breakpoint
CREATE INDEX `review_bundle_status_idx` ON `review_bundle` (`status`);--> statement-breakpoint
CREATE INDEX `review_flashcard_progress_idx` ON `review_flashcard` (`kemajuan_flashcard_murid_id`,`reviewed_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_item_bundle_target_idx` ON `review_item_bundle` (`impor_bundle_id`,`reviewer_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `review_item_bundle_import_idx` ON `review_item_bundle` (`impor_bundle_id`);--> statement-breakpoint
CREATE INDEX `review_item_bundle_status_idx` ON `review_item_bundle` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_pedagogi_bundle_decision_idx` ON `review_pedagogi_bundle` (`impor_bundle_id`,`reviewer_id`,`content_fingerprint`,`policy_version`);--> statement-breakpoint
CREATE INDEX `review_pedagogi_bundle_import_idx` ON `review_pedagogi_bundle` (`impor_bundle_id`);--> statement-breakpoint
CREATE INDEX `review_pedagogi_bundle_reviewer_idx` ON `review_pedagogi_bundle` (`reviewer_id`);--> statement-breakpoint
CREATE INDEX `review_pedagogi_bundle_fingerprint_idx` ON `review_pedagogi_bundle` (`content_fingerprint`);--> statement-breakpoint
CREATE INDEX `review_pedagogi_bundle_status_idx` ON `review_pedagogi_bundle` (`status`);--> statement-breakpoint
CREATE INDEX `idx_search_documents_entity` ON `search_documents` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_search_documents_synced` ON `search_documents` (`is_synced`);--> statement-breakpoint
CREATE INDEX `idx_search_documents_sync_status` ON `search_documents` (`sync_status`);--> statement-breakpoint
CREATE INDEX `idx_search_documents_min_role` ON `search_documents` (`min_role`);--> statement-breakpoint
CREATE INDEX `idx_search_documents_course` ON `search_documents` (`course_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `set_flashcard_course_idx` ON `set_flashcard` (`mata_kuliah_id`);--> statement-breakpoint
CREATE INDEX `set_flashcard_chapter_idx` ON `set_flashcard` (`bab_id`);--> statement-breakpoint
CREATE INDEX `set_flashcard_status_version_idx` ON `set_flashcard` (`status`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `short_link_slug_unique` ON `short_link` (`slug`);--> statement-breakpoint
CREATE INDEX `soal_course_idx` ON `soal` (`mata_kuliah_id`);--> statement-breakpoint
CREATE INDEX `soal_chapter_idx` ON `soal` (`bab_id`);--> statement-breakpoint
CREATE INDEX `soal_status_version_idx` ON `soal` (`status`,`version`);--> statement-breakpoint
CREATE INDEX `soal_origin_idx` ON `soal` (`origin`,`source_event_name`);--> statement-breakpoint
CREATE INDEX `soal_assessment_source_idx` ON `soal` (`assessment_source_id`,`source_question_number`);--> statement-breakpoint
CREATE INDEX `soal_quiz_eligible_idx` ON `soal` (`mata_kuliah_id`,`status`,`quiz_eligible`);--> statement-breakpoint
CREATE UNIQUE INDEX `soal_ide_unique_idx` ON `soal_ide` (`soal_id`,`ide_id`);--> statement-breakpoint
CREATE INDEX `soal_ide_ide_idx` ON `soal_ide` (`ide_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `soal_itb_referensi_checksum_idx` ON `soal_itb_referensi` (`checksum`);--> statement-breakpoint
CREATE INDEX `soal_itb_referensi_visibility_idx` ON `soal_itb_referensi` (`authoring_visibility`);--> statement-breakpoint
CREATE UNIQUE INDEX `soal_relasi_ide_unique_idx` ON `soal_relasi_ide` (`soal_id`,`ide_id`,`relation_type`);--> statement-breakpoint
CREATE INDEX `soal_relasi_ide_ide_idx` ON `soal_relasi_ide` (`ide_id`);--> statement-breakpoint
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
CREATE INDEX `idx_attempts_grading_status` ON `student_quiz_attempts` (`template_id`,`grading_status`);--> statement-breakpoint
CREATE INDEX `idx_study_paths_student` ON `study_paths` (`student_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_study_paths_student_course` ON `study_paths` (`student_id`,`course_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_submissions_user_exam_attempt` ON `submissions` (`user_id`,`exam_id`,`attempt_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `sumber_materi_version_idx` ON `sumber_materi` (`mata_kuliah_id`,`canonical_uri_or_r2_key`,`version`);--> statement-breakpoint
CREATE INDEX `sumber_materi_bab_idx` ON `sumber_materi` (`bab_id`);--> statement-breakpoint
CREATE INDEX `sumber_materi_status_idx` ON `sumber_materi` (`status`);--> statement-breakpoint
CREATE INDEX `idx_tcm_student_course` ON `tutor_chat_messages` (`student_id`,`course_id`);--> statement-breakpoint
CREATE INDEX `idx_tcm_session` ON `tutor_chat_messages` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_tcm_created_at` ON `tutor_chat_messages` (`created_at`);--> statement-breakpoint
CREATE INDEX `tutor_courses_tutor_idx` ON `tutor_courses` (`tutor_id`);--> statement-breakpoint
CREATE INDEX `tutor_courses_course_idx` ON `tutor_courses` (`course_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_tss_student_course` ON `tutor_session_summaries` (`student_id`,`course_id`);--> statement-breakpoint
CREATE INDEX `tutor_slots_tutor_idx` ON `tutor_slots` (`tutor_id`);--> statement-breakpoint
CREATE INDEX `tutor_slots_tutor_date_idx` ON `tutor_slots` (`tutor_id`,`session_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `tutor_slots_exact_unique_idx` ON `tutor_slots` (`tutor_id`,`session_date`,`start_time`,`end_time`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_push_tokens_token_unique` ON `user_push_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_push_tokens_user` ON `user_push_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_push_tokens_token` ON `user_push_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_vector_sync_status` ON `vector_sync_queue` (`status`);--> statement-breakpoint
CREATE INDEX `idx_vector_sync_lease` ON `vector_sync_queue` (`lease_expires_at`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `idx_web_mat_ver_mat` ON `website_material_versions` (`material_id`);--> statement-breakpoint
CREATE INDEX `idx_web_mat_stale` ON `website_materials` (`is_stale`);--> statement-breakpoint
CREATE INDEX `idx_web_mat_chapter` ON `website_materials` (`chapter_id`);--> statement-breakpoint
CREATE INDEX `idx_weekly_ref_student` ON `weekly_reflections` (`student_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_weekly_ref_student_week` ON `weekly_reflections` (`student_id`,`week_start`);--> statement-breakpoint
CREATE INDEX `idx_zyra_preferences_student_course` ON `zyra_learner_preferences` (`student_id`,`course_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_zyra_preferences_student_course` ON `zyra_learner_preferences` (`student_id`,`course_id`);--> statement-breakpoint
CREATE INDEX `idx_zyra_profile_student_course` ON `zyra_learner_profiles` (`student_id`,`course_id`);--> statement-breakpoint
CREATE INDEX `idx_zyra_profile_expiry` ON `zyra_learner_profiles` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_zyra_profile_student_course` ON `zyra_learner_profiles` (`student_id`,`course_id`);--> statement-breakpoint
CREATE INDEX `idx_zyra_event_student_course_created` ON `zyra_learning_events` (`student_id`,`course_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_zyra_event_student_course_kind` ON `zyra_learning_events` (`student_id`,`course_id`,`event_kind`);--> statement-breakpoint
CREATE INDEX `idx_zyra_event_idea` ON `zyra_learning_events` (`idea_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `zyra_message_attachments_object_key_unique` ON `zyra_message_attachments` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_zyra_attachment_owner_scope` ON `zyra_message_attachments` (`student_id`,`course_id`,`session_id`);--> statement-breakpoint
CREATE INDEX `idx_zyra_attachment_expiry` ON `zyra_message_attachments` (`expires_at`,`status`);--> statement-breakpoint
CREATE INDEX `idx_zyra_attachment_message` ON `zyra_message_attachments` (`message_id`);--> statement-breakpoint
CREATE INDEX `idx_zyra_ops_event_type_created` ON `zyra_operational_events` (`event_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_zyra_ops_route_created` ON `zyra_operational_events` (`route_class`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_zyra_proposal_event_proposal` ON `zyra_proposal_events` (`proposal_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_zyra_proposal_event_actor` ON `zyra_proposal_events` (`actor_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_zyra_proposal_actor_status` ON `zyra_proposals` (`actor_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_zyra_proposal_course_status` ON `zyra_proposals` (`course_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_zyra_proposal_expiry` ON `zyra_proposals` (`expires_at`,`status`);--> statement-breakpoint
