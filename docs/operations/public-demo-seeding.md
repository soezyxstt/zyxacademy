# Public demo snapshot seeding

**Status: OPEN / IN PROGRESS.** The approved policy is real Free-eligible products from the first chapter only, with fictional progress and fictional later-chapter data. The V2 snapshot and first-chapter resolver are present in source; the Free quiz eligibility and mapping gate is implemented in source, but security and runtime verification remain pending. Do not seed or publish until the implementation and exact target are verified and authorized.

The four intended canonical course titles are **Matematika I**, **Fisika Dasar I**, **Kimia Dasar I**, and **Berpikir Komputasional**. On the authorized machine, first verify the exact environment and hostname read-only, then resolve each exact title against active canonical courses. Require exactly one result per title and four distinct IDs; stop on missing or ambiguous matches. Never guess IDs. A course identity does not authorize premium content.

## Content boundary

The current Free chapter resolver selects the first active chapter, ordered by order index and ID; the demo uses that same chapter scope. Resolve that chapter deterministically and enforce its exact canonical and legacy scope on every product and grading request. Missing or ambiguous scope fails closed. Reuse the existing product-specific publication, visibility and Free eligibility checks, applying that first-chapter scope:

- Article and Diktat: require the correct first-chapter relationship and published Free eligibility. Diktat is readable without download; do not issue download URLs.
- Flashcards: require the published Free-eligible set and its first-chapter relationship.
- Quiz: require the existing Free quiz predicate, including published status, free visibility, permitted category and explicit valid chapter scope confined to the first chapter. The source joins the Free template to a published canonical quiz assessment with the same ID and requires first-chapter coverage. Exactly one of `fixedQuestionIds` or `fixed_question_ids` must contain a nonempty unique fixed set; canonical assessment items must match that set exactly and refer to published questions in the same course and first chapter at their current versions. Dynamic or unmapped selections fail closed. This gate is implemented in source but remains unverified at runtime. Grade only authorized questions, with no answers in the initial response.
- Generic uploaded PDFs are excluded by the existing Free material filter. A PDF may be exposed only if an existing explicit Free eligibility path covers that exact file and first-chapter scope; otherwise it remains unavailable pending a separately authorized policy. Never expose paid storage objects or downloads.
- Later chapters, their learning bodies and answer keys must not be loaded as real content. Their visible data and months-long learning history are fictional. Do not include real accounts or user IDs.

The snapshot allowlist, publication and seeding must not bypass any of these checks. The current source enumerates scoped product collections with 500-item metadata pages, 100-card pages and quiz pages of up to three questions. It validates selections against the selected course and first chapter. Full collection and boundary verification remain pending. The sanitizer removes unsafe link and asset destinations, withholds source-figure assets, replaces coding parts with placeholders, and retains only validated inert inline visuals. No public asset proxy, broad PDF grant or Diktat download is provided. Tests must cover product and chapter boundaries, sanitized output, denied downloads and generic PDFs, and grading scope. Implementation and runtime evidence remain pending.

## Table and validation

Migration `drizzle-postgres/0003_kind_shinko_yamashiro.sql` creates `public_demo_snapshots`: `id` text primary key; `course_id` text not null, unique, referencing `mata_kuliah.id` with delete cascade; `snapshot` jsonb not null; and `updated_at` timestamptz not null default now. The repository validates each selected row with `publicDemoSnapshotSchema` in `lib/demo/snapshot.ts`, and requires JSON `courseId` to match the row. Invalid rows are skipped; a repository error returns an empty list.

The JSON contract requires `version: 2`, `contentPolicy: "free-first-chapter"`, canonical `courseId`, `revision`, `displayName`, `asOf`, `streakDays`, `course`, `inProgressDocuments`, `flashcards`, `weakConcepts`, `availableAssessments`, and `history`. Optional `mockChapters` contains only fictional `id`, `title`, `orderIndex`, and `completionPercent`. The validator rejects V1, unknown fields, invalid calendar dates, duplicate IDs within each list, history after `asOf`, and completed materials above total. IDs are nonempty trimmed strings up to 128 characters, labels up to 200, counts are integers from 0 to 100000 and percentages range from 0 to 100. Arrays are limited to 100 items, except history (366); review grades are 1 to 4 and assessment types are `quiz` or `tryout`. The JSONB shape change alone requires no new schema migration. Validate each payload before any later authorized seed.

This fictional example illustrates the complete required shape. The placeholder ID is not a production ID:

```json
{
  "version": 2,
  "contentPolicy": "free-first-chapter",
  "courseId": "fictional-course",
  "revision": "fictional-v1",
  "displayName": "Pelajar Demo",
  "asOf": "2026-06-30",
  "streakDays": 3,
  "mockChapters": [{ "id": "fictional-later", "title": "Bab berikutnya", "orderIndex": 2, "completionPercent": 25 }],
  "course": { "completedMaterials": 3, "totalMaterials": 8, "nextConcept": "Konsep berikutnya" },
  "inProgressDocuments": [{ "id": "fictional-doc", "title": "Konsep dasar", "completionPercent": 60 }],
  "flashcards": { "dueCount": 3, "recentReviews": [{ "id": "fictional-review", "front": "Apa itu konsep?", "grade": 3, "reviewedOn": "2026-06-30" }] },
  "weakConcepts": [{ "id": "fictional-concept", "title": "Penerapan konsep", "masteryPercent": 45 }],
  "availableAssessments": [{ "id": "fictional-quiz", "title": "Latihan konsep", "type": "quiz" }],
  "history": [
    { "date": "2026-02-12", "materialsCompleted": 1, "flashcardsReviewed": 2, "quizzesCompleted": 0 },
    { "date": "2026-03-10", "materialsCompleted": 1, "flashcardsReviewed": 2, "quizzesCompleted": 1 },
    { "date": "2026-04-16", "materialsCompleted": 1, "flashcardsReviewed": 2, "quizzesCompleted": 0 },
    { "date": "2026-05-20", "materialsCompleted": 0, "flashcardsReviewed": 2, "quizzesCompleted": 1 },
    { "date": "2026-06-28", "materialsCompleted": 0, "flashcardsReviewed": 2, "quizzesCompleted": 0 },
    { "date": "2026-06-29", "materialsCompleted": 0, "flashcardsReviewed": 2, "quizzesCompleted": 0 },
    { "date": "2026-06-30", "materialsCompleted": 0, "flashcardsReviewed": 1, "quizzesCompleted": 0 }
  ]
}
```

Changing `revision` changes the browser overlay key, so the previous local overlay is no longer applied. Use a new revision when replacing the baseline. The old browser storage entry is not necessarily deleted.

## Deferred handoff

The first-chapter Free policy is approved; its implementation, product-specific access checks, migration status, exact target authorization and runtime verification are separate gates. After security and boundary tests pass, an authorized operator must perform the guarded read-only target and course identity checks above before any mutation. For each of the four courses, verify a published Free quiz template with permitted category and explicit first-chapter scope; its ID must match a published canonical quiz assessment for that course. Verify the assessment coverage is confined to the first chapter, exactly one fixed-question property is present, and its IDs match the canonical assessment items exactly, including each published question’s current version, course and chapter. The current lookup also requires the canonical course to have a legacy course ID. Stop if any mapping or eligibility is absent or ambiguous. Never mark a paid template Free or copy raw question answer keys as an implicit seed. Seed fictional progress and public identity only, never paid bodies, answer keys or storage URLs. No seed, publication, or runtime success is asserted here.

## Credential-free visual harness on the designated machine

The unexecuted preparation script `scripts/visual/prepare-demo-harness.py` creates `artifacts/visual-quality/demo-harness` from git-enumerated source files and unignored additions, excludes hidden paths, sensitive file extensions and secret-named untracked additions, refuses source symlinks, and links installed dependencies. Reviewed tracked source files such as `lib/auth-secret.ts` are retained. It replaces only the copied server resolver with `tests/visual/demo-harness/demo-data.ts`. No fixture activation exists in production. The fixture supplies fictional data and production UI components. Its V2 snapshot and grading seam use the first-chapter policy, fictional course IDs and snapshot revision. It uses fictional test content and does not seed a database or approve real course content for public use. Run from a checkout with installed dependencies and no sensitive untracked files under source directories. Do not expose the harness server to a network.

On the designated machine, after the concurrent frontend work settles, the intended isolated startup is:

```sh
python3 scripts/visual/prepare-demo-harness.py
cd artifacts/visual-quality/demo-harness
env -i PATH="$PATH" HOME="$HOME" SKIP_ENV_VALIDATION=1 DATABASE_URL=postgresql://localhost:1/fixture BETTER_AUTH_SECRET=fixture-only-secret-not-used-for-auth NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000 bun run dev -- --hostname 127.0.0.1
```

From the original checkout in another terminal, run `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 bun run test:visual -- tests/visual/demo-experience.spec.ts`. Stop the server afterwards. The copied resolver provides four fictional course IDs, two products per collection, and four questions in pages of three and one. Fictional quiz tokens bind course, policy, snapshot revision and question page; no private answers appear in initial UI data. The command selects only the new spec; the older `demo-flow.spec.ts` is not part of this run. The spec checks both configured viewports for the populated demo routes, product selection, the final quiz page, article completion and reset, flashcard flip and grade, quiz error and result, corrupt and unavailable storage, English navigation, four-course selection and per-course overlay isolation. Cross-course, revision and cross-page token assertions expect rejection; the zero HTTP error gate applies to the ordinary browser flows. It captures mobile navigation closed and open at 380px. Screenshots are under `artifacts/visual-quality/results/`; the primary agent must inspect each and record the matrix. Final frontend changes may require selector updates, especially the mobile navigation toggle and grade labels. No test or runtime result is claimed here.

## Feature parity inventory

This inventory is limited to source inspected while the frontend implementation is in progress. It is not runtime or visual verification. Recheck imports after the frontend worker finishes.

| Surface | Source status |
|---|---|
| Course catalogue | Demo dashboard imports the student `CourseCatalogClient` and uses `StudentExperienceProvider` for links. Runtime and visual verification are pending. |
| Dashboard course progress | Demo and student dashboards both import `StudentCourseProgressRow` and `StudentDashboardSection`. Runtime and visual verification are pending. |
| Sidebar and layout | Demo uses shared `ApplicationShell`, `SidebarShell`, `StudentNavigationItems` and `ApplicationPage`. This does not establish full student shell parity. |
| Article, flashcards, quiz | Demo adapters import `StructuredArticleReader`, `FlashcardClient`, and `QuizPlayer`; production product eligibility and visual behavior remain unverified. |
| Diktat | Uses the shared `MaterialViewer` in read-only mode with downloads disabled; eligibility and runtime behavior remain unverified. |
| Tryout | `/demo/tryout` uses shared `TryoutForm` with synthetic questions and local completion; real assessment parity is not established. |
| Zyra | Scripted messages reuse `TutorAssistantLabel` and `TutorStudentMessage`; live tutoring and paid feature parity are not established. |
| Other student features | Not established as ported; inventory and acceptance remain pending. |
