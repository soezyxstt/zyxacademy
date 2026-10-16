# Zyx Academy ; Features & Workflows

## What It Is

Zyx Academy is an AI-powered learning management platform. It takes expert teaching documents, breaks them into atomic concepts, and uses that structure to power personalized learning paths, adaptive flashcards, quizzes, PDF study guides, and one-on-one tutoring.

## User Roles

Canonical access-role codes are `admin`, `tutor`, and `murid`. Admin and tutor layout gates use domain memberships as the canonical authorization source. Better Auth keeps the legacy `user.role` projection for compatibility without changing chat speaker values such as `student`.

### Student
- Redeems enrollment tokens to access courses
- Views personalized dashboard with progress, weak concepts, daily recommendations
- When no class is active, can compare a compact Minimal, Essential, and Premium plan preview while retaining enrollment-code activation
- Reads interactive course materials (markdown, PDFs, images, embedded video)
- Takes daily/weekly quizzes and timed tryouts
- Views the AI-powered Quiz Learning Analytics & Diagnosis summary page after quiz completion (3-layer executive summary, deterministic concept mastery, AI error pattern detection, cognitive skill breakdown, time/speed insights, and personalized 3-step action plan)
- Reviews flashcards with SM-2 spaced repetition
- Chats with AI tutor for concept help
- Article text selection shows a fixed bottom Tanya Zyra action below 768px and keeps the selection popover on desktop. Mobile selection changes update the saved quote, which is attached when Zyra opens.
- Books real tutor sessions
- Participates in live classroom quizzes
- Views leaderboard and answer keys

### Tutor
- Accesses a dedicated tutor portal (`/tutor`) with a course switcher for all assigned teaching responsibilities
- Manages availability and sessions in a calendar-first workspace (`/tutor/schedule`) with week, day, and month views. Available, booked, expired, and locked slots have distinct states.
- Creates, edits, previews, and publishes native quiz templates (`/tutor/[courseId]/quizzes`) with visible creator attribution
- Hosts interactive live classroom quizzes directly from the tutor console (`/tutor/[courseId]/live`)
- Grades assigned tryout essay submissions (`/tutor/[courseId]/grading`), provides feedback notes, and inputs final scores (0 to 100) with concurrency guards
- Grades quiz essays and may override deterministic short-answer scores (`/tutor/[courseId]/quizzes/grading`). Final quiz totals remain hidden from students until every essay has been reviewed.
- Inspects student attempt spreadsheets and exports CSV records (`/tutor/[courseId]/quizzes/[templateId]/attempts`)
- Reviews enrolled students, active study groups, and group representatives (`/tutor/[courseId]/participants`)
- Cannot author or upload course materials (materials authoring is disabled for tutors; `/tutor/[courseId]/materials` redirects to the course overview)
- Cannot author simulations or tryouts (tryout authoring is disabled for tutors; `/tutor/[courseId]/tryouts` redirects to the course overview)

### Admin
- Generates enrollment tokens with capacity and expiry
- Manages file drive (Google Drive-style folder tree)
- Uploads Master Teaching Documents (MTDs)
- Runs AI extraction pipeline to decompose documents into Knowledge Objects
- Curates global question bank (5-state moderation grid)
- Monitors background sync queues and usage budgets
- Imports learning/assessment bundles (split JSON pipeline)
- Manages PKA tutorial campaign (stages, schedules, announcements)
- Manages career path templates
- Monitors content quality flags (auto-detected issues)
- Views coaching analytics dashboards
- Accesses course-scoped Quiz & Exam Analytics & Insight portals (`/admin/courses/[slug]/analytics`) for real-time item and distractor analysis, student attempt spreadsheets, item-response answer matrices, export to CSV, and on-demand Gemini AI deep pedagogical insights
- Creates and publishes course-scoped tryouts at `/admin/courses/[slug]/tryouts` from published question bank items; essay questions can accept typed responses and PDF or image attachments
- Accesses Tutor Quiz Attempt Spreadsheet portal (`/tutor/[courseId]/quizzes/[templateId]/attempts`) for detailed student answer inspection and CSV exports
- Monitors real-time tutor mutations, rejections, and failures with cursor pagination, stats aggregation, and sanitized snapshot inspection (`/admin/ops/tutor-activity`)
- Monitors real-time statuses for the approved optional feature flags (`/admin/ops/flags`) with status badges, category filters, and env key helpers
- Manages course-scoped leaderboard (`/admin/courses/[slug]/leaderboard`) for per-student ranking within a single course, with backward compatibility redirects from `/admin/leaderboard`
- Operates inside unified course workspaces (`/admin/courses/[slug]`) with contextual navigation across Bab, Dokumen, Kuis, Soal, Flashcard, Hasil, Papan Peringkat, Analitik, Review Materi, and Pengaturan

## Plan pricing

- `/plans`, the landing preview, student dashboard preview, and student onboarding use the same scheduled pricing quote and display components.
- From 12 September 2026 at 00:00 WIB until 1 November 2026 at 00:00 WIB (exclusive), paid plans use the existing formula result `x` as the introductory price. The regular price is `ceil(x / 0.6)` in whole Rupiah, a 40% introductory saving subject to sub-Rupiah rounding.
- From 1 November 2026, the calculator actually returns the regular price. Before the campaign starts, the previous price `x` applies without a promotion. Free and Custom plans do not receive a discount badge.
- Paid pricing uses a compact struck-through regular amount above the current amount, with a rectangular `40% off` badge on the right. Both amounts use the same unit (per person or group total). The promotion deadline and the future regular price effective date appear once per pricing section. Group totals are authoritative; per-person amounts are rounded estimates. Cards are ordered Minimal, Essential, Premium, Free, Custom.
- Client pricing refreshes on a one-second tick and when a tab regains focus or visibility. Server HTML shows a neutral loading state so cached pages do not retain an expired offer. Static plan metadata contains no monetary snapshots.
- Payment remains outside the website through the admin. WhatsApp enrollment text includes the current semester total and, during the campaign, the introductory deadline and future regular price. Clicking the link refreshes the quote. Admin must confirm the applicable price at payment time; the website does not collect or enforce an external payment.
- The public landing pricing preview uses the same quote source, labels the main amount per person per semester, and shows the configured group total as secondary context. Paid preview cards expose a plan-specific WhatsApp consultation link only when `NEXT_PUBLIC_WHATSAPP_NUMBER` is configured; no fallback number is generated.
- Admin `/admin/pricing` provides a read-only Custom estimate using the shared platform and tutorial components. Meetings must be positive multiples of five, while course and group-member counts are configurable. The page shows the regular and discounted group totals, the corresponding per-person estimates, a simulated 40% introductory discount, and the discount amount without persisting a quote.
- The public landing page separates platform benefits, tutor evidence, and package questions. Its FAQ describes only the published Free, Minimal, Essential, Premium, payment, and activation behavior.

## Public demo and Free access

- `/demo` is a public, read-only introduction. It requires exactly one active course selected by an admin, an unambiguous canonical and legacy mapping, and resolves only published content from the first active Bab, in deterministic order.
- The demo dashboard links to the full structured Article, a two-section Diktat preview with no download, five Flashcards, a stateless three-question Kuis, and a scripted Zyra conversation. Demo interactions stay in memory, never create progress or quiz attempts, and never call an AI provider.
- If zero or more than one course is selected, its canonical and legacy mapping is ambiguous, or its published content becomes incomplete, `/demo` shows a recovery state and does not fall back to draft or legacy content. Sign-in links use a safe `next` callback to return to the real selected course path, `/courses/{id}`.
- The Free package provides Bab 1 and Bab 2 in every mata kuliah, including the related Article, Diktat, Kuis, and Flashcard content. Diktat is readable without download. Zyra allows 5 questions per day, and authenticated learning progress is stored.
- Admins select the public course from course settings. Selection is allowed only when the course is active, its canonical and legacy mapping is unambiguous, and it has a complete published Article, two-section Diktat, at least five published Flashcards, and at least three published Kuis questions. The selection is transactional and singleton-scoped.

## Core Pipelines

### Site-wide command search

- `Ctrl+K` or `Cmd+K` opens the site-wide command search. Results combine the local index with authenticated API matches, then apply deterministic lexical ranking so exact titles, complete token matches, and matching numbers appear before semantic neighbors.
- Navigation results show their Admin, Tutor, Murid, or Publik surface so identical sidebar labels remain distinguishable.
- Typing `?` opens the search guide. It documents and applies the `group:`, `meet:`, `user:`, `form:`, `token:`, and `schedule:` prefixes, and shows every accepted alias for each prefix.
- Changing the query resets the result list to the top. Selecting a result triggers the global route progress bar before navigation.

### MTD → Knowledge Objects (KO)
1. Admin uploads a markdown master document
2. Preprocessed and normalized with deterministic semantic chunking preserving headings, formulas, and tables without 30k char truncation
3. Gemini extracts candidates per chunk with source spans, exact excerpt hashes, and learning objectives (with Bloom Taxonomy)
4. Cross-chunk reconciliation deduplicates concepts while preserving all supporting source spans
5. Canonical concept resolution checks exact names, aliases, and flags high embedding similarity without exact match as `ambiguous`
6. Run validated and assigned state (`staged`, `accepted`, `needs_review`, `failed`)
7. Accepted runs persisted atomically using stable identity keys (`stableKey`) without destructive deletion

### Canonical Source and Idea Domain
1. Versioned source metadata is stored in `sumber_materi` with a checksum and canonical URI or R2 key.
2. Exact source spans are stored in `potongan_sumber` with offsets, checksums, and embedding eligibility.
3. `ide` provides the future course and chapter learning atom with optional global `concepts` linkage, semantic hashes, and explicit source policy.
4. `asal_ide`, `relasi_ide`, and `ketergantungan_produk` preserve provenance, typed relations, and freshness transitions.
5. Canonical Idea callers are always-on; existing KOs remain readable through compatibility mappings.

### Product, Assessment, and Idea Mastery Domain
1. Articles, diktat materials, questions, solutions, and flashcards have normalized versioned target records with source and generation hashes.
2. Published products require at least one published Idea; question links support multiple Ideas with positive weights whose sum is checked within `0.000001`. Product Bundle V2 question products are ITB examples with a required source event and allowed reference. Product Bundle V3 writes learning products only, and multi-Idea assessment questions use their separate assessment workflow.
3. Assessment definitions separate blueprint, assessment, chapter scope, ordered items, attempts, and answers. Quiz scope is exactly one chapter; tryout scope is one or more chapters.
4. Attempt and answer records carry rendered question, option order, response, grading policy, and content version snapshots so later content changes do not alter historical context.
5. Answer evidence records Idea attribution, contribution, weight, confidence, evidence source, rubric version, and derivation status. Ambiguous evidence is retained but cannot affect mastery.
6. `pemahaman_ide` stores score and confidence as separate 0 to 100 values, with append-only change history, replay metadata, and deterministic flashcard recommendations. Cards for Ideas with mastery score 80 or higher are suppressed. Only attributable verified evidence contributes to the score; a legacy concept baseline is explicitly labelled and never copied to an Idea.
7. Bundle imports, entity inventories, reviews, atomic publication records, and mutation audits are normalized for later workflow plans.
8. Product, assessment, and per-Idea learning callers are always-on; current legacy records remain unchanged and readable for compatibility.

### Admin Course Workspace Hierarchy & Contextual Navigation

1. Admin course management is organized as a nested hierarchy under `/admin/courses/[slug]`, replacing former tab-based client state with direct, addressable routes.
2. The contextual sidebar automatically switches when navigating inside `/admin/courses/[slug]`, rendering course-scoped destinations in this order:
   - Bab (`/admin/courses/[slug]`): chapter management, reordering, and canonical projection.
   - Dokumen (`/admin/courses/[slug]/documents`): unified document catalog with responsive search, upload dialog, and full document management workspace for previews, PDF metadata, and article or diktat lifecycle.
   - Video (`/admin/courses/[slug]/videos`): course video playlists and lesson links.
   - Kuis (`/admin/courses/[slug]/quizzes`): course quizzes list with inline metrics and nested quiz authoring routes.
   - Tryout (`/admin/courses/[slug]/tryouts`): course-scoped tryout authoring, question bank import, and publication to the student Tryout page.
   - Soal (`/admin/courses/[slug]/questions`): course-filtered question bank.
   - Flashcard (`/admin/courses/[slug]/flashcards`): course-locked flashcard set and card CRUD management.
   - Hasil (`/admin/courses/[slug]/results`): student attempt metrics and completion rates.
   - Papan Peringkat (`/admin/courses/[slug]/leaderboard`): course-locked leaderboard ranking with hidden overview selector.
   - Analitik (`/admin/courses/[slug]/analytics`): course-locked quiz analytics and AI diagnostic insights.
   - Review Materi (`/admin/courses/[slug]/review`): course-locked staging review for Idea and Product bundles.
   - Pengaturan (`/admin/courses/[slug]/settings`): course metadata, category, and archiving controls.
3. Mobile navbar displays matching Indonesian route titles dynamically without falling back to generic panel titles.
4. Legacy course IDs and canonical slugs both resolve transparently through server-side `resolveCourseIdentity`.

### Unified Reader Modes (Learner vs Admin Preview)

1. The reading experience across `MaterialViewer` and `StructuredArticleReader` supports two explicit modes: `learner` and `admin-preview`.
2. In `admin-preview` mode:
   - All learner-specific mutations are strictly gated: reading progress is never written, completion checkmarks are suppressed, and learner feedback modals are omitted.
   - Zyra tutor integration and interactive Socratic sidecars are disabled.
   - The preview bar displays authoritative source provenance: `canonical-article`, `canonical-diktat`, `legacy-article`, `legacy-diktat`, or `legacy-pdf`.
   - Navigation links safely return to the course documents list (`/admin/courses/[slug]/documents`).
3. In `learner` mode:
   - Interactive progress tracking, section completion checkmarks, and contextual Zyra assistance are fully active.
   - Document listing uses minimal file tiles with thumbnail previews rather than heavy embedded iframes.

### Compatibility Redirects & Contextual Sidebar Isolation

1. Old global course-related routes are converted into server-side compatibility redirects, preventing duplicate global course workspaces:
   - `/admin/quizzes`: with `courseId`, resolves canonical or legacy identity and redirects to `/admin/courses/[slug]/quizzes`; without it redirects to `/admin/courses`.
   - `/admin/quizzes/new`: validates the owning course server-side and redirects to `/admin/courses/[slug]/quizzes/new`; redirects to `/admin/courses` if unverified.
   - `/admin/quizzes/[id]/edit`: resolves the owning course from database template records (`resolveQuizCourseIdentity`) and redirects to `/admin/courses/[slug]/quizzes/[id]/edit`; unverified or missing records trigger `notFound()`.
   - `/admin/leaderboard`: with `courseId`, redirects to `/admin/courses/[slug]/leaderboard`; otherwise redirects to `/admin/courses`.
   - `/admin/quiz-insights`: with `courseId`, redirects to `/admin/courses/[slug]/analytics`; otherwise redirects to `/admin/courses`.
   - `/admin/quiz-insights/[id]`: resolves quiz ownership server-side and redirects to `/admin/courses/[slug]/analytics/[quizId]`.
   - `/admin/materials/review`: with `courseId`, redirects to `/admin/courses/[slug]/review`; otherwise redirects to `/admin/courses`.
   - `/admin/materials/review/idea/[slug]`: resolves bundle ownership server-side (`resolveBundleCourseIdentity`) and redirects to `/admin/courses/[slug]/review/idea/[bundleId]`.
   - `/admin/materials/review/product/[slug]`: resolves bundle ownership server-side (`resolveBundleCourseIdentity`) and redirects to `/admin/courses/[slug]/review/product/[bundleId]`.
2. Browser Upload Manual retirement:
   - `/admin/materials/manual` redirects permanently to `/admin/courses`.
   - Retired browser-only manual authoring APIs return HTTP 410 Gone.
3. Sidebar isolation guarantee: no old route can render an active global course workspace or reset the contextual sidebar back to global while viewing a course-owned resource.

### Idea Bundle Workflow

1. Admins open `/admin/courses/[slug]/review`, choose `Source Pack + Idea`, and use the compact `Upload ZIP` action (or access via `/admin/materials/review?courseId=...` compatibility redirect). The dialog first analyzes the strict ZIP without persistence, then stages the validated artifact after confirmation. Validation rejects unsafe archive entries, unknown manifest fields, checksum drift, missing source spans, non-publishable Ideas or sources, inconsistent creator attribution, duplicate stable keys, unresolved conflicts, and prerequisite cycles.
2. The review page is a searchable, filterable inventory by course, author, and status. Artifact cards lead with course, creation time, author, and content summary; bundle IDs and checksums remain secondary technical details. `Buka review` navigates to `/admin/courses/[slug]/review/idea/[bundleId]`. The compact detail workspace uses the left Idea list as its selector, marks per-Idea review status through card color, advances to the next pending Idea without a page reload, shows readable full-width source evidence and named relations, and exposes editing, review, publication, staging deletion, and published withdrawal actions.
3. The detail page reads the staged ZIP from R2 and reconstructs the validated preview before showing it. Stable identities and source spans stay locked. Identical upload retries are no-ops and a different checksum for the same bundle ID is blocked.
4. Only an admin can publish an approved bundle. Source materials, chunks, Ideas, provenance, relations, publication state, audits, and deterministic vector outbox jobs are written atomically. An admin may later withdraw a published Idea Bundle, which marks its canonical sources, Ideas, relations, and learning sections as withdrawn and queues deterministic vector deletions while preserving publication history and audit evidence.
5. The workflow is always-on. The legacy Learning Bundle and Assessment Bundle importers are retired and reject new writes.

### Authoring Context Pack and Manual Browser Retirement

1. Browser-based manual authoring pages (`/admin/materials/manual`) are completely retired and redirect to `/admin/courses`.
2. In-memory validation, job packaging, and authoring context extraction are preserved for external agent authoring via Authoring Context Pack V1 and the provider-neutral Authoring MCP server.
3. After official Idea publication, the Context Pack export creates a deterministic bundle rooted in the selected course without exposing raw technical IDs or credentials.
4. The allowlist includes only published current reviewed Ideas, active source excerpts, provenance, relations, objectives, safe requirements, and allowed benchmark summaries.
5. Holdout content, murid data, credentials, signed URLs, embeddings, and unpublished or stale content are excluded.
6. The private artifact is stored under a run-specific staging R2 prefix and every export is recorded in `audit_mutasi` with checksum and retention metadata.
7. External agents use `$UPLOADER` and `$APPROVING_REVIEWER` for attribution without receiving private Zyx identity IDs.
8. The provider-neutral Authoring MCP server at `/api/mcp/authoring` remains the authoritative pipeline for authoring and staging Source, Idea, and Product bundles.

### Provider-neutral Authoring MCP V1

1. `/api/mcp/authoring` exposes a provider-neutral Streamable HTTP MCP endpoint. Its core does not depend on Gemini, Claude, or ChatGPT; each host discovers the same typed tools.
2. `workflow.list` exposes three choices: `idea_product`, `quiz_bank`, and `reference_question_ingest`. There is deliberately no combined workflow option. The first two workflows lock one course and one chapter; the historical reference workflow locks only one course, rejects chapter and Source Pack inputs, and reads stored question and solution PDFs directly.
3. `source.list_files` resolves the selected canonical course and chapter to their legacy `course_materials` mappings, then returns every eligible PDF category with an encrypted short-lived `fileKey`. Multi-chapter PDFs are included when the selected chapter is present in `chapterIds`; external URLs, unsafe keys, unmapped scopes, and files from another course are rejected.
4. `source.read_file` reads one current `fileKey`. Page mode returns extracted text plus PNG page images at 1280 px, up to four pages per call, so scanned pages and instructional visuals remain available to the agent. Blob mode embeds an `application/pdf` resource up to 32 MiB and is an explicit fallback after a page-read failure or timeout.
5. `source.ingest` accepts a base64 Source Pack plus either ephemeral `originals`, server-resolved `storedOriginals`, or a unique mix of both. Stored PDFs may be up to 50 MiB and all originals together may be up to 96 MiB. The same checksum, content, and ZIP quality gates apply; stored references additionally bind the Source Pack token to their course and chapter. Valid Source Packs are persisted automatically to Cloudflare R2 and recorded in `impor_bundle` with status `validated`, returning `persisted` metadata including `sourcePackId`, `storageKey`, and `checksumSha256`. Previously persisted packs can be discovered with `source.list_packs` and inspected or read with `source.get_pack`.
6. Course and chapter choices use short-lived signed keys, and stored file references use encrypted short-lived keys, so agents and operators do not exchange raw internal IDs or storage keys. `workflow.start` accepts either an active `sourcePackToken` or a stored `sourcePackId`, automatically binding the pack and issuing a valid token. It rejects a stored-source scope mismatch and returns a scoped run token and workflow contract.
   Admin course and chapter CRUD keeps these choices current by mirroring every exact legacy mutation to `mata_kuliah` and `bab` in the same database transaction. MCP catalog calls query those canonical rows at request time without an application cache.
7. Idea Bundle and Product Bundle validation combines technical compatibility with repository content-quality gates. Idea checks include meaningful source coverage, provenance coverage, duplicate candidates, and formula trace warnings. Product checks include published Idea scope, dependency freshness, Article depth, Diktat coverage, examples, visuals, retrieval, traps, formulas, and ITB provenance.
8. For `quiz_bank`, `assessment.list_ideas` returns the published Idea catalog of the locked course and chapter with free-text query, knowledge kind, instructional role, and difficulty level filters plus distribution facets and offset paging. `assessment.get_idea` returns one Idea with active relations in both directions and a provenance summary so agents can respect prerequisites before linking. The workflow contract exposes scope guidance enumerating difficulty, cognitive level, question type, idea role, tag rules, and weight rules. For `reference_question_ingest`, `knowledge.search_course_ideas` searches the published Idea catalog across all chapters of the locked course, while `knowledge.get_idea` returns one published Idea with attribution context.
9. Draft V2 accepts optional Idea links per question; linked weights must sum to 100%. `assessment.validate_quiz_draft` aggregates every blocking issue and warning in one response instead of failing on the first error. It reports difficulty, cognitive level, question type, and tag distributions plus per-Idea coverage so agents can close gaps before submission. Historical authoring uses `reference-question-draft.v1`, requires source and solution provenance, at least one published same-course Idea link, and direct source attribution. Historical questions may be staged for review but are immutable and never published by MCP. Valid quiz submission writes only Zyx-original `soal`, optional `soal_ide`, `pembahasan_soal`, the `ai_question_bank` compatibility projection, and an audit row in one transaction with `reviewStatus=generated`. The staging actor is derived from the authenticated admin principal and no MCP tool can publish content.
10. The MCP lifecycle tools support inspection, maintenance, and review across bundles and questions:
   - `authoring.list_imports` and `authoring.get_import` inspect staged Source, Idea, and Product bundles, entity inventories, and review outcomes without exposing private storage keys or internal reviewer identity IDs (`authoring:read`).
   - `authoring.restage_idea_bundle` and `authoring.restage_product_bundle` revalidate and replace staged bundles in place, resetting prior review decisions via existing lifecycle services (`authoring:stage`).
   - `authoring.discard_product_draft` permanently discards draft Product Bundles and their staging artifacts (`authoring:withdraw`). Published or withdrawn bundles cannot be discarded.
   - `authoring.review_idea_bundle` and `authoring.review_product_bundle` record immutable review decisions (`approved` or `rejected`) with notes without publishing content (`authoring:review`).
   - `authoring.withdraw_product_bundle` provides an audited, idempotent, destructive action that withdraws published Product Bundles and retires canonical projections (`authoring:withdraw`). Idea Bundle withdrawal is available only through the authenticated admin review UI and is not exposed as an MCP tool.
   - `assessment.update_question` updates draft Zyx-original questions in the locked run scope and resets them to `reviewStatus=generated` for admin review (`authoring:stage`). ITB examples and historical references are immutable and cannot be updated. Published or retired questions cannot be edited through this tool.
11. The instruction skills are `zyx-source-pack-mcp`, `zyx-idea-bundle-mcp`, `zyx-product-bundle-mcp`, `zyx-question-authoring-mcp`, and `reference-question-ingest`. They guide agents but do not duplicate or bypass MCP validators. MCP HTTP authorization uses the existing Better Auth admin session through MCP OAuth discovery, PKCE authorization code exchange, and audience-bound bearer tokens with a 30-day hard lifetime. OAuth default scopes remain `authoring:read` and `authoring:stage`. Supported explicit scopes include `authoring:review` and `authoring:withdraw`. Authenticated same-origin session connections receive all supported scopes. A logged-in admin can also create a per-session connection token at `/api/mcp/authoring/connection` for clients without interactive OAuth, including ChatGPT connectors that accept a remote MCP endpoint. Tokens remain bound to the originating live Better Auth session and active-admin role, invalidating earlier if the session ends or permissions change, and are never permanent. No static MCP token, manually configured actor ID, or feature flag is required. There is no `authoring:publish` scope and no publication tool; canonical publication continues strictly through the authenticated admin review boundary.

### Product Bundle Workflow

1. Admins open `/admin/materials/review`, choose `Product`, and use the compact `Upload ZIP` dialog. The dialog validates Product Bundle V2 or V3 according to its declared schema. V3 validates learning products, checksums, Idea and source traceability, complete Article quality coverage, atomic flashcards, draft status, consistent attribution, and holdout markers before staging. V3 rejects question, solution, and assessment blueprint entities; assessment content uses `quiz_bank` or `reference_question_ingest`.
2. The review inventory supports search and filters for course, author, and status. `Buka review` navigates to `/admin/materials/review/product/[slug]`, where Artikel, Diktat, Soal, Pembahasan, Flashcard, and Blueprint use distinct type tabs and a searchable one-product navigator. Artikel provides focus reading and section review modes with learning objectives, estimates, typed learning blocks, relevant visuals, and a compact provenance inspector. Diktat preserves Article lineage and provides render, retry, and PDF preview actions.
3. The detail page reads the staged ZIP from R2 and reconstructs the typed preview before showing it. Product identity, source references, and dependency integrity remain server-controlled; publication still revalidates the bundle before writing canonical rows.
4. Product Idea-link weights must be positive and sum to one. An atomic flashcard has exactly one Idea. A multi-Idea question carries an explicit relation and rationale per linked Idea instead of attaching every relation to the first Idea.
5. Product Bundle never creates Zyx-original questions. Every question declares `itbSource.referenceId` and `itbSource.eventName`; the source must be present in ITB curation, allowed for authoring, and label-matched against the database. Curation dimensions still cover difficulty, format, terminology, and reasoning pattern.
6. Every Diktat declares its source Article ID, version, and generation hash. The bundle must include the matching Article dependency so the Diktat cannot silently drift from its Article.
7. Product Bundle lifecycle is only `draft -> published -> withdrawn`. Explicit save stores a draft. Section decisions and one bundle review decision live outside the ZIP and are bound to reviewer identity, policy version, and the current content fingerprint. Detailed criterion evidence from older reviews remains readable. Restaging preserves only evidence whose content remains unchanged; content edits invalidate affected decisions and make downstream PDF evidence stale.
8. Publication verifies current published Ideas, active source excerpts, identities, dependency freshness, same-reviewer section approval, current pedagogic approval, and a ready 1 to 4 page Diktat PDF before one transaction writes V3 learning products, links, dependencies, the PDF storage key, vector outbox entries, publication state, and mutation audit records. Product Bundle V3 does not write question, solution, or assessment blueprint rows. Existing V2 assessment products remain readable and publish-compatible for legacy bundles. Historical reference questions keep their own assessment workflow and attribution boundary.
9. The workflow is always-on. Legacy material, Diktat, and assessment-source CRUD is retired. Existing legacy rows remain available to compatibility readers, but new authoring must use Source Pack, Idea Bundle, Product Bundle, and the canonical Bank Soal flow.

### Student canonical content

1. `/dashboard`, `/courses`, course detail, search, material lists, mastery, Concept Explorer, study path, flashcards, leaderboard course selection, and profile enrollment read `mata_kuliah`, `bab`, `pendaftaran_murid`, and published Product Bundle tables first.
2. Published Article and Diktat content is visible immediately after publication. Structured Article section progress uses `kemajuan_baca_artikel`; canonical flashcard scheduling uses `kemajuan_flashcard_murid` and append-only `review_flashcard` rows.
3. Article, Diktat, flashcard, and canonical assessment activity records attributable Idea evidence and updates `pemahaman_ide`. Student mastery and study paths use published Ideas and active Idea relations first.
4. Quiz and tryout templates, attempt snapshots, submissions, original PDFs, and historical generated materials remain compatibility readers. Their course identity is resolved through `legacyCourseId`, so they do not replace or duplicate a canonical course.
5. The old `/murid` preview route redirects to `/dashboard`; there is one primary student experience.

### Question origin and citation

1. `ai_question_bank` and canonical `soal` classify each row as `zyx_original`, `historical_reference`, or `itb_example`. Manual and generated bank questions default to `zyx_original`; Product Bundle V2 publication can retain `itb_example`; Product Bundle V3 does not create assessment rows.
2. The admin bank can filter and distinguish the three groups. The tryout editor can import eligible published rows, while historical references remain excluded until their `quizEligible` rules pass.
3. Quiz, tryout, PKA, daily API, and live-quiz payloads preserve origin, source event, source reference, historical source metadata, and provenance in immutable snapshots. Every student question surface renders source attribution when provenance metadata exists, including `Referensi: <source>` for historical references.
4. Origin labels and learner citations render whenever provenance metadata exists; provenance is no longer hidden behind a separate public flag.

### External Authoring Skills

1. The active MCP instruction skills are `zyx-source-pack-mcp`, `zyx-idea-bundle-mcp`, `zyx-product-bundle-mcp`, `zyx-question-authoring-mcp`, and `reference-question-ingest`. They guide agent extraction and authoring, call the provider-neutral MCP tools, and never duplicate or bypass repository quality gates. The question skills document host setup for Claude Desktop, Claude Code, and ChatGPT connectors.
2. The legacy `source-pack-translator`, `zyx-idea-authoring`, and `zyx-product-authoring` directories remain as migration references only. Their JavaScript packaging and validation scripts are not the MCP runtime authority.
4. Idea and Product skills keep a small local Authoring Learning Profile. An explicit operator correction updates the current artifact and adds a scoped lesson for later runs. Source facts, schemas, and quality gates always override learned preferences. No Revision Pack or separate training workflow is used.
5. Legacy packagers and validators use JavaScript and run directly with Bun. The active MCP skills do not ship duplicate validators. All workflow enforcement lives in repository TypeScript modules called by MCP, while ZIP rules still prohibit generic archivers, scripts, symlinks, and executable permission bits.

### Article and Diktat Quality Compiler

1. Approved article products are normalized into typed pedagogic blocks with Idea IDs, source excerpts, learning purpose, generation hash, and reviewer state.
2. Required article coverage includes prior-knowledge activation, problem introduction, per-Idea teaching blocks, synthesis for multi-Idea articles, summary, and retrieval close. Conditional blocks must carry a typed inapplicability reason.
3. Idea prerequisites are ordered deterministically and cycles are rejected before compilation. Quality gates reject stale dependencies, empty blocks, broken math delimiters, missing traceability, and rejected review states.
4. Diktat material is compressed only from an approved article representation. The compression report records the source article version and hash, every removed block, preserved formulas, preserved Idea coverage, and source traces.
5. Admin previews expose block-level Idea and source traceability plus stable quality-gate reason codes. The material quality gate is always applied during review and publication.

### Website Material Generation
The standalone Admin material editor is retired. Existing website material remains readable for compatibility, while new material is published through Product Bundle.

1. All KOs for a chapter are collected in order
2. Gemini compiles them into canonical markdown with custom containers (`:::concept`, `:::formula`, `:::misconception`)
3. Custom compiler parses markdown → AST → interactive web page
4. Math formulas extracted into interactive parameter sheets

### Flashcards (SM-2 Spaced Repetition)
- Cards auto-generated from KOs per chapter
- SM-2 algorithm schedules reviews with recall grades 1;4
- Ease factor adjusts card difficulty dynamically
- Safety floor recovery prevents forgetting after long intervals
- The student queue contains only new or due cards. Canonical cards are ranked by the weakest linked published Idea, unseen state, oldest due date, then stable card ID. Cards at Idea mastery 80 or higher are suppressed, while cards without a valid Idea remain at the end as a compatibility fallback.
- `Lewati` rotates a card to the session tail without writing a review or mastery evidence. Recall grade `Ulangi` writes the normal review, then appends the card to the session tail. Every other grade advances directly to the next card or completion state.

### Student course learning surfaces

- The Documents page uses one reusable search control, one grouped multi-select filter, and one grid or list toggle. Filters use OR within a group and AND across groups. Grid items are minimal file tiles with a contained page thumbnail or structured fallback, never an embedded PDF viewer.
- Manual PDF uploads and completed Diktat rendering rasterize page one through `PDFParse.getScreenshot()`, encode it as WebP through `sharp`, and store it with the course thumbnail key builder. Thumbnail failure does not block the document row or file access. Backfill is an explicit dry-run or guarded apply operation.
- The study path is a deterministic, chapter-grouped roadmap. It exposes one recommended next step, short priority reasons, mastery progress, contextual material, flashcard, and quiz actions, collapsed mastered steps, locked steps after active work, and an optional daily accordion plan.
- Quiz access filters live in the compact page header. Tryout attempt limits remain enforced without a separate explanatory banner.
- Daily Trivia fails closed. A question must belong to the active course, be active, published, current, tagged `trivia`, structurally valid multiple choice, and anchored to a course Knowledge Object or published canonical Idea. When no eligible question exists, no automatic popup or manual trigger is rendered.

### AI Tutor (RAG)
- Three-tier grounded pipeline: KV cache → vector search → Gemini
- Query Action Router (`retrieve`, `reuse_previous_evidence`, `answer_from_conversation`, `clarify`) with response style modifier extraction (`simpler`, `analogy`, `worked_example`, `graph`, etc.)
- Tier 1 Shared KV Cache isolation ensuring zero student identity, user ID, or conversation history is stored in shared cache payloads
- Versioned prompt contracts, policy contracts, and evidence version digests in cache keys
- Weak-concept addendum when student struggles
- Empty or irrelevant course retrieval falls back to the model's general knowledge for learning requests within the Zyx scope. The response clearly states that it is not grounded in the current course material, provides no source badge, and keeps active assessment protections.
- Requests outside the Zyx learning scope receive a short redirection instead of an unrestricted general chat response.
- Capped at 30 AI requests per day per student

### Question Generation & Bank Soal Management
- Multi-format question support: Pilihan Ganda (`multiple_choice`), Pilihan Ganda Kompleks (`multiple_choices`), Isian Singkat (`short_answer` with comma-separated acceptable answers), and Uraian/Essay (`essay` with reference rubric).
- Deterministic multidimensional blueprint engine produces per-slot specs identifying KO, cognitive process, target difficulty, reasoning pattern, and targeted misconceptions
- Gemini generates candidate options with stable option IDs (`opt_0`..`opt_3`)
- Application option shuffle with stored seed prevents position leakage and updates correctIndices and distractor provenances deterministically
- Machine-readable distractor provenance engine maps non-correct options with targeted misconception family, method, score, and uncertainty state (`confident`, `ambiguous`, `unknown`)
- Bulk Markdown Importer supports multi-format tags (`**Tipe:** Pilihan Ganda | Isian Singkat | Essay`) and `**Jawaban:**` parsing for short answers.
- Manual creation and Markdown import in `/admin/ai/questions` are canonical-first. The author must choose a canonical course, may scope the question to a chapter, and may leave the Idea connection empty. If one or more published Ideas are linked, they must belong to the same course and selected chapter and their weights must sum to 100%.
- The question authoring form captures cognitive level and reasoning pattern, supports one or multiple correct options, defaults new work to draft, and offers an explicit publish action. Each write creates `soal` and `pembahasan_soal`, replaces the optional `soal_ide` rows, then updates `ai_question_bank` as a compatibility projection.
- Markdown accepts `**Level Kognitif:**`, `**Pola Penalaran:**`, Indonesian or English type labels, comma or semicolon short-answer variants, and multiple-choice keys such as `**Jawaban:** A, C`.
- Audit trail stored in `question_generation_runs` and `distractor_provenance`
- Generated questions persisted with `qualityScore: null` (unverified) until independent verification

### Diktat PDF Compilation
- The standalone Admin Diktat compiler is retired.
- New Diktat is authored from an approved Article inside Product Bundle, reviewed at `/admin/materials/review`, and published through the canonical bundle lifecycle.
- Rendering runs as a retryable background job against exact Article and Diktat hashes. Formula, renderer, storage, content, and page-count failures are recorded as safe evidence codes.
- A current ready artifact must contain 1 to 4 pages before publication. Admin preview and enrolled-student download use dedicated authorized routes; generic storage access rejects protected Product Diktat PDF keys.

### Bundle Import Pipeline
- Legacy Learning Bundle and Assessment Bundle Admin importers are retired.
- Direct server-action calls fail closed with a retirement message.
- Source Pack, Idea Bundle, and Product Bundle are the supported authoring pipeline.

### PKA Tutorial Campaign
- Free multi-stage simulation for incoming freshmen
- Stages: Matematika, Fisika, Kimia with quiz mappings
- Gated enrollment intake with student registration
- Google Meet review session scheduling
- Admin broadcast announcements

### Email Notification Preferences
- Authenticated users manage optional email at `/settings/notifications` using their Google account email.
- One master control covers four global categories: course updates, events and schedules, learning reminders, and news and offers.
- Essential account, security, payment, and enrollment emails remain mandatory and are outside the optional preference system.
- Optional email delivery always uses one shared sender and fails closed if preferences cannot be loaded.
- Every optional email includes a visible category unsubscribe link plus RFC 8058 one-click headers. Signed links expire after 30 days.
- A browser visit shows a confirmation page and does not mutate preferences. Gmail and compatible clients unsubscribe the linked category through POST.
- Tutorial PKA email uses the central preferences. The legacy PKA opt-in remains only as the initial fallback for existing rows; push preferences are unchanged.

### Learning Outcomes & Career Paths
- CPL/CPMK/Sub-CPMK hierarchy mapped to concepts
- Career path templates with concept prerequisites
- All deterministic SQL, no AI calls

### Content Quality Monitoring
- Auto-detected quality flags: too_easy, too_hard, dead_distractor
- Pedagogical validation against course policies

### Blog & Short Links
- Multi-category blog (tips_kuliah, pojok_kampus, fakta_seru, kegiatan_zyx)
- The public Blog route leads with its identity, category navigation, and latest articles. Feature promotion follows the article content and links to the general course catalog instead of presenting every feature as a detail page.
- URL shortener (zyxacademy.com/s/[slug])

### Assessment Integrity & Assistance Policy
- Active attempt answer protection: GET `/api/quiz/attempts` and `/api/quiz/attempts/[id]` strip `correct_indices`, stored explanations, and grading feedback during in-progress attempts.
- Deterministic assistance policy engine (`lib/assessment-assistance-policy.ts`): gates AI tutor and mistake feedback based on activity kind (study, practice, quiz, simulation, exam), attempt state, answer release state, and match state.
- Answer release state matrix: active attempts enforce `socratic_only` or `refuse_answer_reveal`; completed attempts follow release settings (`hidden`, `rationale_only`, `released`).

### Quiz Timing Rules
- The total time limit (`quizTemplates.timeLimitSeconds`) is the authoritative session cap. When it reaches zero the player auto-submits the attempt.
- Per-question timers (`selectionRules.perQuestionTimerEnabled`, `perQuestionTimers`, `defaultQuestionTimerSeconds`) are pacing aids only. Expiry advances to the next question and never force-submits the quiz while total time remains; revisiting a question restarts its allowance.
- Coherence validation (`lib/asesmen/quiz-timing.ts`): when both timers are active, the sum of per-question allowances must equal the total limit. The admin quiz form blocks save with an error toast, and POST/PATCH `/api/quiz/templates` reject mismatched payloads with 400.
- Submissions on or after session deadline: POST `/api/quiz/attempts/[id]` accepts timeout and late submissions, auto-grades eligible objective answers, marks the attempt as completed, and caps the recorded duration at `timeLimitSeconds`. Attempts containing essay questions remain completed with `gradingStatus` set to `pending` and `score` set to null until essay grading occurs. Attempts without a total limit are unaffected.

### Assessment Integrity V2
- `lib/asesmen/blueprint.ts` compiles quiz and tryout blueprints with exact largest-remainder dimension allocation, explicit chapter scope, reproducible seeds, and publication eligibility checks.
- `lib/asesmen/evidence-rubric.ts` derives versioned per-Idea evidence from stable option IDs. Ambiguous evidence and misconception mappings never affect mastery, and free-response evidence requires a reviewed rubric or grading result.
- `lib/asesmen/benchmark-policy.ts` rejects exact duplicates, applies versioned similarity thresholds, and keeps holdout content inside the benchmark boundary. Missing thresholds produce `needs_review`.
- Quiz attempts include stable option IDs and grade through those IDs while accepting legacy numeric submissions for compatibility.
- Canonical-first assessment lifecycle: all new quizzes created via Admin or Tutor interfaces write to canonical `asesmen`, `blueprint_asesmen`, and `cakupan_asesmen` first, then project to `quiz_templates` for backwards compatibility. Legacy `quiz_templates` is marked as a compatibility projection.
- Legacy quiz submissions are bridged when every snapshot question exactly matches a published canonical question and published Idea links. The bridge writes immutable canonical item and answer snapshots, per-Idea evidence, and deterministic mastery recompute events. Missing, stale, ambiguous, or unreviewed mappings leave the legacy submission intact and produce no canonical mastery evidence.

### Canonical Vectorize Retrieval V2

- Canonical content is indexed through the `canonical-content-v2` profile using Gemini Embedding 2, 768 dimensions, cosine distance, versioned IDs, and allowlisted metadata.
- Turso remains the source of truth. `vector_sync_queue` is the retryable outbox, and the staging worker exposes only the authenticated `/v2/*` contract.
- Canonical retrieval always uses `canonical-content-v2` through the authenticated Vectorize contract. Preserved legacy indexes remain rollback evidence only.
- The old 1024-dimensional indexes are preserved as unbound rollback evidence. They are not active sources of truth.

### Zyra Canonical Runtime V1

- Course-scoped canonical retrieval rehydrates current approved content from Turso before it reaches the tutor response.
- Enrollment, status, version, content hash, active-assessment, restricted-solution capability, and source attribution checks fail closed.
- Shared cache payloads remain student-free and active attempts never receive answer-bearing content.

### Zyra Allowance Ledger V2

- Role-aware application leases for murid, tutor, and admin requests are always-on.
- Provider-backed turns and total interactions are counted separately; cache hits and deterministic actions spend zero provider units.
- Provider Router V2 owns the allowance lease, so a single learner request consumes exactly one provider turn. Visual requests use the same published daily provider allowance and are not stopped by a smaller hidden premium balance.

### Zyra Semantic Cache V1

- `FEATURE_ZYRA_SEMANTIC_CACHE_V1` enables a profile-free exact and semantic cache for reusable teaching scaffolds.
- Cache identity is scoped to canonical evidence, policy, language, route, assessment mode, and embedding profile; learner-specific data is excluded.
- Personalization is applied after cache retrieval, while cache hits consume zero provider units.

### Zyra Pedagogy V3

- The server-owned teaching state machine and typed response contract are always-on. Shadow comparison remains an explicit staging request.
- Zyra selects one teaching move, validates canonical citations and assessment safety, and asks at most one checkpoint question.
- Answers preserve article-style Markdown paragraphs and LaTeX display formulas. Failed generation offers retry guidance rather than repeating page instructions or presenting a source excerpt as the requested explanation.
- Invalid model output becomes a safe clarification or evidence-grounded composition. Active attempts remain capped at the approved hint boundary.
- Reservations are idempotent and fail closed before provider dispatch. Terminal transitions preserve legacy usage history and repair derived compatibility events idempotently.
- The authenticated allowance summary is scoped to the current session actor and includes Jakarta reset timing without exposing global capacity or another user's usage.
- Questions outside the current course evidence use a bounded general-teaching fallback. It states the course boundary, presents one learning goal and staged explanation, and ends with exactly one check-for-understanding prompt instead of reverting to an unstructured chat response.

### Zyra Personalization V1

- Deterministic adaptation from bounded learner evidence is always-on.
- Recent evidence can select pacing, representation, support intensity, explanation length, and checkpoint type while leaving canonical truth, grades, mastery, and assessment policy unchanged.
- Explicit learner preferences are stored separately from inferred fields. Learners can view, update, and reset their course-scoped adaptation through authenticated API routes.
- Shared cache scaffolds remain profile-free. Personalization is composed only after cache retrieval and fails back to the grounded base answer on profile errors.
- The Plan 008 surface is API-only; learner-facing controls are integrated by later Zyra experience plans.

### Zyra Learning Canvas V1

- Typed application-owned visual specs for plots, derivations, tables, diagrams, vectors, and chemistry relationships are always-on.
- Function expressions use a bounded allowlist parser. Controls, presets, reset, and invalid-expression fallback run locally and spend zero AI quota.
- Function value tables recompute from the current formula, coefficient controls, and visible domain; invalid or undefined samples show `N/A` instead of stale default values.
- Teaching prompts proactively request a supported visual when it helps explain the concept, including coefficient controls for exploration and stepwise derivations. Explicit graph requests can use function or data plots. Visuals must remain grounded and respect the current assessment hint level.
- Every canvas includes alt text and a table or textual fallback. Grounded visuals include canonical claim references validated against the retrieved evidence set. Shared specs contain no learner profile or interaction state.
- The renderer uses semantic tokens and keyboard-operable native controls. Arbitrary model-generated JavaScript, HTML, SVG, or unrestricted Mermaid is rejected.
- The harness renders exactly one interactive visual per answer: the validated `canvasSpec` emitted by the model through a structured channel. It never mines equations out of prose, so an answer without a structured spec has no canvas instead of a guessed plot. Tutor prompts no longer request `:::graph`, `:::chart`, or `:::flowchart` markdown blocks; legacy persisted answers with those blocks still render for backward compatibility.
- Function and data plots use custom SVG surfaces with labeled adaptive axes, grid lines, hover crosshair tooltips, visible zero crossings, local expression editing, and coefficient controls. Plots are directly manipulable: drag pans the view, scroll wheel or pinch zooms around the pointer, double-click or Reset tampilan restores the fitted view, and axis labels keep precision at deep zoom levels. Common Gemini notation such as `y = 2x²` is normalized before semantic validation and rendering. Evaluator syntax is separately formatted as readable mathematical notation, so `a*x^2 + b*x + c` is presented as `ax² + bx + c`. Invalid expressions produce a visible recovery message.
- The murid panel is mounted only by the student layout. On desktop it is a flex sibling that reduces the content width, with a persisted width from 360 px to the lower of 720 px or 50 percent of the viewport. Mouse, touch, and keyboard resize share the same limits. On mobile it is a dismissible overlay with backdrop and body scroll lock. Closing with the button, backdrop, or Escape returns focus to the invoking control.
- Each current Zyra answer offers short follow-up actions that adapt to the answer. When Zyra ends with a comprehension-check question the chips become Socratic scaffolds; otherwise they stay generic accelerators for an example, a comprehension check, or another representation. The compact header shows Zyra and the human-readable course title. AI messages use a flat conversation surface, while learner messages use a light bubble. The sticky composer retains attachments, math input, Learning Canvas, quota, Socratic mode, and assessment safety.
- The `desmos` markdown block renders a local multi-expression graph editor at zero AI cost: each row accepts a bounded function of `x` or a named point such as `A = (1, 2)`, rows can be added or removed inline, points are drag-editable on the plot, the vertical domain auto-fits the content, and invalid rows are flagged without blocking valid ones.
- Static Zyra entry points use one application-owned hexagonal `Z` mark across material selection, mistake feedback, and panel fallback. The sidebar no longer duplicates the floating launcher.
- When the pet capability is enabled, the course launcher becomes a draggable fox-like Zyra companion with ears, tail, paws, face, and state-specific expressions. Drag uses pointer capture and frame-based updates. On release it snaps to the nearest of four safe corners outside the sidebar, persists the anchor rather than raw coordinates, and recalculates after viewport changes. Click suppression prevents an accidental open after drag, and reduced motion disables the snap animation.
- On a verified quiz-review route, Zyra receives a bounded page context containing the quiz title and question prompts. This supports requests such as summarizing the current quiz without exposing learner answers or caching attempt-specific context.

### Admin, Tutor, and Murid Workflows

- The guarded `alur_konten` lifecycle is always-on from upload through tutor review, admin approval, publication, supersession, or withdrawal. Every mutation carries an actor, course, version, request, reason, and snapshot hash in `audit_mutasi`.
- The `/murid` read model and compatibility route adapters are always-on. They project published Ideas and preserve Tutorial PKA and historical attempt snapshots without rewriting them.

### Structured Form Upload Storage System

- All public form file response uploads and admin form builder question attachments are saved under a structured R2 storage key hierarchy: `forms/[slugified-judul-forms]/question-[number]/[timestamp]-[hash]-[filename]`.
- Path key resolution is handled deterministically via `lib/forms/storage-utils.ts` (`buildFormStorageKey`) and `/api/forms/upload`.

### Course Material Batch Upload (Admin)

- The course detail Materials tab offers `Unggah Batch` alongside the single-file form. The batch dialog ingests many PDFs at once with a 200-file cap and the existing 50 MB per-file limit.
- Ingestion accepts multi-file pickers, folder pickers (`webkitdirectory`), and drag-and-drop of folders using recursive entry traversal. Hidden and system files (.DS_Store, Thumbs.db, dotfiles) are skipped silently; unsupported extensions and oversize files are logged as skipped warnings.
- Each file is hashed to SHA-256 on the client, in a Web Worker for files above 10 MB, before any network call. Hashes are verified against existing `course_materials.checksum` rows for the course via `POST /api/admin/course-materials/batch/check-duplicates`, plus duplicate detection inside the staged set.
- Duplicates show warning badges and a per-card action: skip, overwrite the existing material (replaces file and metadata), or upload as an additional row.
- Filenames feed a heuristic parser that pre-fills category (materi/soal/pembahasan_soal), subcategory (uts/uas/kuis/kbf/tutorial/modul/ebook/ppt_dosen/catatan/lainnya), year (first 19xx/20xx token), and title.
- Staged files appear as cards in three kanban columns by level-1 category. Cards move between columns via drag-and-drop, individually or as a multi-selection. A bulk bar applies category, year, or subcategory to all selected cards and removes them from the queue. Year inputs appear only for time-related categories (soal, pembahasan_soal); materi cards keep year null.
- A rename preview table shows original versus generated names with inline override. Generated names follow `{course}_{kategori}[_{subkategori}][_{year}]_{judul}.pdf` deterministically; manual overrides win until the metadata changes again.
- Uploads stream straight from the browser to Cloudflare R2 through presigned PUT URLs from `POST /api/admin/course-materials/batch/presign`, with a concurrency queue of four, per-file progress bars, total progress, and up to three exponential-backoff retries. Object keys stay under the existing `courses/{course-slug}/materials/{timestamp}-{hash}-{sanitized-name}.pdf` convention built by `lib/storage/keys.ts`.
- After transfers finish, `POST /api/admin/course-materials/batch/commit` validates keys against the course prefix and persists all metadata rows in one transaction. Metadata is only written for files R2 accepted. Overwrite targets update in place and their replaced objects are deleted best-effort. A failed commit keeps uploaded binaries recoverable via a retry button.

### Push Notifications & In-App Inbox

- Users get an in-app notification bell (unread badge, list, mark-as-read) in the marketing navbar and the app sidebar, backed by `GET /api/notifications/history` and `PATCH /api/notifications/read`.
- FCM push triggers: quiz published (via `saveQuizTemplateAction` and `PATCH /api/quiz/templates/[id]` on a draft-to-published transition), PKA announcements and schedule updates, and admin broadcasts.
- Every notification row persists FCM delivery stats (`attempted`, `succeeded`, `failedCount`, `sentAt`); the admin history table shows a delivery status (Terkirim / Sebagian / Gagal / Tanpa perangkat) alongside the read state.
- The browser permission flow only prompts authenticated users, "Nanti Saja" defers for 7 days instead of denying forever, and foreground FCM messages surface as toasts and refresh the inbox.

### Meet Studio Improvements
- Meet sessions share the `/f/[slug]` resolver with Form Studio. Slugs default from the title, remain editable, and are checked against active Meet and Form records before creation.
- Restricted and Trusted access use a role/course filtered picker with additive bulk selects. Selected users are created as Meet space members, so they can join without knocking according to the selected access mode.
- The signed-in creator and every active admin are provisioned as `COHOST` members through the Developer Preview Meet `v2beta` member endpoint. The OAuth principal remains the meeting organizer; the creator receives host-management rights as a co-host.
- Host, co-host, and invited emails are persisted on `google_meet_sessions`. Failed member grants are returned as visible warnings instead of being presented as successful assignments.
- When `FEATURE_DRIVE_EDITOR_SYNC=1`, active admin emails are granted Drive editor access for exported spreadsheets, Forms files, recording files, transcripts, and new export folders through `lib/google-drive-permissions.ts`.

### Form Studio Fixes & Presets
- Spreadsheet export is scoped to a structured Drive folder (`forms/{slug}`, title `form-{slug}-responses`) and excludes SECTION rows from the data export.
- "Lainnya" (other) options use a stable sentinel (`\uE000__other__`) so open answers survive round trips; SECTION counts are excluded everywhere via a continuous `questionNumberMap`.
- The builder auto-scrolls, resets after a successful publish, and uses shadcn Switch toggles for settings (collect email, show progress, etc.).
- `collectEmail` works end to end; schedule inputs are converted from browser-local values to absolute ISO instants before save, then use `formatDatetimeLocal` for editing.
- Reusable presets (question blueprints + settings) can be saved and re-applied from `/admin/forms` via `/api/admin/form-presets` and `components/forms/form-presets.tsx`, standard for admin users.
- Settings panels fill the container width; the matrix question table was removed; terminology and section header images with zoom were fixed.

### Media Library
- Admins can upload, organize, preview, and manage shared media in R2 under `media/{children_folder...}/{filename}` via `/admin/media` (`components/admin/media-library.tsx`).
- Virtual folder tree with `.keep` markers; move, copy, rename, replace, delete, and download operations, including recursive folder ops and bulk ops.
- Built-in document viewer for image, video, audio, PDF, markdown, and text (`components/admin/document-viewer.tsx`).
- Standard admin capability; uploads use `buildMediaKey` from `lib/storage/keys.ts` and `StorageProvider.list()` from `lib/storage/index.ts`.

### Tautan (Important Links)
- Admins manage a curated links library at `/admin/tautan` (`components/admin/links-manager.tsx`) backed by `lib/links.ts` and `/api/admin/links/*`.
- A public Linktree-style page at `/tautan` renders only active links grouped by category.
- Stored in the `important_links` table with title, URL, description, icon, category, color, and sort order.

### Zyra multimodal tutoring and murid experience

- `FEATURE_ZYRA_IMAGE_INPUT_V1` provides authenticated JPEG, PNG, and WebP uploads for a tutoring turn. Files are sanitized server-side, stored privately for a bounded retention period, and excluded from shared response caches.
- Large accepted images are rotated and resized to a maximum 2048 px dispatch edge before private storage, reducing multimodal latency and payload size without enlarging smaller screenshots.
- Sent images remain visible as authenticated thumbnails on the learner message and in restored chat history. Selecting a thumbnail opens a larger private preview; expired or unauthorized objects remain unreadable.
- Image and text are dispatched as one multimodal request. Gemini Interactions calls use the direct Google endpoint, while the stable `gemini-2.5-flash` image fallback uses Cloudflare AI Gateway through `generateContent`. Retryable provider failures move through this bounded model chain. One successful learner turn spends one allowance; a terminal provider failure refunds it.
- Mathematical tutoring uses equation-first Markdown with inline and display LaTeX. The tutor prompt prefers symbolic derivations over verbal operation lists, while a bounded presentation normalizer repairs common raw equations in new responses and restored chat history without changing valid LaTeX or code.
- A learner can paste an image from the clipboard into the chat input as well as select a file. Image turns treat the current attachment as the primary problem statement and bypass text-only course retrieval, preventing an unrelated published question and its source link from replacing the image content.
- The integrated murid Zyra surface, selection-to-ask, and Zyra pet states are foundational.
- Learning Canvas exploration remains local after render and spends no provider allowance. Multimodal image input is gated by `FEATURE_ZYRA_IMAGE_INPUT_V1`.

### Kelompok Belajar (Study Groups)

- Students enroll in and access courses through Study Groups configured on the platform.
- Study groups combine a semester package with a weekly booking allowance derived from the package:
  - Paket Reguler: 15 sessions per semester, 1 session per week.
  - Paket Intensif: 30 sessions per semester, 2 sessions per week.
  - Paket Super Intensif: 45 sessions per semester, 3 sessions per week.
  - Paket Kustom: Configurable totals with an admin-set weekly allowance.
- Admin portal (`/admin/groups`) provides comprehensive management:
  - KPI strip for total groups, active groups, enrolled students, and average quota usage.
  - Interactive table filtering by status, package tier, and course.
  - Create and edit dialogs with package selection, semester dates, and course assignments.
   - Group detail modal with weekly quota usage, 4-week attended versus missed history, student membership manager (search, add, remove, promote leader), linked activation tokens, and booked tutor session history.
- Student portal (`/dashboard/groups`) provides a dedicated study group dashboard:
  - Active group overview with status and semester badges.
  - Weekly quota tracker showing sessions booked this week against the group weekly allowance, plus attended versus missed counts for the last 4 weeks.
  - Associated courses grid with direct navigation to class materials, quizzes, and tryouts.
  - Peer study mates roster with roles (leader, member) and joined dates.
  - Group session booking and schedule history integrated with the tutor scheduling calendar.
  - 1-click token sharing for inviting group mates when capacity remains.
  - Empty state with instant token redemption for new students.

### Scheduling & Calendar System (Model Kelompok Belajar)

The canonical scheduling workflow uses concrete, date-specific 90-minute tutor slots. The dedicated tutor surface is `/tutor/schedule`; `/dashboard/schedule` is student-only and redirects tutor accounts to the canonical route.

- Group Ownership & Collaborative Booking:
  - Tutoring sessions are booked on behalf of Study Groups.
  - All group members have equal rights to choose, move, or cancel slots before the weekly lock cut-off.
- Weekly Quota (Derived, Per Group):
  - Each group carries a weekly session quota (`weeklyQuotaSessions`) set by admins according to the purchased package preset (1 to 3 sessions per week; custom values allowed).
  - Usage is derived by counting active booking rows of the group inside the target week. Pre-lock cancellations preserve the booking row with status `cancelled` and write a durable `BOOKING_CANCELLED_QUOTA_REFUNDED` marker into `booking_audit_logs` to free the quota. Post-lock cancellations do not receive the refund marker and stay counted against the weekly quota (hangus).
  - Students see "Terpakai minggu ini X/Y" when booking and on the Groups page; the last 4 weeks show attended versus missed/cancelled counts for traceability.
- Weekly Lock & Automated Cut-Off:
  - Tutors may publish availability for any future tutorial week. Changes for a target week close on the Friday before that week at 18:00 WIB. Student booking for that target week opens on the preceding Monday and remains open until Saturday at 23:59 WIB (Asia/Jakarta).
  - Post-lock schedule adjustments require formal Reschedule or Cancellation tickets.
- Fixed 90-Minute Slots:
  - Tutors open concrete availability slots of exactly 90 minutes. The server rejects other durations and the tutor form auto-computes the end time.
  - Copying the previous week creates new concrete rows for the target week. It never creates an unbounded recurring browser event.
- Google Meet Automation:
  - Online sessions provision a dedicated Google Meet space lazily as soon as the slot is booked, moved, or a reschedule ticket is approved; links render immediately for tutors and students. Admins can batch-generate missing links from the admin dashboard.
  - Offline sessions require tutors to specify explicit physical room or branch locations.
- Session Attachments:
  - Pre-session materials upload through `POST /api/upload` into `schedules/{bookingId}/materials`, post-session notes into `schedules/{bookingId}/notes`. Only PDF/PNG/JPG/WebP up to 10 MB is accepted; uploads are authorized per booking (group members or the assigned tutor).
- Pre-Session & Post-Session Workflows:
  - Pre-Session: Any group member can define the discussion topic and upload question files (PDF/images), with uploader identity logged.
  - Post-Session: Tutors mark sessions complete, upload handwritten photo notes or answer PDFs, and embed external links with automated OpenGraph metadata previews.
  - Students, tutors, and admins use the shared Session Detail Drawer for prep, files, links, Meet or location, tutor summary, recording, post-session resources, audit, and tickets.
- Reschedule, Cancellation, and Discussion Threads:
  - Post-lock ticket requests open an integrated discussion chat restricted to group members and the assigned tutor.
  - The assigned tutor holds sole approval authority. Approval migrates the booking to the proposed slot and regenerates Meet links; cancellations forfeit the week's quota without refund.
- Tutor Course Certifications:
  - Only admins assign the courses a tutor may teach (admin schedules dashboard, Tutor tab). The canonical tutor schedule displays certifications read-only.
- Admin Scheduling Operations:
  - Admin Tutorial mode shows concrete availability, booked sessions, locked sessions, and a compact weekly coverage table with Tutor, Slots opened, Booked, Available, and Submission status.
  - Admin can create availability, assign a group to a slot, move a session, or cancel a session only through explicit exceptional controls. Every override requires a non-empty reason and records actor, action, reason, before, after, and timestamp through the existing audit mechanisms.
  - Academic mode remains the only mode that creates official exams, tryouts, quizzes, or other academic schedules. Tutorial mode never turns a calendar gesture into an `official_exam`.
- Legacy Compatibility:
  - `sessionDate = null` tutor availability is legacy compatibility data only. It is excluded from student bookable totals, tutor calendar ranges, and admin coverage. Admin may see a review count, but the application never guesses a recurring date.
- Audit Trail & Activity Log:
  - Every calendar card displays a last-modified indicator: "Diubah oleh [Nama] • [Tanggal]" with full details in the audit drawer.
  - A chronological audit trail records slot selections, migrations, pre-session uploads, and ticket decisions.
- Multi-Level Filter System:
  - Student: Filter by Course and Tutor.
  - Tutor: Filter by Course or Study Group.
  - Admin: Full filtering by Course, Tutor, Study Group, and Schedule Type (Ujian Resmi ITB, Tryout, Kuis, Sesi Tatap Muka).

### Tutor Portal & Overhaul Architecture

The tutor experience is housed in a dedicated, role-scoped shell (`app/(tutor)`) with its own navigation sidebar (`components/tutor/tutor-sidebar.tsx`) and course switcher (`components/tutor/tutor-course-switcher.tsx`). Tutors manage schedules and course activities directly within this shell without redirecting to student pages. The overhaul is always-on with no feature flag.

- Subroute Structure:
  - `/tutor`: Overview portal displaying assigned courses, high-level KPIs, and quick shortcuts.
  - `/tutor/schedule`: Full schedule and availability manager (add concrete 90-minute slots, copy the previous week, view assigned bookings, delete unbooked slots, approve or reject reschedule tickets, and complete sessions). Tutors do not directly assign groups to slots from this surface. Each reschedule or cancellation ticket exposes its discussion thread; the assigned tutor can read all group messages and reply inline.
  - `/tutor/[courseId]`: Course-level dashboard summarizing teaching metrics, active groups, and recent quizzes, with quick-action links to quiz management, live console, grading, and participants.
  - `/tutor/[courseId]/participants`: Enrolled student roster and active study groups with member lists and deterministic representatives.
  - `/tutor/[courseId]/quizzes`: Full quiz template management (create, edit, delete, preview, toggle draft/published status) with creator attribution.
  - `/tutor/[courseId]/quizzes/grading`: Pending quiz review queue. Tutors score essays from 0 to 100, add optional notes, and may override short-answer scores. Every question has equal weight in the final total.
  - `/tutor/[courseId]/quizzes/[templateId]/attempts`: Per-quiz attempt spreadsheet and answer inspection with CSV export.
  - `/tutor/[courseId]/live`: Real-time interactive quiz console for hosting live sessions.
  - `/tutor/[courseId]/grading`: Tryout essay grading queue for assigned courses. Essay attachments uploaded by students are stored under `exams/{examId}/attachments` in object storage and downloadable from the grading workspace; snapshots recorded before real uploads show the attachment as unavailable.

- Capability Boundaries & Access Control:
  - Canonical Access Resolution (`lib/auth/tutor-access.ts`): Requires active `pengguna`, canonical `tutor` role in `pengguna_peran`, active `mata_kuliah` course, and active `penugasan_tutor` row (`status = 'active'`, `assignment_scope = 'course'`).
  - Compatibility Fallback: If no canonical `penugasan_tutor` row exists for that tutor and course, queries legacy `tutor_courses` for active courses. Inactive courses or duplicate legacy mappings fail closed.
  - Materials Authoring Disabled: Tutors cannot create, edit, or upload course materials. Accessing `/tutor/[courseId]/materials` redirects to `/tutor/[courseId]`, and server mutations throw `TUTOR_CAPABILITY_FORBIDDEN: MATERIALS_AUTHORING_DISABLED`.
  - Tryout Authoring Disabled: Tutors can only author quizzes (`daily`, `weekly`, `chapter`, `premium`). Attempting to author `simulation` or `tryout` categories throws `TUTOR_CAPABILITY_FORBIDDEN: SIMULATION_MUTATION_FORBIDDEN` or `TRYOUT_CATEGORY_FORBIDDEN`. Accessing `/tutor/[courseId]/tryouts` redirects to `/tutor/[courseId]`.
  - Tryout Essay Grading: Tutors can grade student essay submissions for tryouts in their assigned courses (`/tutor/[courseId]/grading`). Only reviewable statuses (`pending_review`, `late`, `graded`) can be graded. Submissions for non-assigned courses or non-tryout exams are forbidden. Grading updates score and teacher feedback notes with an optimistic concurrency check (`where(and(eq(id, submissionId), eq(status, currentStatus)))`).
  - Quiz Essay Grading: Quiz submissions containing essays enter `pending` grading state and expose no final total or analytics to the student. Assigned tutors review canonical answer rows with revision-based optimistic concurrency. Completing every required essay changes the attempt to `graded`, recomputes the equal-weight total, and emits reviewed Idea evidence only where an exact published Idea mapping exists.
  - Creator Attribution: Quiz templates and questions track and display creator metadata (`creatorId`, `creatorName`, `creatorEmail`, `creatorRole`) joined from canonical `asesmen.creatorId` through `pengguna` to `user`.

- Schedule Quotas, Refunds, and Notifications:
  - Exact 90-Minute Slots: Availability slots must span exactly 90 minutes. Start and end times are validated server-side.
  - Calendar-First Availability: The tutor schedule opens in week view and also supports day and month views. Selecting a future calendar time creates a date-specific 90-minute slot with a concrete session date. Visual states distinguish available slots, booked sessions, and unavailable past or locked slots.
  - Group Eligibility & Representative Selection: Sessions are scheduled for active study groups enrolled in the course. Group representative is deterministically selected (leader first, earliest `joinedAt`, lexicographical `userId`, member record `id`).
  - Weekly Quota & Cancellation Refunds: Groups carry a weekly quota (`weekly_quota_sessions`, default 2). Usage is computed by counting booking rows in the target ISO week. Cancellations before the Saturday 23:59 WIB lock cut-off receive a durable `BOOKING_CANCELLED_QUOTA_REFUNDED` marker in `booking_audit_logs`, keeping the booking row for traceability while exempting it from weekly quota. Post-lock cancellations forfeit the quota without refund (hangus).
  - Notifications: Schedule bookings, cancellations, and status changes dispatch real-time multi-recipient notifications via `sendToMany`.
  - Durable Mutation Audit: Every tutor slot mutation, deletion, session creation, or cancellation (including failures and validation rejections) is recorded in `audit_mutasi` using `recordTutorMutationAudit` with bounded exponential backoff on SQLite lock contention (`TutorAuditPersistenceError`).

- Admin Tutor Activity Monitoring (`/admin/ops/tutor-activity`):
  - Dedicated admin operations dashboard for auditing all tutor actions and rejected attempts.
  - Filterable by tutor actor, course, entity type, action, outcome (`success`, `rejected`, `failed`, `unclassified`), correlation ID, and date range.
  - Backed by `app/(admin)/admin/ops/tutor-activity/dal.ts` with cursor-based pagination, KPI stats cards, and recursive secret redaction on state snapshots.

- Real-time Live Quiz Callback Semantics (`/api/live/callback`):
  - The Cloudflare Realtime Worker calls `POST /api/live/callback` upon session conclusion with authorization token verification.
  - Token-Fenced Processing Lease: Inside a transaction, writes `live_quiz_results` rows, sets session state to `ended`, participant count, and acquires an exclusive processing lease via conditional Compare-And-Set (CAS) setting `delivery_status = 'processing'`, `delivery_claimed_at = now`, and a fresh unique `delivery_claim_token`. Concurrently enqueues pending tasks into `mastery_recompute_queue`.
  - Lease Concurrency & Stale Claim Recovery: Concurrent callback invocations arriving while an active lease is held (within `CLAIM_LEASE_TTL_MS = 30_000`, 30 seconds) short-circuit without dispatching duplicate side effects. If an earlier processing attempt crashed or stalled beyond 30 seconds, subsequent callback retries use CAS to take over the lease with a new claim token and resume delivery.
  - At-Least-Once Delivery with Idempotent Effects: The active leaseholder dispatches learning events with deterministic collision-resistant IDs (`buildLiveQuizLearningEventId(sessionId, userId, qi)`) and Inngest events with deterministic job IDs (`mastery-recompute-${sessionId}-${studentId}`). This guarantees at-least-once network delivery with idempotent downstream effects.
  - Token-Fenced Delivery Finalization: Upon successful downstream dispatch, updates `delivery_status = 'delivered'` and `delivered_at` conditionally on matching `delivery_claim_token`, preventing expired lease owners from overwriting newer state. If dispatch fails, updates `delivery_status = 'failed'` conditionally on the same token.
  - Idempotent Deduplication: Subsequent callback retries check `delivery_status === 'delivered'` and return immediate success without duplicate processing.

- Zyra Atomic Proposal Transitions (`lib/zyra/proposals/service.ts`):
  - Proposals use typed operations, scope, and precondition snapshots with TTL expiry (`ZYRA_PROPOSAL_TTL_HOURS = 72`).
  - State transitions (`transitionZyraProposal`) execute inside database transactions with optimistic concurrency locking (`where(and(eq(id, proposalId), eq(status, currentStatus)))`).
  - Every transition appends an immutable event log to `zyra_proposal_events` with diff hash and timestamp.
  - If a concurrent mutation occurs, the transaction aborts and throws `PROPOSAL_CONCURRENT_MUTATION`.

### Zyra tutor and admin copilots

- `FEATURE_ZYRA_TUTOR_COPILOT_V1` and `FEATURE_ZYRA_ADMIN_COPILOT_V1` are opt-out switches (enabled unless explicitly `0`) for scoped proposal-first workflows. They show evidence, preconditions, impact, warnings, and lifecycle state before any future mutation integration.
- Proposals never auto-apply. The current mutation call fails closed until the accepted mutation boundary is available.

### Zyra operations

- The admin-only privacy-safe operations dashboard is always-on and guarded by admin authorization. It separates Zyx-recorded usage from configured limits and marks external provider usage unknown when no authoritative balance exists.
- Metrics use the Asia/Jakarta day boundary and expose deduplicated quota, provider, cache, image, assessment, telemetry, and proposal alerts. Each alert carries a rollback flag and a versioned runbook reference; no raw learner or provider payload is shown.

### Student Feature Usage Monitor

- `/admin/ops/feature-usage` is a tutor/admin read model that ranks student feature activity (materials, flashcards, self quizzes, assessments v2, live quizzes, Zyra chat) over a 7/30/90-day window selector.
- It aggregates existing domain tables only (`student_material_progress`, `flashcard_reviews`, `student_quiz_attempts`, `percobaan_asesmen`, `live_quiz_results`, `tutor_chat_messages`/`chat_sessions`); it writes no new events. Unique active students are the union of distinct student ids across those sources.
- The page lists measurement gaps explicitly: daily pop-up quiz stays in localStorage, Cmd+K search records no server events, and diktat download counts are cumulative only. Page traffic remains in Web Analytics; AI token usage remains in Analitik Zyra.

## Structured Article authoring and reading

Student Article headings use the catalogue chapter number and title, for example `Bab 2: Fungsi dan Limit`, in both normal and focus mode. Catalogue numbering already starts at 1. Verbose authoring titles remain available in the bundle without adding course names or duplicate chapter prefixes to the student heading.

The active section's navigation includes the same meaningful block headings shown in the article, including existing fallback headings when a block has no authored title. Formula-only labels and headings that repeat the section title are omitted.

Canonical Article and Diktat lookups decode URL-encoded product IDs before querying. This preserves access to versioned IDs such as `article-id:v2` when App Router page parameters contain `article-id%3Av2`.

Article math styles ship with the application instead of loading from a CDN. Embedded function graphs retain authored equations, display labelled open or closed points, and keep optional value tables behind "Nilai grafik". The reader constrains its flex width so equations and graphs remain inside the mobile reading area. Visuals assigned to a teaching block appear there once, without repeating above the section.

Consecutive Article formulas use compact left-aligned rows without enclosing cards or dividers. Wide equations scroll within their own row. Embedded function graphs start in reading mode, allowing normal page scrolling and touch gestures. "Interaksi grafik" enables pan, pinch, wheel, keyboard navigation, and zoom controls; "Selesai" or Escape releases gestures without resetting the viewport or parameters. "Parameter" reveals compact coefficient controls and a parameter-only reset. Automatic intersection coordinates are inspected through the curve tooltip instead of always covering the plot; authored point labels remain visible. Zyra graphs retain immediate interaction.

`FEATURE_STRUCTURED_ARTICLE_READER_V1` enables coordinated Idea Bundle V3 and Product Bundle V3 authoring, submission, and review. Admin Idea review uses an Idea queue, safe editor, and source evidence. Product Article review uses a section queue, the same semantic renderer as students, provenance, dependency state, and per-section decisions. Published canonical content remains visible to students regardless of the authoring rollout flag.

Students read one meaningful section at a time with stable slug links, chapter search, collapsible table of contents, reading estimates, semantic callouts, resume, completion progress, and titled previous or next navigation. Artikel and text Diktat use a consistent table of contents on the far right, with title-only entries and a right-side Sheet on mobile. Entering a material reader temporarily collapses the student sidebar without overwriting its saved preference. Desktop limits prose to about 75 characters. Search results show title and snippet, open the matching section, and apply a temporary visual highlight. The legacy reader remains a fallback only when no published canonical Article exists.

A section completes at 90 percent read depth or when the reader proceeds from its end. Chapter progress is the count of completed sections divided by all sections. Student payloads never expose Idea IDs or internal provenance.

## Money & Quota Rules

- AI quota spent only on: tutoring, mistake feedback, content generation
- Streaks, recommendations, study paths, reflections ; all deterministic SQL
- Students capped at 30 AI requests/day
- KV writes capped at 900/day; reads unrestricted
