# Public demo snapshot seeding

**Status: OPEN / IN PROGRESS.** The approved content policy and the production migration and four-course seed remain in place. The owner rejected the first release's presentation and requires the actual student pages with fictional account data and authorized fictional product fallbacks. The student-page correction is in progress; its source, browser acceptance and release must be verified separately from the prior release evidence below. Production remains the authorized target at `www.zyxacademy.com`.

The four intended canonical course titles are **Matematika I**, **Fisika Dasar I**, **Kimia Dasar I**, and **Berpikir Komputasional**. On the authorized machine, first verify the exact environment and hostname read-only, then resolve each exact title against active canonical courses. Require exactly one result per title and four distinct IDs; stop on missing or ambiguous matches. Never guess IDs. A course identity does not authorize premium content.

## Content boundary

The current Free chapter resolver selects the first active chapter, ordered by order index and ID; the demo uses that same chapter scope. Resolve that chapter deterministically and enforce its exact canonical and legacy scope on every product and grading request. Missing or ambiguous scope fails closed. Reuse the existing product-specific publication, visibility and Free eligibility checks, applying that first-chapter scope:

- Article and Diktat: require the correct first-chapter relationship and published Free eligibility. Diktat is readable without download; do not issue download URLs.
- Flashcards: require the published Free-eligible set and its first-chapter relationship.
- Quiz: require the existing Free quiz predicate, including published status, free visibility, permitted category and explicit valid chapter scope confined to the first chapter. The source joins the Free template to a published canonical quiz assessment with the same ID and requires first-chapter coverage. Exactly one of `fixedQuestionIds` or `fixed_question_ids` must contain a nonempty unique fixed set; canonical assessment items must match that set exactly and refer to published questions in the same course and first chapter at their current versions. Dynamic or unmapped selections cannot expose real questions. Where no eligible quiz resolves, the demo uses its separately authored fictional questions; it never copies a paid or unmapped question into that fallback. This gate is implemented in source but remains unverified at runtime. Grade only authorized questions, with no answers in the initial response.
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

The first-chapter Free policy is approved; its implementation, product-specific access checks, migration status, exact target authorization and runtime verification are separate gates. After security and boundary tests pass, an authorized operator must perform the guarded read-only target and course identity checks above before any mutation. For each of the four courses, verify a published Free quiz template with permitted category and explicit first-chapter scope; its ID must match a published canonical quiz assessment for that course. Verify the assessment coverage is confined to the first chapter, exactly one fixed-question property is present, and its IDs match the canonical assessment items exactly, including each published question’s current version, course and chapter. The current lookup also requires the canonical course to have a legacy course ID. Stop if course or chapter identity is absent or ambiguous. Missing eligible products use the explicitly authorized authored fictional fallback. A fallback never authorizes a real product or changes its publication or visibility. Never mark a paid template Free or copy raw question answer keys as an implicit seed. Seed fictional progress and public identity only, never paid bodies, answer keys or storage URLs. No seed, publication, or runtime success is asserted here.

## Credential-free visual harness on the designated machine

The preparation script `scripts/visual/prepare-demo-harness.py` creates `artifacts/visual-quality/demo-harness` from git-enumerated source files and unignored additions, excludes hidden paths, sensitive file extensions and secret-named untracked additions, refuses source symlinks, and links installed dependencies. Reviewed tracked source files such as `lib/auth-secret.ts` are retained. It replaces the copied server resolver with `tests/visual/demo-harness/demo-data.ts` and constrains the copied Tailwind source scan to the harness directory. No fixture activation exists in production. The fixture supplies fictional data and production UI components. Its V2 snapshot and grading seam use the first-chapter policy, fictional course IDs and snapshot revision. It uses fictional test content and does not seed a database or approve real course content for public use. Run from a checkout with installed dependencies and no sensitive untracked files under source directories. Do not expose the harness server to a network.

On the designated machine, after the concurrent frontend work settles, the intended isolated startup is:

```sh
python3 scripts/visual/prepare-demo-harness.py
cd artifacts/visual-quality/demo-harness
env -i PATH="$PATH" HOME="$HOME" SKIP_ENV_VALIDATION=1 DATABASE_URL=postgresql://localhost:1/fixture BETTER_AUTH_SECRET=fixture-only-secret-not-used-for-auth NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000 bun run dev -- --hostname 127.0.0.1
```

From the original checkout in another terminal, run `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 bun run test:visual -- tests/visual/demo-experience.spec.ts`. Stop the server afterwards. The copied resolver provides four fictional course IDs, two products per collection, and four questions in pages of three and one. Fictional quiz tokens bind course, policy, snapshot revision and question page; no private answers appear in initial UI data. The command selects only the new spec; the older `demo-flow.spec.ts` is not part of this run. The spec checks both configured viewports for the populated demo routes, product selection, the final quiz page, article completion and reset, flashcard flip and grade, quiz error and result, corrupt and unavailable storage, English navigation, four-course selection and per-course overlay isolation. Cross-course, revision and cross-page token assertions expect rejection; the zero HTTP error gate applies to the ordinary browser flows. It captures mobile navigation closed and open at 380px. Screenshots are under `artifacts/visual-quality/results/`; the primary agent must inspect each and record the matrix. The selectors now match the shared navigation and grading controls. Current local acceptance is recorded below; production acceptance remains separate.

## Feature parity inventory

This source inventory records shared component reuse. Local fixture runtime and visual acceptance are recorded below; production and full student feature parity remain separate.

| Surface | Source status |
|---|---|
| Course catalogue | Demo dashboard imports the student `CourseCatalogClient` and uses `StudentExperienceProvider` for links. Local fixture acceptance passed; production acceptance is pending. |
| Dashboard course progress | Demo and student dashboards both import `StudentCourseProgressRow` and `StudentDashboardSection`. Local fixture acceptance passed; production acceptance is pending. |
| Sidebar and layout | Demo uses shared `ApplicationShell`, `SidebarShell`, `StudentNavigationItems` and `ApplicationPage`. This does not establish full student shell parity. |
| Article, flashcards, quiz | Demo adapters import `StructuredArticleReader`, `FlashcardClient`, and `QuizPlayer`; real product eligibility passed read-only preflight and fixture visuals passed; production serving remains unverified. |
| Diktat | Uses the shared `MaterialViewer` in read-only mode with downloads disabled; fixture behavior passed; production serving remains unverified. |
| Tryout | `/demo/tryout` uses shared `TryoutForm` with synthetic questions and local completion; real assessment parity is not established. |
| Zyra | Scripted messages reuse `TutorAssistantLabel` and `TutorStudentMessage`; live tutoring and paid feature parity are not established. |
| Other student features | Not established as ported; inventory and acceptance remain pending. |

## Production completion, 2026-11-05

The owner explicitly selected `www.zyxacademy.com` and authorized fictional fallbacks for missing eligible real products. The guarded read-only query verified `neondb` on `ep-quiet-math-azyey0mb-pooler.c-3.ap-southeast-1.aws.neon.tech`. Exact active titles resolved uniquely to `ma1101`, `fi1101`, `ki1101` and `wi1102`. These IDs were observed, not inferred from course codes.

Before migration, `public_demo_snapshots` was absent. First-chapter Article, Diktat and flashcard products exist for Matematika, Fisika and Kimia; Berpikir Komputasional uses fictional products. No eligible first-chapter Free quiz mapping resolved for the four courses, so quizzes use authored fictional questions. Existing real quizzes and their permissions are preserved.

`lib/demo/fictional-products.ts` contains the authored fallback bodies. The runtime selects them only when the corresponding eligible published collection is absent, or no eligible quiz resolves. Explicit foreign product IDs, invalid pages and ambiguous chapter aliases still fail closed. The quiz token binds the selected course, revision, question IDs and versions for both real and fictional questions. Initial payloads omit answers.

The guarded command defaults to read-only validation:

```sh
bun --conditions=react-server --env-file=/verified/production.env scripts/seed-public-demo.ts
```

After required validation and authorized migration, append `--apply` to upsert exactly four validated fictional baselines in one transaction. `DATABASE_URL`, `NEON_EXPECTED_HOST` and `NEON_EXPECTED_DATABASE` must identify the verified target with verified TLS. The snapshot revision is `demo-2026-11-05-v1`; replacing it invalidates the previous browser overlay without deleting browser storage.

Read-only production preflight passed for all four courses, including public Article metadata sanitization. Focused contracts and PostgreSQL fixture checks cover real product precedence, later-chapter exclusion, storage-key exclusion, paid quiz rejection in favor of authored fictional questions, and ambiguous legacy chapter denial. The sanitizer preserves versioned canonical IDs and mathematical inequalities. There are 48 passing focused contracts and four passing PostgreSQL resolver/API fixture tests. Twelve additional contracts pass after updating stale reader, quiz storage and table-count assertions.

### Local browser acceptance

The primary agent ran `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 node node_modules/@playwright/test/cli.js test --config=playwright.config.ts tests/visual/demo-experience.spec.ts`: 57 passed, one desktop-only mobile-navigation skip, exit 0. Targeted recaptures after hydration synchronization and UI fixes also exited 0. The credential-free harness was copied to `D:/ZYX/zyx-web/artifacts/public-demo-verification-75e7e017` so Turbopack could follow the installed dependency junction on the same drive. It bound only to loopback and was stopped after verification.

The primary agent directly inspected all 78 accepted screenshots at 380 by 844 and 1536 by 864. The exact file and viewport matrix is `artifacts/visual-quality/accepted-demo-matrix.json`; screenshots are under `artifacts/visual-quality/results/`. The accepted route/state matrix covers:

| Surface | Inspected states at both viewports |
|---|---|
| Dashboard, courses | Populated dashboard, catalogue, four-course selection, course switcher, per-course overlay isolation |
| Progress, history | Overview, concepts, daily, monthly, reviews, assessments |
| Article | Initial, collection open, selected product, completed, reset, reload, corrupt and unavailable storage |
| Diktat | Initial, collection open, selected product, read-only viewer |
| Flashcards | Initial, collection open, selected set, flipped, graded |
| Quiz | Initial, submission error, graded result, final one-question page and result |
| Tryout, Zyra | Initial, question types, confirmation, local completion/reload, scripted tutor |
| Navigation | English navigation, mobile navigation closed and open at 380px |

Ordinary browser flows passed HTTP, redirect, page error, console error and horizontal-overflow gates. Deliberate invalid-course and token tests assert rejection separately. The local fixes remove a server invocation of a client helper, keep the asynchronous Footer on the server, display completed article progress consistently, and remove the demo quiz's redirect toast. Typecheck and focused ESLint pass. The complete CI workflow passed on implementation commit `45fb51cc`, including both contract shards, typecheck, lint, audits and build. The harness establishes fixture behavior and visual acceptance, not production runtime acceptance or full student feature parity.

The guarded production migration applied only pending migration 0003 after confirming migrations 0000 through 0002 and no snapshot table. Read-back confirmed the new table was empty before seeding. The authorized seed then saved exactly four baselines in one transaction. A subsequent read-only query validated all four stored V2 rows and their matching course IDs at revision `demo-2026-11-05-v1`. The actual server resolver loaded all four courses, omitted private answer and storage fields, and issued valid scoped quiz tokens. No real product publication or visibility changed.

Production release acceptance additionally requires the deployed commit to match the merged PR and anonymous public route and grading checks to pass. Current deployment and public runtime evidence is maintained in [PR #294](https://github.com/soezyxstt/zyxacademy/pull/294). Local fixture screenshots do not establish production serving or full student feature parity.

## Student-page parity correction

**Status: OPEN / IN PROGRESS.** The demo now composes the same student shell, dashboard, catalogue, course overview, progress, document lists, quiz gateway, quiz review, profile and leaderboard renderers. Calendar, settings, notifications, study path, mastery, video, playground, tryout and Zyra controls reuse the student components. The separate demo menu, product toolbar, dashboard presentation and compact result card have been removed.

`StudentAccountBoundary` supplies the fictional identity without mounting the visitor's live session hook. Demo adapters replace account reads and transactions with snapshot data, local overlays or scripted responses. They avoid real enrollment, search, calendar, learning progress, tutoring, upload, profile, feedback and notification mutations. Profile validation is shared with the real form; fictional edits are stored in browser session storage. Logout resets the fictional account's course overlays and local assessment results. Interface language navigation stays on localized demo routes without changing a signed-in visitor's language preference.

The student lists consume scoped metadata pages of 500 entries and flashcard pages of 100 cards. A shared quiz player receives all redacted questions, but submission still grades each signed page of at most three through the existing stateless endpoint. Aggregation checks course, revision, policy, cursor, counts and duplicate IDs, and fails closed on inconsistent pages. Metadata and flashcard queues stop at 10000 entries; quiz aggregation stops at 1000 questions. Larger collections require a student-list cursor before raising those limits.

Article completion follows the student return-to-documents flow. Diktat uses the learner viewer with downloads disabled, local completion and a scripted chapter summary. Source figures, coding locators, paid objects and generic PDFs remain unavailable under the existing sanitizer and access policy. Inline formative evaluation and answer reveal require an account; the demo renders their student controls without calling the private grading service. Zyra replies are scripted, attachment uploads require an account, and playground execution stays in the existing browser runtime. These presentation adapters do not grant content access or spend provider quota.

Focused tests cover shared page renderers, fictional identity isolation, navigation, academic profile validation, complete quiz page aggregation and product collection boundaries. PostgreSQL fixture tests continue to cover published Free product precedence, later-chapter and storage exclusion, initial answer redaction, signed grading scope and ambiguous chapter denial. Desktop and mobile route and interaction acceptance is being rerun against the credential-free harness. The previous 78-screenshot matrix describes the superseded demo UI and does not establish acceptance of this correction.

Shared presentation views remain server-renderable for authenticated students. Demo clients supply only fictional account data. The bare demo locale resolver uses browser preferences without reading the visitor account. Quiz grading returns correct choices only after signed page authorization and valid answer submission, so the shared student review can render its normal post-submission state. Initial payloads remain redacted. New local attempts and fictional baseline results feed the same quiz history, gateway and result list.
