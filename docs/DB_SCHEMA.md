# Zyx Database Schema Reference

Authoritative overview of the PostgreSQL schema defined in `db/schema.ts` (244 `pgTable` definitions) and managed via Drizzle migrations in `drizzle-postgres/` (42 migrations through `0041_discussion_search_indexes.sql`).

For exact column types, foreign keys, and indexes, always inspect [db/schema.ts](../db/schema.ts) directly. For environment setup and migration commands, see [DATABASE.md](DATABASE.md).

## 1. Identity, Authentication, and RBAC

| Table | Purpose |
| --- | --- |
| `user` | Primary Better Auth user record (`id`, `name`, `email`, `emailVerified`, `image`, `role`, `lastActivityAt`). |
| `session` | Better Auth active sessions (supports multi-account saved sessions). |
| `account` | OAuth provider accounts (Google) and tokens. |
| `verification` | Email/OAuth verification tokens. |
| `account_locale_preferences` | Persistent UI locale (`id` or `en`) per user. |
| `pengguna` | Canonical domain user identity (`active` / `suspended`) linked to `user.id`. |
| `peran` | Canonical role definitions (`admin`, `tutor`, `murid`). |
| `pengguna_peran` | Many-to-many role assignments for multi-role access control. |
| `email_notification_preferences` | Per-user category opt-in/out preferences and signed unsubscribe support. |

## 2. Courses, Enrollment, Cohorts, and Pricing

### `mata_kuliah`
Canonical course catalog table storing course code, title, slug, access category (paid, free, scheduled free access window), visibility, and legacy `courses` mapping.

| Table | Purpose |
| --- | --- |
| `mata_kuliah` | Canonical course catalog and access-category policy. |
| `bab` | Canonical ordered chapters per course. |
| `pendaftaran_murid` | Canonical student enrollments per course. |
| `penugasan_tutor` | Canonical tutor-to-course assignments. |
| `courses`, `chapters`, `chapter_aliases` | Compatibility course/chapter tables and alias resolution. |
| `groups`, `group_members`, `group_courses` | Study groups formed via activation tokens and their course access. |
| `enrollment_tokens`, `enrollment_token_courses` | Activation tokens (`Zyx-XXXXXXXX-{capacity}-{courseIds.length}`) with capacity and course bindings. |
| `pricing_settings` | Singleton table for admin-managed platform and tutorial discount schedules. |
| `discount_vouchers` | Promotional discount vouchers. |
| `tutor_courses` | Compatibility tutor course assignments. |

## 3. Canonical Sources, Ideas, and Products (V3 / V4 / V5)

| Table | Purpose |
| --- | --- |
| `sumber_materi`, `potongan_sumber` | Ingested Source Pack documents, checksums, and chunked source segments. |
| `ide`, `asal_ide`, `relasi_ide` | Atomic canonical Ideas, source provenance spans, and prerequisite/related Idea edges. |
| `bagian_pembelajaran`, `bagian_pembelajaran_ide` | Pedagogical learning sections and Idea membership (Idea Bundle V3). |
| `artikel`, `artikel_ide`, `bagian_artikel`, `blok_artikel`, `blok_artikel_ide`, `blok_artikel_sumber` | Structured scientific Articles (V3/V4), sections, typed blocks, Idea links, and source citations. |
| `diktat_materi`, `diktat_ide` | Authored printable Diktat PDFs and Idea links. |
| `solution_collections`, `diktat_pembahasan`, `item_diktat_pembahasan` | Standalone reviewed solution collections (Product Bundle V5). |
| `set_flashcard`, `flashcard`, `flashcard_ide` | Canonical Idea-linked flashcard sets and cards. |
| `ketergantungan_produk` | Versioned product-to-product and product-to-Idea dependency graph. |
| `peta_id_legacy` | Deterministic canonical-to-legacy ID mapping table. |
| `impor_bundle`, `item_impor_bundle` | Staged bundle imports, checksums, and deterministic insertion order. |
| `review_bundle`, `review_item_bundle`, `review_pedagogi_bundle` | Revision-bound and product-scoped semantic/pedagogical review decisions. |
| `publikasi_bundle`, `bukti_pdf_bundle`, `audit_mutasi`, `alur_konten` | Atomic publication receipts, verified PDF evidence (1 to 4 pages), and immutable mutation audit logs. |

## 4. Assessments, Question Bank, and Mastery

| Table | Purpose |
| --- | --- |
| `soal`, `soal_ide`, `soal_relasi_ide`, `pembahasan_soal` | Canonical questions, Idea weights (primary/secondary), multi-Idea relations, and solutions. |
| `soal_itb_referensi`, `question_reference_links`, `assessment_sources`, `benchmark_soal` | Historical reference questions (read-only authoring context), provenance links, and benchmarks. |
| `blueprint_asesmen`, `asesmen`, `cakupan_asesmen`, `item_asesmen` | Canonical assessment blueprints, quizzes/tryouts, chapter scopes, and versioned question items. |
| `percobaan_asesmen`, `jawaban_murid`, `bukti_ide_jawaban` | Canonical student assessment attempts, answers, and per-Idea mastery evidence. |
| `bukti_pembelajaran`, `pemahaman_ide`, `perubahan_pemahaman`, `rekomendasi_flashcard` | Learning evidence events, per-Idea mastery state, mastery deltas, and flashcard recommendations. |
| `kemajuan_flashcard_murid`, `review_flashcard` | SM-2 spaced-repetition flashcard progress and review logs. |
| `quiz_templates`, `student_quiz_attempts`, `quiz_ai_insights`, `student_quiz_analytics` | Compatibility quiz projections, attempt records, and analytics. |
| `ai_question_bank`, `distractor_provenance`, `question_option_stats`, `questions`, `submissions` | Legacy/compatibility question bank, distractor provenance, and submission tables. |
| `live_quiz_sessions`, `live_quiz_results` | Real-time classroom quiz sessions and durable student answers (`FEATURE_LIVE`). |
| `coding_problems`, `coding_drafts`, `coding_attempts` | Interactive Python coding problems, guarded drafts, and graded submissions. |
| `master_teaching_documents`, `concepts`, `concept_localizations`, `concept_graph_edges` | Concept graph and MTD metadata. |
| `student_chapter_progress`, `student_chapter_mastery`, `mastery_recompute_queue`, `study_paths`, `attempt_feedback`, `interventions`, `weekly_reflections`, `learning_outcomes`, `learning_outcome_concepts`, `career_path_templates`, `career_path_concepts`, `course_analytics_snapshots`, `content_quality_flags` | Learning analytics, study paths, feedback, reflections, and quality audits. |

## 5. Zyra AI, Model Registry, and Admin Ops Knowledge

| Table | Purpose |
| --- | --- |
| `ai_model_settings` | Global and per-feature AI Gateway model selections, alias preferences, and latency/health metadata. |
| `tutor_chat_sessions`, `tutor_chat_messages`, `chat_message_sources`, `zyra_message_attachments` | Zyra tutoring conversations, grounded source citations, and private learner image attachments. |
| `zyra_proposals`, `zyra_proposal_events` | Admin/Tutor Ops AI action proposals (30-minute TTL) and immutable audit events. |
| `zyra_operational_events` | Fixed-column privacy-safe operational telemetry (no prompts, responses, raw keys, or learner PII). |
| `ai_generation_jobs`, `question_generation_runs`, `ai_extraction_failures`, `ai_material_instances`, `ai_material_instance_sections`, `ai_material_instance_chunks` | AI generation job tracking and extraction provenance. |
| `vector_sync_queue` | Transactional outbox for canonical 768d Cloudflare Vectorize synchronization. |
| `admin_ops_knowledge_sources`, `admin_ops_knowledge_chunks`, `admin_ops_knowledge_sync_queue` | Curated Admin Ops Knowledge catalog, chunks, and Vectorize sync queue. |

## 6. Discussions (Migrations 0024 to 0034, 0038, 0041)

| Table | Purpose |
| --- | --- |
| `discussion_channels`, `discussion_channel_preferences` | Course and general discussion channels and user notification preferences. |
| `discussion_threads`, `discussion_thread_participants`, `discussion_thread_reads` | Scoped Q&A threads, participant tracking, and read cursors. |
| `discussion_messages`, `discussion_attachments`, `discussion_reactions`, `discussion_reports` | Thread messages, private attachments, reactions, and moderation reports. |
| `discussion_ai_requests`, `discussion_events`, `discussion_message_observations`, `discussion_notification_deliveries` | Single-dispatch `@Zyra` AI requests, audit events, signed read observations, and delivery tracking. |

- Migration `0038_discussion_mention_handles.sql` adds mention handle support.
- Migration `0041_discussion_search_indexes.sql` adds GIN full-text search indexes on discussion titles and active message bodies.

## 7. Gamification, Social Identity, and Pet Studio (Migrations 0009 to 0023, 0036, 0037)

| Table | Purpose |
| --- | --- |
| `gamification_accounts`, `gamification_profiles` | Student XP/LP balances, rank state, equipped cosmetics (frame, theme, title, Zyra skin, pet, suit, action), and visibility settings (`0037_member_profile_visibility.sql`). |
| `gamification_cosmetics`, `gamification_inventory` | Explicit LP shop catalog (including 15 Pet Studio suits in `0036_student_pet_studio.sql`) and student ownership. |
| `gamification_xp_ledger`, `gamification_lp_ledger`, `gamification_daily_rank_snapshots`, `gamification_leaderboard_periods` | Idempotent XP/LP ledgers and bounded leaderboard projections. |
| `gamification_badges`, `gamification_badge_activities`, `gamification_missions`, `gamification_qualified_days`, `student_streaks` | Achievement tiers, active missions, and daily streaks. |
| `gamification_checklists`, `gamification_checklist_items`, `gamification_course_starts` | Frozen per-student course reward checklists. |
| `gamification_article_completions`, `gamification_explanation_completions`, `gamification_explanation_completions_v2`, `gamification_eligible_recalls`, `gamification_learning_facts`, `gamification_evidence_receipts`, `gamification_event_outbox` | Verified learning receipts and transactional reward outbox. |
| `gamification_question_exposures`, `gamification_question_exposure_observations`, `gamification_question_exposure_projection`, `gamification_question_exposure_initializations`, `gamification_question_bank_disclosures`, `gamification_question_history_cutover`, `gamification_question_legacy_index` | Compact maximum-time question exposure projection preventing duplicate/disclosed question rewards. |
| `gamification_follows`, `gamification_blocks`, `gamification_reports`, `gamification_social_rate_limits` | Student social graph, bidirectional blocks, reports, and rate limits. |

## 8. Schedules, Bookings, Forms, and Platform Operations

| Table | Purpose |
| --- | --- |
| `tutor_slots`, `bookings`, `booking_resources`, `booking_audit_logs`, `booking_reschedule_tickets`, `booking_ticket_messages` | Tutorial slot availability, student bookings, audit trails, and reschedule workflows. |
| `academic_schedules`, `google_calendar_sync` | Academic calendar events and Google Calendar sync state (`0040_google_calendar_sync.sql`). |
| `google_meet_sessions`, `google_forms`, `export_spreadsheets` | Google Workspace Meet, Forms, and Sheets integration records. |
| `custom_forms`, `custom_form_responses`, `custom_form_presets` | Form Studio definitions, responses, and reusable presets. |
| `pka_announcements`, `pka_schedules`, `pka_registrations`, `pka_simulation_stages`, `pka_stage_progress`, `pka_announcement_reads` | Tutorial PKA campaign tables (`FEATURE_PKA`). |
| `blog_articles`, `short_link`, `important_links`, `page_analytics`, `search_documents` | Public blog, short links, external links, analytics, and cross-entity lexical search index. |
| `public_demo_snapshots` | Validated V2 JSONB demo baselines (`free-first-chapter` policy) for `/demo`. |
| `queue_task_checkpoints` | Durable step checkpoints for Cloud Tasks / queue provider execution (`0035_queue_task_checkpoints.sql`). |
| `admin_operation_jobs` | Async MCP admin operation receipts and media upload jobs. |
| `migration_runs`, `migration_checkpoints`, `legacy_backfill_exceptions` | Guarded migration and backfill audit records. |
