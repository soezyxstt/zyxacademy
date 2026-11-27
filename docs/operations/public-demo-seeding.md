# Public Demo Snapshot Seeding

Operational contract and guarded seeding procedure for the anonymous interactive demo at `/demo`.

## Content Boundary (`free-first-chapter`)

The public demo reuses the shared student shell, course catalog, dashboard, articles, read-only diktats, flashcards, quizzes, tryouts, calendar, groups, achievements, leaderboard, and scripted Zyra via `StudentAccountBoundary` and browser-local fictional state.

Eligible real content is strictly bounded to the first active chapter of the four canonical courses (**Matematika I**, **Fisika Dasar I**, **Kimia Dasar I**, **Berpikir Komputasional**):

- **Article and Diktat**: Must belong to the first active chapter and pass published Free eligibility. Diktat renders read-only with downloads disabled.
- **Flashcards**: Must be a published Free-eligible set scoped to the first chapter.
- **Quiz**: Must match a published Free quiz template and canonical quiz assessment with an explicit unique fixed question set confined to the first chapter. Initial payloads omit answers; grading runs through signed stateless page tokens (up to 3 questions per page). When no eligible real quiz resolves, the runtime falls back to authored fictional questions in `lib/demo/fictional-products.ts`.
- **Sanitization**: Unsafe links, source-figure assets, generic PDFs, storage keys, paid bodies, answer keys, and coding locators are stripped or withheld.
- **Isolation**: Demo sessions never mutate live accounts, enrollments, schedules, or profiles, and never consume live AI quota. Resetting the demo clears browser-local progress, social, and reward overlays.

## Table and JSON Contract

Migration `drizzle-postgres/0003_kind_shinko_yamashiro.sql` creates `public_demo_snapshots` (`id`, unique `course_id` referencing `mata_kuliah.id`, `snapshot` jsonb, `updated_at`). Rows are validated on read by `publicDemoSnapshotSchema` in `lib/demo/snapshot.ts`; invalid rows are skipped.

Required JSON fields:
- `version`: `2`
- `contentPolicy`: `"free-first-chapter"`
- `courseId`, `revision`, `displayName`, `asOf`, `streakDays`
- `course`, `inProgressDocuments`, `flashcards`, `weakConcepts`, `availableAssessments`, `history`
- Optional `mockChapters` (fictional later-chapter metadata only)

Changing `revision` invalidates previous browser-local overlays cleanly without requiring manual browser storage cleanup.

## Guarded Seeding Procedure

1. Verify the exact target host and database read-only first (`DATABASE_URL`, `NEON_EXPECTED_HOST`, `NEON_EXPECTED_DATABASE`).
2. Run dry-run validation (defaults to read-only):
   ```bash
   bun --conditions=react-server --env-file=.env.prod scripts/seed-public-demo.ts
   ```
3. Confirm each of the four canonical course titles resolves uniquely and that all four V2 JSON payloads pass schema and boundary validation.
4. Apply the transactional upsert only after explicit authorization:
   ```bash
   bun --conditions=react-server --env-file=.env.prod scripts/seed-public-demo.ts --apply
   ```
5. Verify `/demo` serves all four courses with no private storage keys, answer keys, or real user data exposed.
