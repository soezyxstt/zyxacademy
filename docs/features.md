# Zyx Academy ; Features & Workflows

## What It Is

Zyx Academy is an AI-powered learning management platform. It takes expert teaching documents, breaks them into atomic concepts, and uses that structure to power personalized learning paths, adaptive flashcards, quizzes, PDF study guides, and one-on-one tutoring.

## User Roles

Canonical access-role codes are `admin`, `tutor`, and `murid`. Better Auth keeps the legacy `user.role` projection during the expand phase. `FEATURE_PERAN_V2` switches the admin and tutor layout gates to domain memberships without changing chat speaker values such as `student`.

### Student
- Redeems enrollment tokens to access courses
- Views personalized dashboard with progress, weak concepts, daily recommendations
- Reads interactive course materials (markdown, PDFs, images, embedded video)
- Takes daily/weekly quizzes and timed tryouts
- Views dedicated AI-powered Quiz Learning Analytics & Diagnosis page (`/summary`) upon quiz completion (3-layer executive summary, deterministic concept mastery, AI error pattern detection, cognitive skill breakdown, time/speed insights, and personalized 3-step action plan)
- Reviews flashcards with SM-2 spaced repetition
- Chats with AI tutor for concept help
- Books real tutor sessions
- Participates in live classroom quizzes
- Views leaderboard and answer keys

### Teacher
- Sets weekly availability for student consultations
- Triggers AI-generated quiz templates, curates questions before publishing
- Grades essays and provides feedback
- Compiles course chapters into structured Diktat PDFs
- Hosts live quiz sessions

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
- Accesses dedicated Quiz & Exam Analytics & Insight portal (`/admin/ai/quiz-insights`) for real-time item/distractor analysis, student attempt spreadsheets, item-response answer matrices, export to CSV / Google Spreadsheet, and on-demand Gemini AI deep pedagogical insights
- Accesses Tutor Quiz Attempt Spreadsheet portal (`/tutor/[courseId]/quizzes/[templateId]/attempts`) for detailed student answer inspection and CSV exports
- Monitors real-time feature flag statuses (`/admin/ops/flags`) across all 28+ `FEATURE_*` flags with status badges, category filters, and env key helpers

## Core Pipelines

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
5. `FEATURE_ARSITEKTUR_IDE_V1` remains off; existing KOs and callers are unchanged until later plans.

### Product, Assessment, and Idea Mastery Domain
1. Articles, diktat materials, questions, solutions, and flashcards have normalized versioned target records with source and generation hashes.
2. Published products require at least one published Idea; question links support multiple Ideas with positive weights whose sum is checked within `0.000001`.
3. Assessment definitions separate blueprint, assessment, chapter scope, ordered items, attempts, and answers. Quiz scope is exactly one chapter; tryout scope is one or more chapters.
4. Attempt and answer records carry rendered question, option order, response, grading policy, and content version snapshots so later content changes do not alter historical context.
5. Answer evidence records Idea attribution, contribution, weight, confidence, evidence source, rubric version, and derivation status. Ambiguous evidence is retained but cannot affect mastery.
6. `pemahaman_ide` stores score and confidence as separate 0 to 100 values, with append-only change history, replay metadata, and deterministic flashcard recommendations. Only attributable verified evidence contributes to the score; a legacy concept baseline is explicitly labelled and never copied to an Idea.
7. Bundle imports, entity inventories, reviews, atomic publication records, and mutation audits are normalized for later workflow plans.
8. `FEATURE_PRODUK_IDE_V1`, `FEATURE_ASESMEN_IDE_V1`, and `FEATURE_PEMAHAMAN_IDE_V1` remain absent or `0` until the later workflow canaries; current legacy records remain unchanged.

### Idea Bundle V2 Workflow

1. Admins upload strict ZIP bundles from `/admin/bundles/idea`; validation rejects unsafe archive entries, unknown manifest fields, checksum drift, missing source spans, duplicate stable keys, unresolved conflicts, and prerequisite cycles.
2. Valid uploads create an immutable import record and entity inventory without writing canonical source or Idea rows. Identical retries are no-ops and a different checksum for the same bundle ID is blocked.
3. Assigned tutors can review provenance and Idea correctness. Admin approval and rejection decisions are audited and immutable.
4. Only an admin can publish an approved bundle. Source materials, chunks, Ideas, provenance, relations, publication state, audits, and deterministic vector outbox jobs are written atomically.
5. `FEATURE_IDEA_BUNDLE_V2` controls the workflow. When absent or `0`, the legacy JSON importer remains visible for rollback.

### Authoring Context Pack V1

1. Admins can export a deterministic context pack from `/admin/authoring-context` rooted in a selected course snapshot.
2. The allowlist includes only published current reviewed Ideas, active source excerpts, provenance, relations, objectives, safe requirements, and allowed benchmark summaries.
3. Holdout content, murid data, credentials, signed URLs, embeddings, and unpublished or stale content are excluded and counted or scanned before storage.
4. The private artifact is stored under a run-specific staging R2 prefix and every export is recorded in `audit_mutasi` with checksum and retention metadata.
5. `FEATURE_AUTHORING_CONTEXT_V1` is admin-only by default and disables the UI and API when absent or `0`.

### Product Bundle V2 Workflow

1. Admins upload typed ZIP bundles from `/admin/bundles/product`; the server validates product schemas, checksums, Idea and source traceability, renderable blocks, assessment scope, atomic flashcards, and holdout markers.
2. Valid uploads create immutable staged inventories. Identical retries write no rows, while a different checksum for the same bundle ID is rejected.
3. Reviewers see a server-rendered preview for every product type with source and Idea IDs. Tutor approval is course-scoped and admin approval is required for publication.
4. Publication verifies current published Ideas, active source excerpts, identities, and dependency freshness before one transaction writes products, links, dependencies, vector outbox entries, publication state, and mutation audit records.
5. `FEATURE_PRODUCT_BUNDLE_V2` hides the page and API when absent or `0`; legacy importers remain available as a rollback path. Assessment Bundle upsert also preserves prior source versions when content changes.

### Article and Diktat Quality Compiler

1. Approved article products are normalized into typed pedagogic blocks with Idea IDs, source excerpts, learning purpose, generation hash, and reviewer state.
2. Required article coverage includes prior-knowledge activation, problem introduction, per-Idea teaching blocks, synthesis for multi-Idea articles, summary, and retrieval close. Conditional blocks must carry a typed inapplicability reason.
3. Idea prerequisites are ordered deterministically and cycles are rejected before compilation. Quality gates reject stale dependencies, empty blocks, broken math delimiters, missing traceability, and rejected review states.
4. Diktat material is compressed only from an approved article representation. The compression report records the source article version and hash, every removed block, preserved formulas, preserved Idea coverage, and source traces.
5. Admin previews expose block-level Idea and source traceability plus stable quality-gate reason codes. `FEATURE_MATERIAL_COMPILER_V2` keeps the new publication gate disabled when absent or `0`.

### Website Material Generation
1. All KOs for a chapter are collected in order
2. Gemini compiles them into canonical markdown with custom containers (`:::concept`, `:::formula`, `:::misconception`)
3. Custom compiler parses markdown → AST → interactive web page
4. Math formulas extracted into interactive parameter sheets

### Flashcards (SM-2 Spaced Repetition)
- Cards auto-generated from KOs per chapter
- SM-2 algorithm schedules reviews with recall grades 1;4
- Ease factor adjusts card difficulty dynamically
- Safety floor recovery prevents forgetting after long intervals

### AI Tutor (RAG)
- Three-tier grounded pipeline: KV cache → vector search → Gemini
- Query Action Router (`retrieve`, `reuse_previous_evidence`, `answer_from_conversation`, `clarify`) with response style modifier extraction (`simpler`, `analogy`, `worked_example`, `graph`, etc.)
- Tier 1 Shared KV Cache isolation ensuring zero student identity, user ID, or conversation history is stored in shared cache payloads
- Versioned prompt contracts, policy contracts, and evidence version digests in cache keys
- Weak-concept addendum when student struggles
- Capped at 30 AI requests per day per student

### Question Generation & Bank Soal Management
- Multi-format question support: Pilihan Ganda (`multiple_choice`), Pilihan Ganda Kompleks (`multiple_choices`), Isian Singkat (`short_answer` with comma-separated acceptable answers), and Uraian/Essay (`essay` with reference rubric).
- Deterministic multidimensional blueprint engine produces per-slot specs identifying KO, cognitive process, target difficulty, reasoning pattern, and targeted misconceptions
- Gemini generates candidate options with stable option IDs (`opt_0`..`opt_3`)
- Application option shuffle with stored seed prevents position leakage and updates correctIndices and distractor provenances deterministically
- Machine-readable distractor provenance engine maps non-correct options with targeted misconception family, method, score, and uncertainty state (`confident`, `ambiguous`, `unknown`)
- Bulk Markdown Importer supports multi-format tags (`**Tipe:** Pilihan Ganda | Isian Singkat | Essay`) and `**Jawaban:**` parsing for short answers.
- Audit trail stored in `question_generation_runs` and `distractor_provenance`
- Generated questions persisted with `qualityScore: null` (unverified) until independent verification

### Diktat PDF Compilation
- Teacher selects chapters
- System fetches KOs, formats into JSON config
- HTML rendered with KaTeX math
- Puppeteer compiles to A4 PDF, uploaded to R2

### Bundle Import Pipeline
- Split JSON format: Learning Bundle (chapters, KOs, flashcards) + Assessment Bundle (exams)
- Learning Bundle imported first to create course/chapter shell
- Assessment Bundle references chapters by title (not $id)
- Incremental re-import with upsert/append/create modes
- Post-processing: concept mapping, vector sync, assessment profile recompute

### PKA Tutorial Campaign
- Free multi-stage simulation for incoming freshmen
- Stages: Matematika, Fisika, Kimia with quiz mappings
- Gated enrollment intake with student registration
- Google Meet review session scheduling
- Admin broadcast announcements

### Learning Outcomes & Career Paths
- CPL/CPMK/Sub-CPMK hierarchy mapped to concepts
- Career path templates with concept prerequisites
- All deterministic SQL, no AI calls

### Content Quality Monitoring
- Auto-detected quality flags: too_easy, too_hard, dead_distractor
- Pedagogical validation against course policies

### Blog & Short Links
- Multi-category blog (tips_kuliah, pojok_kampus, fakta_seru, kegiatan_zyx)
- URL shortener (zyxacademy.com/s/[slug])

### Assessment Integrity & Assistance Policy
- Active attempt answer protection: GET `/api/quiz/attempts` and `/api/quiz/attempts/[id]` strip `correct_indices`, stored explanations, and grading feedback during in-progress attempts.
- Deterministic assistance policy engine (`lib/assessment-assistance-policy.ts`): gates AI tutor and mistake feedback based on activity kind (study, practice, quiz, simulation, exam), attempt state, answer release state, and match state.
- Answer release state matrix: active attempts enforce `socratic_only` or `refuse_answer_reveal`; completed attempts follow release settings (`hidden`, `rationale_only`, `released`).

### Assessment Integrity V2
- `lib/asesmen/blueprint.ts` compiles quiz and tryout blueprints with exact largest-remainder dimension allocation, explicit chapter scope, reproducible seeds, and publication eligibility checks.
- `lib/asesmen/evidence-rubric.ts` derives versioned per-Idea evidence from stable option IDs. Ambiguous evidence and misconception mappings never affect mastery, and free-response evidence requires a reviewed rubric or grading result.
- `lib/asesmen/benchmark-policy.ts` rejects exact duplicates, applies versioned similarity thresholds, and keeps holdout content inside the benchmark boundary. Missing thresholds produce `needs_review`.
- When `FEATURE_ASESMEN_IDE_V1=1`, quiz attempts include stable option IDs and grade through those IDs while accepting legacy numeric submissions for compatibility.

### Canonical Vectorize Retrieval V2

- Canonical content is indexed through the `canonical-content-v2` profile using Gemini Embedding 2, 768 dimensions, cosine distance, versioned IDs, and allowlisted metadata.
- Turso remains the source of truth. `vector_sync_queue` is the retryable outbox, and the staging worker exposes only the authenticated `/v2/*` contract.
- `FEATURE_VECTORIZE_ONLY_V1` is the read and write switch. When absent or `0`, the compatibility path is read-only. When `1`, active retrieval uses `zyx-vectors-staging-v2` in staging.
- The old 1024-dimensional indexes are preserved as unbound rollback evidence. They are not active sources of truth.

### Zyra Canonical Runtime V1

- `FEATURE_ZYRA_IDEA_RUNTIME_V1` enables course-scoped retrieval that rehydrates current approved content from Turso before it reaches the tutor response.
- Enrollment, status, version, content hash, active-assessment, restricted-solution capability, and source attribution checks fail closed.
- Shared cache payloads remain student-free and active attempts never receive answer-bearing content.

### Zyra Allowance Ledger V2

- `FEATURE_ZYRA_ALLOWANCE_V2` enables role-aware application leases for murid, tutor, and admin requests.
- Provider-backed turns and total interactions are counted separately; cache hits and deterministic actions spend zero provider units.

### Zyra Semantic Cache V1

- `FEATURE_ZYRA_SEMANTIC_CACHE_V1` enables a profile-free exact and semantic cache for reusable teaching scaffolds.
- Cache identity is scoped to canonical evidence, policy, language, route, assessment mode, and embedding profile; learner-specific data is excluded.
- Personalization is applied after cache retrieval, while cache hits consume zero provider units.

### Zyra Pedagogy V3

- `FEATURE_ZYRA_PEDAGOGY_V3` enables the server-owned teaching state machine and typed response contract.
- Zyra selects one teaching move, validates canonical citations and assessment safety, and asks at most one checkpoint question.
- Invalid model output becomes a safe clarification or evidence-grounded composition. Active attempts remain capped at the approved hint boundary.
- Reservations are idempotent and fail closed before provider dispatch. Terminal transitions preserve legacy usage history and repair derived compatibility events idempotently.
- The authenticated allowance summary is scoped to the current session actor and includes Jakarta reset timing without exposing global capacity or another user's usage.

### Admin, Tutor, and Murid Workflows

- `FEATURE_ADMIN_TUTOR_WORKFLOW_V1` enables the guarded `alur_konten` lifecycle from upload through tutor review, admin approval, publication, supersession, or withdrawal. Every mutation carries an actor, course, version, request, reason, and snapshot hash in `audit_mutasi`.
- `FEATURE_MURID_IDEA_WORKFLOW_V1` enables the `/murid` read model and compatibility route adapters. It projects published Ideas and preserves Tutorial PKA and historical attempt snapshots without rewriting them.

## Money & Quota Rules

- AI quota spent only on: tutoring, mistake feedback, content generation
- Streaks, recommendations, study paths, reflections ; all deterministic SQL
- Students capped at 30 AI requests/day
- KV writes capped at 900/day; reads unrestricted
