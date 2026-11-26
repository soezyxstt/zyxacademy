# Database Guide

Zyx Academy uses PostgreSQL via Drizzle ORM (`db/schema.ts`, `lib/db/index.ts`). Staging and production run on separate Neon PostgreSQL branches with separate private Neon S3-compatible object-storage buckets (`STORAGE_PROVIDER_MODE=neon`). The adapter requires PostgreSQL in development, CI, staging, and production; it never falls back to SQLite or Turso.

## Environments and Targets

| Environment | Engine | Neon Project / Branch | Database | Object Storage |
| --- | --- | --- | --- | --- |
| Local development & CI | PostgreSQL (or PGlite for isolated contract tests) | Local or isolated test DB | Local / PGlite | Local / configured bucket |
| Staging | Neon PostgreSQL | Project `muddy-sky-44104897`, branch `br-gentle-scene-azq0gp91` | `neondb` | Private bucket `zyx-staging` (`STORAGE_PROVIDER_MODE=neon`) |
| Production | Neon PostgreSQL | Project `muddy-sky-44104897`, protected root `br-wandering-butterfly-azi11h8r` | `neondb` | Private bucket `zyx-production` (`STORAGE_PROVIDER_MODE=neon`) |

- Use the pooled Neon endpoint (`-pooler`) for application traffic and the direct endpoint for migrations and administrative operations.
- Keep environment-specific credentials in ignored `.env` files (`.env.local`, `.env.staging`, `.env.prod`). Never commit credentials or print `DATABASE_URL` in logs.
- Legacy Turso/SQLite and R2 resources are retained strictly as cold recovery backups and are never used by serving traffic.

## Migration Workflow

All schema changes are authored in `db/schema.ts` and generated into `drizzle-postgres/` (42 migrations through `0041_discussion_search_indexes.sql`):

```bash
# 1. Edit db/schema.ts (Drizzle ORM PostgreSQL schema)
# 2. Generate SQL migration files in drizzle-postgres/
bun run db:generate
# 3. Apply pending migrations to the verified target
bun run db:migrate
```

Rules:
- Never hand-edit generated migration files in `drizzle-postgres/`.
- `bun run db:push:prod` is intentionally disabled. Remote migrations must run through the guarded PostgreSQL migrator (`db/postgres-migrate.ts`) after verifying the exact Neon project, branch, host, and database.
- Take a Neon branch snapshot before applying destructive or backfill-dependent migrations to staging or production.
- Web and worker deployments do not run migrations or seeds automatically. Apply schema migrations before releasing code that depends on new columns, tables, or indexes.

## Schema Domains

The full table-by-table reference is in [DB_SCHEMA.md](DB_SCHEMA.md) (244 PostgreSQL tables in `db/schema.ts`). High-level domains:

- **Identity and access**: Better Auth (`user`, `session`, `account`, `verification`), locale preferences (`account_locale_preferences`), and canonical Indonesian RBAC (`pengguna`, `peran`, `pengguna_peran`).
- **Courses, cohorts, and enrollment**: `courses`, `chapters`, `mata_kuliah`, `bab`, `pendaftaran_murid`, `penugasan_tutor`, `groups`, `group_members`, `group_courses`, `enrollment_tokens`, `enrollment_token_courses`, `pricing_settings`, `discount_vouchers`.
- **Canonical authoring and bundles**: `sumber_materi`, `potongan_sumber`, `ide`, `asal_ide`, `relasi_ide`, `bagian_pembelajaran`, `artikel`, `bagian_artikel`, `blok_artikel`, `diktat_materi`, `solution_collections`, `diktat_pembahasan`, `set_flashcard`, `flashcard`, `impor_bundle`, `review_bundle`, `review_item_bundle`, `publikasi_bundle`, `bukti_pdf_bundle`, `audit_mutasi`.
- **Assessment and mastery**: `soal`, `soal_ide`, `pembahasan_soal`, `soal_itb_referensi`, `asesmen`, `item_asesmen`, `percobaan_asesmen`, `jawaban_murid`, `pemahaman_ide`, `quiz_templates`, `student_quiz_attempts`, `live_quiz_sessions`, `live_quiz_results`, `coding_problems`, `coding_drafts`, `coding_attempts`.
- **Zyra AI and Ops**: `ai_model_settings`, `tutor_chat_sessions`, `tutor_chat_messages`, `zyra_message_attachments`, `zyra_proposals`, `zyra_operational_events`, `ai_generation_traces`, `admin_ops_knowledge_sources`, `admin_ops_knowledge_chunks`, `admin_ops_knowledge_sync_queue`, `vector_sync_queue`.
- **Discussions**: 13 tables (`discussion_channels`, `discussion_threads`, `discussion_messages`, `discussion_attachments`, `discussion_reactions`, `discussion_reports`, `discussion_thread_participants`, `discussion_thread_reads`, `discussion_channel_preferences`, `discussion_ai_requests`, `discussion_events`, `discussion_message_observations`, `discussion_notification_deliveries`) with GIN full-text search indexes (`0041_discussion_search_indexes.sql`).
- **Gamification and social**: `gamification_accounts`, `gamification_profiles`, `gamification_cosmetics`, `gamification_inventory`, `gamification_xp_ledger`, `gamification_lp_ledger`, `gamification_badges`, `gamification_missions`, `gamification_follows`, `gamification_blocks`, `gamification_reports`, `gamification_question_exposure_projection`, `gamification_event_outbox`, `student_streaks`.
- **Scheduling, forms, and platform**: `tutor_slots`, `bookings`, `academic_schedules`, `google_calendar_sync`, `google_meet_sessions`, `custom_forms`, `custom_form_responses`, `custom_form_presets`, `blog_articles`, `short_link`, `important_links`, `public_demo_snapshots`, `queue_task_checkpoints`, `email_notification_preferences`, `admin_operation_jobs`.

## Key Design Decisions

- **Timestamps**: PostgreSQL columns use `timestamptz`. Always normalize dates and Jakarta day boundaries through `lib/date-utils.ts`.
- **Dual hashing**: Content entities track `sourceHash` (raw content) and `derivedHash` (structured attributes) to avoid unnecessary regeneration on cosmetic edits.
- **External vector storage**: Semantic embeddings (768-dimensional Gemini embeddings) live in Cloudflare Vectorize, synchronized transactionally via `vector_sync_queue` and `admin_ops_knowledge_sync_queue`.
- **Idempotent outboxes**: Gamification awards, vector sync, and queue task checkpoints (`queue_task_checkpoints`) use transactional outbox tables so background workers can retry safely without duplicate side effects.
