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
- Monitors real-time statuses for the approved optional feature flags (`/admin/ops/flags`) with status badges, category filters, and env key helpers
- Manages admin leaderboard (`/admin/leaderboard`) with overview mode showing per-course aggregate metrics (all courses including zero-activity, sorted alphabetically, unique student count across visible set) and course-selected mode for per-student ranking within a single course

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
2. Published products require at least one published Idea; question links support multiple Ideas with positive weights whose sum is checked within `0.000001`. Every Product Bundle question is an ITB example with a required source event and allowed reference, and multi-Idea questions require a HOT cognitive level.
3. Assessment definitions separate blueprint, assessment, chapter scope, ordered items, attempts, and answers. Quiz scope is exactly one chapter; tryout scope is one or more chapters.
4. Attempt and answer records carry rendered question, option order, response, grading policy, and content version snapshots so later content changes do not alter historical context.
5. Answer evidence records Idea attribution, contribution, weight, confidence, evidence source, rubric version, and derivation status. Ambiguous evidence is retained but cannot affect mastery.
6. `pemahaman_ide` stores score and confidence as separate 0 to 100 values, with append-only change history, replay metadata, and deterministic flashcard recommendations. Cards for Ideas with mastery score 80 or higher are suppressed. Only attributable verified evidence contributes to the score; a legacy concept baseline is explicitly labelled and never copied to an Idea.
7. Bundle imports, entity inventories, reviews, atomic publication records, and mutation audits are normalized for later workflow plans.
8. Product, assessment, and per-Idea learning callers are always-on; current legacy records remain unchanged and readable for compatibility.

### Idea Bundle Workflow

1. Admins open `/admin/materials/review`, choose `Source Pack + Idea`, and use the compact `Upload ZIP` action. The dialog first analyzes the strict ZIP without persistence, then stages the validated artifact after confirmation. Validation rejects unsafe archive entries, unknown manifest fields, checksum drift, missing source spans, non-publishable Ideas or sources, inconsistent creator attribution, duplicate stable keys, unresolved conflicts, and prerequisite cycles.
2. The review page is a searchable, filterable inventory by course, author, and status. Artifact cards lead with course, creation time, author, and content summary; bundle IDs and checksums remain secondary technical details. `Buka review` navigates to `/admin/materials/review/idea/[slug]`, where the three-step workflow, Idea list, relations, source evidence, KaTeX preview, focused one-Idea editing, reviewer note, approval, rejection, and publication actions are presented together.
3. The detail page reads the staged ZIP from R2 and reconstructs the validated preview before showing it. Stable identities and source spans stay locked. Identical upload retries are no-ops and a different checksum for the same bundle ID is blocked.
4. Only an admin can publish an approved bundle. Source materials, chunks, Ideas, provenance, relations, publication state, audits, and deterministic vector outbox jobs are written atomically.
5. `FEATURE_IDEA_BUNDLE_V2` controls the workflow. When absent or `0`, the legacy JSON importer remains visible for rollback.

### Upload Manual and Authoring Context Pack V1

1. Admins open `/admin/materials/manual` for the paginated manual workflow. It accepts one Source Pack, validates it without persistence, shows an informative inventory, and lets an admin select a course and one or more chapters by human labels. Every detected source section is mapped to a chapter before download; one selected chapter maps all sections automatically.
2. The admin selects product families with dependency-safe controls. Article is mandatory, question includes solution, and assessment blueprint requires questions. Zyx produces one checksum-protected Authoring Job Pack containing the embedded Source Pack, locked target mapping, product request, attribution sentinels, website schemas, and workflow instructions.
3. The `Lanjutkan dari Idea terbit` process inside `/admin/materials/manual` exports a deterministic Context Pack rooted in the selected course after official Idea publication. Snapshot and run identities are generated by the server, so the admin never copies technical IDs.
4. The allowlist includes only published current reviewed Ideas, active source excerpts, provenance, relations, objectives, safe requirements, and allowed benchmark summaries. An allowed benchmark summary exposes a distinct ITB `referenceId` and exact `sourceLabel`; its benchmark `id` remains separate. The pack also includes machine-readable Idea Bundle and Product Bundle JSON Schemas plus an external-agent workflow contract.
5. Holdout content, murid data, credentials, signed URLs, embeddings, and unpublished or stale content are excluded and counted or scanned before storage.
6. The private artifact is stored under a run-specific staging R2 prefix and every export is recorded in `audit_mutasi` with checksum and retention metadata. An authenticated admin can download the artifact until retention expires; internal R2 keys are not returned by the listing API.
7. External agents use `$UPLOADER` and `$APPROVING_REVIEWER` for attribution without receiving private Zyx identity IDs. Publication resolves those sentinels to the accountable uploader and approving admin.
8. `FEATURE_AUTHORING_CONTEXT_V1` is admin-only by default and disables both manual processes and their APIs when absent or `0`.

### Provider-neutral Authoring MCP V1

1. `/api/mcp/authoring` exposes a provider-neutral Streamable HTTP MCP endpoint. Its core does not depend on Gemini, Claude, or ChatGPT; each host discovers the same typed tools.
2. `workflow.list` exposes exactly two choices: `idea_product` and `quiz_bank`. There is deliberately no combined workflow option. Both workflows lock one course and one chapter; `idea_product` requires a Source Pack while `quiz_bank` accepts an optional Source Pack so agents can author directly from the published Idea catalog.
3. `source.ingest` accepts a base64 Source Pack plus one ephemeral original binary per declared document. It runs secure ZIP validation, original binary checksum verification, deterministic Markdown counts, marker validation, structured visual checks, unresolved checks, and a quality report. Invalid archives or incomplete quality evidence return structured reason codes rather than a generic upload error.
4. Course and chapter choices use short-lived signed keys, so agents and operators do not exchange raw internal IDs. `workflow.start` returns a scoped run token and a workflow contract.
5. Idea Bundle and Product Bundle validation combines technical compatibility with repository content-quality gates. Idea checks include meaningful source coverage, provenance coverage, duplicate candidates, and formula trace warnings. Product checks include published Idea scope, dependency freshness, Article depth, Diktat coverage, examples, visuals, retrieval, traps, formulas, and ITB provenance.
6. For `quiz_bank`, `assessment.list_ideas` returns the published Idea catalog of the locked course and chapter with free-text query, knowledge kind, instructional role, and difficulty level filters plus distribution facets and offset paging. `assessment.get_idea` returns one Idea with active relations in both directions and a provenance summary so agents can respect prerequisites before linking. The workflow contract exposes scope guidance enumerating difficulty, cognitive level, question type, idea role, tag rules, and weight rules.
7. Draft V2 accepts optional Idea links per question; linked weights must sum to 100%. `assessment.validate_quiz_draft` aggregates every blocking issue and warning in one response instead of failing on the first error. It reports difficulty, cognitive level, question type, and tag distributions plus per-Idea coverage so agents can close gaps before submission. Warnings include coverage gaps for uncovered catalog Ideas and empty explanations; blocking issues include duplicate draft IDs, malformed questions, duplicate answer keys, duplicate or out-of-scope Idea links, invalid weights, and unpublished Ideas. Valid submission writes `soal`, optional `soal_ide`, `pembahasan_soal`, the `ai_question_bank` compatibility projection, and an audit row in one transaction with `reviewStatus=generated`. The staging actor is derived from the authenticated admin principal and no MCP tool can publish content.
8. The instruction skills are `zyx-source-pack-mcp`, `zyx-idea-bundle-mcp`, `zyx-product-bundle-mcp`, and `zyx-question-authoring-mcp`. They guide agents but do not duplicate or bypass MCP validators. MCP HTTP authorization uses the existing Better Auth admin session through MCP OAuth discovery, PKCE authorization code exchange, and short-lived audience-bound bearer tokens. A logged-in admin can also create a per-session connection token at `/api/mcp/authoring/connection` for clients without interactive OAuth, including ChatGPT connectors that accept a remote MCP endpoint. No static MCP token, manually configured actor ID, or feature flag is required. The transport is stateless and keeps run scope inside signed tokens; canonical publication continues through the authenticated admin review boundary.

### Product Bundle Workflow

1. Admins open `/admin/materials/review`, choose `Product`, and use the compact `Upload ZIP` dialog. The dialog validates product schemas, checksums, Idea and source traceability, complete article quality coverage, assessment scope, atomic flashcards, deterministic question keys, one solution per question, draft status, consistent attribution, and holdout markers before staging.
2. The review inventory supports search and filters for course, author, and status. `Buka review` navigates to `/admin/materials/review/product/[slug]`, where Artikel, Diktat, Soal, Pembahasan, Flashcard, and Blueprint use distinct type tabs, one selected product at a time, focused one-product editing, clear section dividers, locked ITB source identity, dependency context, reviewer notes, and the shared KaTeX preview.
3. The detail page reads the staged ZIP from R2 and reconstructs the typed preview before showing it. Product identity, source references, and dependency integrity remain server-controlled; publication still revalidates the bundle before writing canonical rows.
4. Product Idea-link weights must be positive and sum to one. An atomic flashcard has exactly one Idea. A multi-Idea question carries an explicit relation and rationale per linked Idea instead of attaching every relation to the first Idea.
5. Product Bundle never creates Zyx-original questions. Every question declares `itbSource.referenceId` and `itbSource.eventName`; the source must be present in ITB curation, allowed for authoring, and label-matched against the database. Curation dimensions still cover difficulty, format, terminology, and reasoning pattern.
6. Every Diktat declares its source Article ID, version, and generation hash. The bundle must include the matching Article dependency so the Diktat cannot silently drift from its Article.
7. Product Bundle lifecycle is only `draft -> published -> withdrawn`. Explicit save stores a draft. A draft can be replaced with the same bundle ID, deleted, or published directly by an admin. Published bundles cannot be overwritten. Withdrawal keeps canonical and audit history while removing the products from active publication state.
8. Publication verifies current published Ideas, active source excerpts, identities, dependency freshness, and ITB source identity before one transaction writes products, links, dependencies, the legacy bank compatibility projection, canonical vector outbox entries, publication state, and mutation audit records. Question answer-key fields are removed from runtime and Vectorize content. Only articles, questions, and solutions request runtime vectors; flashcards, Diktat, and assessment blueprints do not create generic product vectors.
9. `FEATURE_PRODUCT_BUNDLE_V2` hides the page and API when absent or `0`; legacy importers remain available as a rollback path. Assessment Bundle upsert also preserves prior source versions when content changes.

### Question origin and citation

1. `ai_question_bank` and canonical `soal` classify each row as `zyx_original` or `itb_example`. Manual and generated bank questions default to `zyx_original`; Product Bundle publication always writes `itb_example`.
2. The admin bank can filter and distinguish the two groups. The tryout editor can import either group directly from the published bank.
3. Quiz, tryout, PKA, daily API, and live-quiz payloads preserve origin, source event, and source reference in immutable snapshots. Every student question surface renders `Sumber: <event>` at the lower right for ITB examples only.
4. Origin labels and learner citations render whenever provenance metadata exists; provenance is no longer hidden behind a separate public flag.

### External Authoring Skills

1. The active MCP instruction skills are `zyx-source-pack-mcp`, `zyx-idea-bundle-mcp`, `zyx-product-bundle-mcp`, and `zyx-question-authoring-mcp`. They guide agent extraction and authoring, call the provider-neutral MCP tools, and never duplicate or bypass repository quality gates. The question skill documents host setup for Claude Desktop, Claude Code, and ChatGPT connectors.
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
- URL shortener (zyxacademy.com/s/[slug])

### Assessment Integrity & Assistance Policy
- Active attempt answer protection: GET `/api/quiz/attempts` and `/api/quiz/attempts/[id]` strip `correct_indices`, stored explanations, and grading feedback during in-progress attempts.
- Deterministic assistance policy engine (`lib/assessment-assistance-policy.ts`): gates AI tutor and mistake feedback based on activity kind (study, practice, quiz, simulation, exam), attempt state, answer release state, and match state.
- Answer release state matrix: active attempts enforce `socratic_only` or `refuse_answer_reveal`; completed attempts follow release settings (`hidden`, `rationale_only`, `released`).

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

- `FEATURE_ZYRA_ALLOWANCE_V2` enables role-aware application leases for murid, tutor, and admin requests.
- Provider-backed turns and total interactions are counted separately; cache hits and deterministic actions spend zero provider units.
- Provider Router V2 owns the allowance lease when both flags are active, so a single learner request consumes exactly one provider turn. Visual requests use the same published daily provider allowance and are not stopped by a smaller hidden premium balance.

### Zyra Semantic Cache V1

- `FEATURE_ZYRA_SEMANTIC_CACHE_V1` enables a profile-free exact and semantic cache for reusable teaching scaffolds.
- Cache identity is scoped to canonical evidence, policy, language, route, assessment mode, and embedding profile; learner-specific data is excluded.
- Personalization is applied after cache retrieval, while cache hits consume zero provider units.

### Zyra Pedagogy V3

- The server-owned teaching state machine and typed response contract are always-on. Shadow comparison remains an explicit staging request.
- Zyra selects one teaching move, validates canonical citations and assessment safety, and asks at most one checkpoint question.
- Invalid model output becomes a safe clarification or evidence-grounded composition. Active attempts remain capped at the approved hint boundary.
- Reservations are idempotent and fail closed before provider dispatch. Terminal transitions preserve legacy usage history and repair derived compatibility events idempotently.
- The authenticated allowance summary is scoped to the current session actor and includes Jakarta reset timing without exposing global capacity or another user's usage.
- Questions outside the current course evidence use a bounded general-teaching fallback. It states the course boundary, presents one learning goal and staged explanation, and ends with exactly one check-for-understanding prompt instead of reverting to an unstructured chat response.

### Zyra Personalization V1

- `FEATURE_ZYRA_PERSONALIZATION_V1` enables deterministic adaptation from bounded learner evidence.
- Recent evidence can select pacing, representation, support intensity, explanation length, and checkpoint type while leaving canonical truth, grades, mastery, and assessment policy unchanged.
- Explicit learner preferences are stored separately from inferred fields. Learners can view, update, and reset their course-scoped adaptation through authenticated API routes.
- Shared cache scaffolds remain profile-free. Personalization is composed only after cache retrieval and fails back to the grounded base answer on profile errors.
- The Plan 008 surface is API-only; learner-facing controls are integrated by later Zyra experience plans.

### Zyra Learning Canvas V1

- `FEATURE_ZYRA_LEARNING_CANVAS_V1` enables typed application-owned visual specs for plots, derivations, tables, diagrams, vectors, and chemistry relationships.
- Function expressions use a bounded allowlist parser. Controls, presets, reset, and invalid-expression fallback run locally and spend zero AI quota.
- Every canvas includes alt text and a table or textual fallback. Grounded visuals include canonical claim references; a plot recovered only from a learner-provided equation keeps an empty claim-reference list instead of inventing provenance. Shared specs contain no learner profile or interaction state.
- The renderer uses semantic tokens and keyboard-operable native controls. Arbitrary model-generated JavaScript, HTML, SVG, or unrestricted Mermaid is rejected.
- Function and data plots use responsive Recharts surfaces with labeled axes, grid lines, tooltips, visible zero crossings, and local controls. Common Gemini notation such as `y = 2x²` is normalized before semantic validation and rendering. Evaluator syntax is separately formatted as readable mathematical notation, so `a*x^2 + b*x + c` is presented as `ax² + bx + c`. Invalid expressions produce a visible recovery message. Legacy typed visuals and explicit visual requests are upgraded into Learning Canvas specs after provider and cache handling. A learner equation or known deterministic concept visual is preferred over the model canvas, so a valid graph still renders when Gemini omits or returns an invalid `canvasSpec`, including when RAG has no matching source. The quadratic theory visual uses `y = ax^2 + bx + c` with local controls for `a`, `b`, and `c`.
- The murid drawer can be resized by dragging its left handle (mouse or touch, width persisted) up to the viewport, or expanded with a dedicated button. Each current Zyra answer offers short follow-up actions that adapt to the answer: when Zyra ends with a comprehension-check question the chips become Socratic scaffolds (first-step hint, slower guidance, full worked discussion); otherwise they stay generic accelerators for an example, a comprehension check, or another representation. The drawer header shows the human-readable course title instead of the internal slug. The composer keeps a compact footprint and opens an on-demand tabbed math input palette (Populer, Trig & Log, Kalkulus, Relasi & Himpunan, Yunani) that inserts symbols at the caret, plus background scroll lock so only the drawer scrolls.
- The `desmos` markdown block renders a local multi-expression graph editor at zero AI cost: each row accepts a bounded function of `x` or a named point such as `A = (1, 2)`, rows can be added or removed inline, points are drag-editable on the plot, the vertical domain auto-fits the content, and invalid rows are flagged without blocking valid ones.
- Static Zyra entry points use one application-owned hexagonal `Z` mark across the sidebar, material selection, mistake feedback, and drawer fallback. The mark does not reuse the generic four-point sparkle associated with other AI products. Drawer sizing uses labeled `Perbesar` and `Kecilkan` controls on desktop.
- When the pet capability is enabled, the course launcher becomes a draggable fox-like Zyra companion with ears, tail, paws, face, and state-specific expressions. Thinking, listening, uploading, explaining, checking, success, confusion, rest, and error are communicated through its eyes, mouth, status glyph, accessible label, and semantic color. A murid can place it within the viewport, click it to open chat, hide it, and restore it from a compact character control. Position and visibility persist in browser storage.
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
- Study groups use a semester session quota model rather than pure calendar duration:
  - Paket Reguler: 15 sessions per semester (target 1x per week).
  - Paket Intensif: 30 sessions per semester (target 2x per week).
  - Paket Super Intensif: 45 sessions per semester (target 3x per week).
  - Paket Kustom: Configurable session quota.
- Admin portal (`/admin/groups`) provides comprehensive management:
  - KPI strip for total groups, active groups, enrolled students, and average quota usage.
  - Interactive table filtering by status, package tier, and course.
  - Create and edit dialogs with package selection, semester dates, and course assignments.
  - Group detail modal with session quota gauges, student membership manager (search, add, remove, promote leader), linked activation tokens, and booked tutor session history.
- Student portal (`/dashboard/groups`) provides a dedicated study group dashboard:
  - Active group overview with status and semester badges.
  - Quota and session tracker displaying completed sessions, remaining quota, target weekly frequency, and visual usage progress.
  - Associated courses grid with direct navigation to class materials, quizzes, and tryouts.
  - Peer study mates roster with roles (leader, member) and joined dates.
  - Group session booking and schedule history integrated with the tutor scheduling calendar.
  - 1-click token sharing for inviting group mates when capacity remains.
  - Empty state with instant token redemption for new students.

### Scheduling & Calendar System (Model Kelompok Belajar)

- Group Ownership & Collaborative Booking:
  - Tutoring sessions are booked on behalf of Study Groups.
  - All group members have equal rights to choose, move, or cancel slots before the weekly lock cut-off.
- Weekly Lock & Automated Cut-Off:
  - Next week's scheduling selection opens throughout the current week and automatically locks every Saturday at 23:59 WIB (Asia/Jakarta).
  - Post-lock schedule adjustments require formal Reschedule or Cancellation tickets.
- Google Meet Automation:
  - Online sessions automatically provision dedicated Google Meet spaces upon booking and lock cut-off, with meeting links immediately rendered for tutors and students.
  - Offline sessions require tutors to specify explicit physical room or branch locations.
- Pre-Session & Post-Session Workflows:
  - Pre-Session: Any group member can define the discussion topic and upload question files (PDF/images), with uploader identity logged.
  - Post-Session: Tutors mark sessions complete, upload handwritten photo notes or answer PDFs, and embed external links with automated OpenGraph metadata previews.
- Reschedule, Cancellation, and Discussion Threads:
  - Post-lock ticket requests open an integrated discussion chat between group members, the tutor, and administrators.
  - The assigned tutor holds sole approval authority. Approval migrates the booking to the proposed slot and regenerates Meet links; cancellations forfeit the week's quota without refund.
- Audit Trail & Activity Log:
  - Every card displays a last-modified indicator: "Terakhir diubah oleh: [Nama Murid], [Hari, Tanggal, Jam]".
  - A chronological audit trail records slot selections, migrations, pre-session uploads, and ticket decisions.
- Multi-Level Filter System:
  - Student: Filter by Course and Tutor.
  - Tutor: Filter by Course or Study Group.
  - Admin: Full filtering by Course, Tutor, Study Group, and Schedule Type (Ujian Resmi ITB, Tryout, Kuis, Sesi Tatap Muka).

### Zyra tutor and admin copilots

- `FEATURE_ZYRA_TUTOR_COPILOT_V1` and `FEATURE_ZYRA_ADMIN_COPILOT_V1` expose scoped proposal-first workflows. They show evidence, preconditions, impact, warnings, and lifecycle state before any future mutation integration.
- Proposals never auto-apply. The current mutation call fails closed until the accepted mutation boundary is available.

### Zyra operations

- `FEATURE_ZYRA_AI_OPS_V1` exposes admin-only privacy-safe operational metrics. It separates Zyx-recorded usage from configured limits and marks external provider usage unknown when no authoritative balance exists.
- Metrics use the Asia/Jakarta day boundary and expose deduplicated quota, provider, cache, image, assessment, telemetry, and proposal alerts. Each alert carries a rollback flag and a versioned runbook reference; no raw learner or provider payload is shown.

### Student Feature Usage Monitor

- `/admin/ops/feature-usage` is a tutor/admin read model that ranks student feature activity (materials, flashcards, self quizzes, assessments v2, live quizzes, Zyra chat) over a 7/30/90-day window selector.
- It aggregates existing domain tables only (`student_material_progress`, `flashcard_reviews`, `student_quiz_attempts`, `percobaan_asesmen`, `live_quiz_results`, `tutor_chat_messages`/`chat_sessions`); it writes no new events. Unique active students are the union of distinct student ids across those sources.
- The page lists measurement gaps explicitly: daily pop-up quiz stays in localStorage, Cmd+K search records no server events, and diktat download counts are cumulative only. Page traffic remains in Web Analytics; AI token usage remains in Analitik Zyra.

## Money & Quota Rules

- AI quota spent only on: tutoring, mistake feedback, content generation
- Streaks, recommendations, study paths, reflections ; all deterministic SQL
- Students capped at 30 AI requests/day
- KV writes capped at 900/day; reads unrestricted
