# Database Guide

## Stack

| Environment | Engine | URL pattern |
|---|---|---|
| Development | SQLite (`dev.db`) | `file:dev.db` |
| Production | Turso (distributed SQLite) | `libsql://...` or `DATABASE_URL` |

Connection managed by `lib/db/index.ts` ; auto-detects production from `NODE_ENV`.

## Migration Workflow

```bash
# 1. Edit db/schema.ts (Drizzle ORM ; sqliteTable)
# 2. Generate migration files:
bun run db:generate
# 3. Apply locally:
bun run db:migrate
# 4. Push to production (safe: backup + verify):
bun run db:push:prod
```

Never hand-edit files in `drizzle/`.

## Schema Domains

Full table reference in [ARCHITECTURE.md](./ARCHITECTURE.md#3-database-schema--all-tables). High-level domains:

### Auth (Better-Auth)
`user`, `session`, `account`, `verification` ; auto-managed by Better-Auth adapter.

### Course & Enrollment
`courses`, `enrollments`, `groups`, `group_members`, `enrollment_tokens` ; course catalog, cohort management, token-based enrollment.

### Content (vNext Architecture)
| Table | Role |
|---|---|
| `master_teaching_documents` | Source-of-truth markdown, typed `learning` or `assessment`, dual-hashed |
| `knowledge_objects` | Atomic learning units ; typed, bloom-leveled, linked to concept + MTD + chapter |
| `assessment_objects` | Extracted assessment metadata per MTD |
| `assessment_profiles` | Per-course auto-computed metrics |
| `course_policies` | Per-course teacher-defined constraints |

### Published Assets
`website_materials`, `flashcard_sets`, `flashcards`, `diktats`, `course_materials` ; compiled student-facing content.

### AI Generation
`ai_generation_jobs`, `ai_question_bank`, `ai_usage_events` ; tracks Gemini work, question repository, token usage.

### Quiz & Assessment
`quiz_templates`, `student_quiz_attempts`, `attempt_feedback`, `live_quiz_sessions` ; quiz config, attempts, feedback, live classroom.

### Mastery & Analytics
`learning_events`, `student_concept_mastery`, `student_streaks`, `daily_recommendations`, `study_paths`, `student_flashcard_progress` ; mastery computation, spaced repetition, personalization.

### Storage
`drive_item` ; legacy read-only file pointers for the admin drive (now a read-only browser over R2 domain prefixes). New uploads store R2 keys in the owning tables (`course_materials.fileUrl`, `diktats.fileUrl`, `pka_registrations.proof_key`, `blog_articles.thumbnail_url`).

## Key Design Decisions

- **SQLite stays** ; no Postgres. Turso for production scale.
- **Dual-hashing** ; `sourceHash` (raw content) + `derivedHash` (structured attributes) prevent unnecessary regeneration on cosmetic edits.
- **All timestamps** use `integer` (Unix ms) with `{ mode: "timestamp" }`.
- **Vectors** are stored externally in canonical Cloudflare Vectorize, not in SQLite. Legacy vector columns remain only as preserved migration history.
