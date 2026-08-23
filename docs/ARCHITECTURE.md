# Zyx Academy Architecture (vNext)

**Stack:** Next.js 16 (App Router), Drizzle ORM + SQLite (dev) / Turso (prod), Better-Auth, Gemini AI via Cloudflare AI Gateway, canonical Cloudflare Vectorize (vector search), Cloudflare R2 with UploadThing as a compatibility fallback (storage abstraction), Inngest (background jobs), Firebase Cloud Messaging (push notifs), Cloudflare Workers (vector API, realtime, diktat renderer)

---

## 1. Core Philosophy & 4-Layer Design

Every content asset exists in one of four layers, from source to student-facing product:

```
 Human Artifacts     ; Original PDFs in R2 (archival/student reference only)
 Canonical Content   ; Verified Markdown documents (source of truth)
 Structured Knowledge ; Derived objects (KOs, assessment objects, profiles, policies)
 AI Products         ; Compiled interactive assets (popovers, flashcards, quizzes, diktats)
```

- **Layer 1 ; Human Artifacts**: Original PDFs uploaded to Cloudflare R2 solely for archival and student reference. AI systems do not parse them directly.
- **Layer 2 ; Canonical Content**: Verified Markdown documents stored in Turso. Two types: *Learning Canonical* (`calculus_chapter_4.md`) and *Assessment Canonical* (`uts_2024.md`). These are the official academic sources of truth.
- **Layer 3 ; Structured Knowledge**: Automatically extracted from Canonical Content. Includes Knowledge Objects (concept graph, flashcards, Zyra context), Assessment Objects (structured questions, difficulty, patterns), Assessment Profiles (dynamic summary metrics), and Course Policies (static teacher-defined rules).
- **Layer 4 ; AI Products**: Compiled interactive assets served to students ; interactive popovers, flashcards, printable diktats, quiz questions.

---

## 2. Content Hierarchy (Core Domain)

```
Course (courses)
 └── Chapter (chapters) ; ordered by orderIndex
      ├── Knowledge Object (knowledge_objects) ; typed: definition|formula|example|misconception|exercise|summary|objective|concept_overview
      │    ├── has concept (concepts) via conceptId ; canonical cross-course concept
      │    │    └── localizations (concept_localizations) ; id/en display names + aliases
      │    ├── belongs to MTD (master_teaching_documents) via mtdId
      │    │    └── MTD has type: "learning" | "assessment"
      │    ├── feeds into → website_materials (compiled chapter material)
      │    ├── feeds into → ai_question_bank (questions tagged to KO)
      │    ├── feeds into → flashcards (per KO flashcards)
      │    ├── feeds into → knowledge_relationships (prerequisite/related/extends graph)
      │    ├── feeds into → vector_sync_queue (canonical Vectorize sync)
      │    └── feeds into → learning_events (mastery tracking)
      ├── Website Material (website_materials) ; 1 per chapter, compiled from KOs
      │    └── Versions (website_material_versions) ; edit history
      ├── Flashcard Set (flashcard_sets) ; 1 per chapter, generated from KOs
      │    └── Flashcards (flashcards) ; individual front/back cards
      ├── Diktat (diktats) ; compiled PDF, references MTD
      ├── Student Progress (student_chapter_progress) ; per-student unlock/completion
      ├── AI Generation Job (ai_generation_jobs) ; tracks Gemini work
      └── Course Materials (course_materials) ; uploaded PDFs (materi_kelas / contoh_soal)

Assessment-specific (for type="assessment" MTDs):
 └── Assessment Object (assessment_objects) ; parsed from assessment canonical
      ├── questionType, difficulty, pattern, reasoningType, estimatedSteps
      ├── concepts (json array of concept references)
      └── feeds into → assessment_profiles (per-course rollup)
           └── course_policies (teacher-defined constraints)
```

### Key relations:

- **Course → Chapter → Knowledge Object (KO)**: The fundamental hierarchy. KOs are the atomic unit of knowledge.
- **Master Teaching Document (MTD)**: Source-of-truth with `type: "learning" | "assessment"`. Learning MTDs produce KOs; Assessment MTDs produce `assessment_objects`. Dual-hashing (`sourceHash`, `derivedHash`) tracks changes.
- **Chapter → Website Material**: Exactly one material per chapter, compiled from the chapter's KOs by Gemini.
- **Chapter → Flashcard Set**: Exactly one flashcard set per chapter, generated from KOs.
- **Concept** (canonical) ↔ **Concept Localizations** (id/en): A concept can span multiple courses/chapters. KOs reference concepts for cross-course mastery tracking.
- **Assessment Profile**: One per course, automatically computed from all `assessment_objects`. Drives quiz generation alongside `course_policies`.

---

## 3. Database Schema ; All Tables

### Auth Domain (Better-Auth)
| Table | Purpose |
|---|---|
| `user` | Better Auth users and temporary legacy `role` compatibility projection |
| `email_notification_preferences` | Per-user master optional-email state and four global email categories |
| `session` | Auth sessions |
| `account` | OAuth/password accounts |
| `verification` | Email verification tokens |
| `pengguna` | Canonical one-to-one domain identity for a Better Auth user |
| `peran` | Stable access-role catalog: `admin`, `tutor`, `murid` |
| `pengguna_peran` | Independent many-to-many identity membership with source and audit actor |

Admin and tutor layout gates read `pengguna_peran` as the canonical authorization source. The legacy `user.role` column remains as a compatibility projection during expand and rollback.

### Course & Enrollment
| Table | Purpose |
|---|---|
| `courses` | Course catalog ; title, category (enum of ~55 majors), description |
| `enrollments` | User→Course with expiry date (semester lock) |
| `groups` | Student groups (batch/class cohorts) |
| `group_members` | User→Group M:N |
| `enrollment_tokens` | Pre-generated tokens with capacity & expiry, bound to a group |
| `enrollment_token_courses` | Token→Course M:N (which courses the token unlocks) |

### Canonical Source and Idea Architecture

Plan 003 adds an additive Indonesian learning-domain layer. `mata_kuliah` and `bab` provide stable course and chapter identities while retaining legacy compatibility references. `sumber_materi` and `potongan_sumber` version canonical source content and exact source spans. `ide` is the future learning atom; it keeps stable identity, semantic and generation hashes, provenance policy, and no provider-specific vector ID.

| Table | Purpose |
|---|---|
| `mata_kuliah` | Stable course identity with legacy `courses` reference |
| `bab` | Stable ordered chapter identity with legacy `chapters` reference |
| `pendaftaran_murid` | Murid enrollment identity linked to `pengguna` and legacy enrollment |
| `penugasan_tutor` | Course tutor assignment with explicit scope and legacy assignment reference |
| `sumber_materi` | Versioned canonical source metadata and checksum |
| `potongan_sumber` | Exact source content spans, offsets, checksums, and embedding eligibility |
| `ide` | Course and chapter learning atom with optional global concept link |
| `asal_ide` | Idea to source-chunk provenance with exact offsets and source checksum |
| `relasi_ide` | Typed Idea relations with database self-edge protection and application cycle checks |
| `ketergantungan_produk` | Polymorphic downstream dependency freshness state |
| `peta_id_legacy` | Deterministic legacy-to-target identity mapping and checksums |

The existing `concepts` and `concept_localizations` tables remain the global cross-course concept registry. Canonical Idea callers are active; existing KOs and source pipelines remain readable through compatibility mappings.

### Canonical Vector Identity

Plan 012 uses `canonical-content-v2` with Gemini Embedding 2 at 768 dimensions and cosine distance. The database entity ID remains unchanged in Vectorize metadata so Turso hydration can address the original row. When an entity ID contains a colon, the ID segment inside `v2:<entityType>:<entityId>:<version>` is URI-encoded and decoded by the shared contract; simple IDs retain their readable form. The Worker and application contract must use the same reversible encoding, and the decoded ID must match metadata exactly.

Canonical hydration batches `/v2/get` requests at 20 IDs per call to respect the Vectorize provider limit.

### Product, Assessment, and Mastery Architecture

Plan 004 adds the normalized Indonesian product and learner-state layer as empty additive tables. Existing English product, assessment, attempt, flashcard, learning-event, and mastery tables remain active; deterministic mapping and backfill are deferred to Plan 005.

| Domain | Target tables | Contract boundary |
|---|---|---|
| Products | `artikel`, `artikel_ide`, `blok_artikel`, `diktat_materi`, `diktat_ide`, `soal`, `soal_ide`, `soal_relasi_ide`, `pembahasan_soal`, `diktat_pembahasan`, `item_diktat_pembahasan` | Published products require published Idea links; question Idea weights are positive and validated to sum to one. |
| Protected references and flashcards | `soal_itb_referensi`, `benchmark_soal`, `set_flashcard`, `flashcard`, `flashcard_ide`, `kemajuan_flashcard_murid`, `review_flashcard` | Holdout references carry an explicit visibility state; review history is append-only by data model. |
| Assessments | `blueprint_asesmen`, `asesmen`, `cakupan_asesmen`, `item_asesmen`, `percobaan_asesmen`, `jawaban_murid` | Quiz scope is one chapter; tryout scope is one or more chapters; rendered content and grading snapshots are required. |
| Evidence and mastery | `bukti_ide_jawaban`, `bukti_pembelajaran`, `pemahaman_ide`, `perubahan_pemahaman`, `rekomendasi_flashcard` | Score and confidence remain separate; ambiguous evidence cannot affect mastery; replay metadata makes the state reproducible. |
| Bundle lifecycle | `impor_bundle`, `item_impor_bundle`, `review_bundle`, `publikasi_bundle`, `audit_mutasi` | Product bundles expose only draft, published, and withdrawn; review rows remain internal evidence. |

Plan 005 backfills the supported legacy shapes into these targets without deleting or rewriting source rows. Exact evidence is copied to target links; ambiguous questions, unattributable learning events, legacy concept baselines, and compatibility-only history are preserved in the exception ledger. Product, assessment, and per-Idea learning callers are now canonical and always-on; legacy rows remain readable for compatibility.

### Canonical question authoring boundary

Manual and Markdown question authoring at `/admin/ai/questions` resolves the selected legacy or canonical course to `mata_kuliah` and validates the optional `bab`. `soal_ide` is optional for this authoring boundary. When links are supplied, the service rejects duplicates, unpublished Ideas, course or chapter mismatches, and weights that do not sum to one. A single transaction writes the versioned `soal` row, zero or more weighted `soal_ide` rows, and `pembahasan_soal`; the same canonical ID is projected to `ai_question_bank` so existing quiz readers continue to work during the compatibility period. Draft, in-review, published, and retired transitions are synchronized when admins update the compatibility review status. A question without Idea links remains usable by compatibility quiz readers but produces no per-Idea mastery evidence until an exact published link exists.

### Per-Idea Mastery Learning Loop

Plan 011 computes mastery from verified, attributable evidence only. The pure engine applies evidence contribution, weight where available, confidence, evidence source policy, and recency to the score. Confidence is calculated independently from effective count, source diversity, recency, and agreement. Every stored state records `algorithmVersion` and `inputWatermark`; every changed state appends a `perubahan_pemahaman` row with the complete evidence ID list and reason code. Full and incremental replays use the same engine and are idempotent.

Legacy concept mastery remains a compatibility fallback only when no Idea state exists and an explicit concept mapping is supplied. It is labelled `concept-level baseline` and is never copied to an Idea. Flashcard scheduling remains SM-2 based; per-Idea mastery changes recommendation priority and reason codes, and canonical recommendations suppress cards at score 80 or higher. `mastery/idea-recompute.requested.v1` is the versioned deterministic event boundary and does not call Gemini.

### Legacy Backfill and Compatibility Boundary

The migration uses `lib/migrasi/backfill-engine.ts` in bounded transactions and records every source-to-target identity in `peta_id_legacy`. Rows that cannot be represented without inventing semantics are kept in `legacy_backfill_exceptions` with a source checksum, reason code, preservation path, and cutover blocking flag. A second apply is a read-and-compare operation for mapped rows and writes zero changed rows.

Current mutations write canonical targets transactionally while preserving legacy rows and snapshots for compatibility:

```mermaid
flowchart LR
    L[Legacy mutation] --> T[One database transaction]
    T --> LL[Legacy row remains preserved]
    T --> C[Compatibility repository]
    C --> N[Additive Indonesian target]
    C --> A[audit_mutasi]
    R[Existing reads] --> LL
```

The boundary covers material publication, flashcard review, quiz attempt start and submission, learning events with exact Idea identity, enrollment, tutor assignment, and Tutorial PKA progress. Target failures roll back the transaction. Compatibility reads remain available for historical rows, while new writes use the canonical repository.

Plan 005 staging evidence is stored at `artifacts/staging-overhaul/20260803-plan005-legacy-backfill/plan-005-result.json`.

### Idea Bundle V2 Workflow

Plan 006 adds a strict ZIP boundary around the additive source and Idea domain. The upload path validates archive structure, manifest checksums, source spans, entity references, stable keys, provenance, and relation acyclicity before any canonical row is written. The compact upload dialog keeps the first analysis request non-persistent, then creates the staged artifact and inventory after the admin confirms the upload action.

```mermaid
flowchart LR
    U[Admin ZIP upload dialog] --> V[Secure ZIP and contract validation]
    V --> I[impor_bundle and item inventory]
    I --> L[Filtered review inventory]
    L --> D[Dedicated Idea detail route]
    D --> R[Tutor or admin review]
    R --> A[Admin approval]
    A --> P[One Turso publication transaction]
    P --> M[Source, chunk, Idea, provenance, relation rows]
    P --> O[vector_sync_queue outbox]
    P --> X[audit_mutasi and publikasi_bundle]
```

`impor_bundle` stores the checksum identity, legacy course association, and immutable validation report. `review_bundle` stores one immutable decision per reviewer. Publication is idempotent and compares existing target versions field by field; conflicts fail rather than overwrite. The transaction also inserts deterministic vector jobs for embedding-eligible source chunks and published Ideas. The Idea Bundle workflow is always-on, while the legacy importer remains the rollback path.

The admin presentation boundary for this workflow is split into `/admin/materials/review` and `/admin/materials/manual`. The Review page contains separate `Source Pack + Idea` and `Product` tabs, a filtered inventory, and a compact upload dialog. Artifact cards use stored creation time, requested-by identity, and course association as the primary review context; bundle IDs and checksums remain secondary technical details. Review actions navigate to dedicated `/admin/materials/review/idea/[slug]` or `/admin/materials/review/product/[slug]` pages, where the three-step indicator, focused one-item editing, product-family separation, relation and dependency context, KaTeX previews, reviewer notes, server-side draft reconstruction, and lifecycle actions live. The Upload Manual page contains the paginated Source Pack handoff and the preserved Context Pack export as internal process choices.

Plan 006 staging evidence is stored at `artifacts/staging-overhaul/20260803-plan006-bundle-v5/plan-006-result.json`, with an independent database reconciliation at `artifacts/staging-overhaul/20260803-plan006-bundle-v5/plan-006-reconcile.json`.

### Authoring Context Pack V1

The admin authoring page now has two explicit handoff stages. Before Ideas exist, a non-persistent boundary validates a Source Pack, analyzes source sections, resolves active course and chapter options from `mata_kuliah` and `bab`, validates a complete admin mapping, and returns one Authoring Job Pack. The job embeds source bytes, schema contracts, product choices, and privacy-safe attribution sentinels. No raw ID entry, R2 write, or database write occurs in this preparation stage.

```mermaid
flowchart LR
    U[Source Pack upload] --> V[Secure in-memory validation]
    V --> M[Course and chapter selection]
    M --> P[Section mapping and product choices]
    P --> J[Authoring Job Pack download]
    J --> I[External Idea authoring]
    I --> R[Admin review and Idea publication]
```

After Ideas are published, Plan 007's read-only explicit allowlist projection begins with published current Ideas and active source excerpts, joins only safe educational metadata, counts holdout benchmark rows, scans the projected object, then stores a private run-scoped ZIP. Each allowed benchmark projection keeps its benchmark ID distinct from the linked ITB reference ID and exact source label. This lets Product authoring emit a publishable citation without exposing the protected question or answer snapshot. The server generates snapshot and run identities for browser requests while preserving optional explicit values for controlled scripts.

```mermaid
flowchart LR
    Q[Admin export request] --> S[Typed DB snapshot]
    S --> A[Allowlist projection]
    A --> R[Redaction and holdout scan]
    R --> Z[Deterministic ZIP and checksum]
    Z --> K[Private R2 staging key]
    Z --> L[audit_mutasi with retention]
```

The exporter does not call an external model and never includes user, credential, attempt, answer, mastery, chat, embedding, signed URL, or holdout content. The Context Pack workflow is always-on and admin-only; tutor access remains disabled until a separate assigned-course policy test is added.

The private download route resolves an audited pack ID to its exact R2 key, checks retention, and streams the ZIP only to an authenticated admin with `private, no-store` caching. Every pack carries generated JSON Schemas for both bundle families and a deterministic external-authoring workflow. Privacy-safe `$UPLOADER` and `$APPROVING_REVIEWER` sentinels are resolved only inside the atomic publication transaction.

The Context Pack export is presented inside `/admin/materials/manual` under `Lanjutkan dari Idea terbit`. The UI exposes course labels, creation time, retention, checksum, and a direct download action while keeping raw pack IDs and R2 keys secondary.

The Authoring Job Pack contract is documented in `docs/bundle/authoring-job-pack-v1.md`. Product authoring still requires a fresh Authoring Context Pack after official Idea publication; the initial job never substitutes local candidate Idea identities for canonical ones.

### Provider-neutral Authoring MCP

The first MCP boundary is a stateless Streamable HTTP adapter at `/api/mcp/authoring`. It creates a fresh MCP server per request and calls repository validators rather than duplicating bundle rules. Any MCP host can discover the same tools, including Gemini, Claude, and ChatGPT integrations.

```mermaid
flowchart LR
    H[Gemini, Claude, or ChatGPT host] --> M[Authenticated MCP endpoint]
    M --> W[Workflow registry]
    W --> S[Source Pack validator and quality report]
    W --> B[Idea and Product validators and quality gates]
    W --> Q[Quiz draft validator]
    B --> R[Existing admin review boundary]
    Q --> R
    R --> P[Admin publication]
```

`workflow.list` returns only `idea_product` and `quiz_bank`; there is no combined option and no product-family selection. The agent receives course and chapter choices as signed opaque keys. After `workflow.start`, the signed run token carries the locked scope and Source Pack checksum without exposing internal course or chapter IDs. `source.ingest` requires original binaries outside the ZIP so the server can independently verify `originalSha256`. Canonical quality modules under `lib/authoring/quality/` produce structured technical and content reports. Idea validation checks source coverage and duplicate candidates; Product validation checks published Idea scope, fresh dependencies, Article and Diktat density, and provenance. Idea and Product submission tools revalidate and reuse `stageIdeaBundle` and `stageProductBundle`, so only green artifacts appear in the existing review inventory. MCP authentication is login-aware: Better Auth sessions are accepted directly for same-origin requests, while remote MCP clients use the OAuth discovery and PKCE authorization-code flow. The resulting short-lived access token contains the authenticated user and Better Auth session identity; every request rechecks that the session is live and the user is an active admin. A compatibility connection endpoint can issue a per-session bearer token after an admin login. In `quiz_bank`, `assessment.list_ideas` returns published Ideas for the locked scope. `question-bank-draft.v2` accepts zero or more Idea links per question and all linked weights must sum to one. Validation and submission reuse `lib/question-authoring.ts`; submission writes deterministic canonical questions, optional links, solutions, compatibility projections, and audit rows with `reviewStatus=generated`. Legacy `quiz-bank-draft.v1` remains accepted and its Knowledge Object scope is validated. Retries with unchanged content are idempotent and conflicting reuse of a deterministic question ID fails closed. MCP has no publication tool; the existing UI and publication services remain the source of truth for edits, review, and publication.

### Product Bundle V2

Product Bundle V2 extends the additive product tables with a strict three-state lifecycle. `lib/bundle/product-validator.ts` validates the manifest and typed entity files without database writes. External authoring emits draft entities. The first admin upload returns a browser-held editable projection with full product previews and dependency mapping. `lib/bundle/product-draft.ts` applies only allowed editable fields to the original validated bundle, refreshes content hashes, Article to Diktat lineage, dependency hashes, file checksums, and the bundle checksum, then validates the reconstructed ZIP. `lib/bundle/product-staging.ts` stores the confirmed ZIP and inventory with status `draft`.

Publication in `lib/bundle/product-publication.ts` is a single transaction. It verifies published Idea versions and semantic hashes, active source versions and excerpts, resolved creator and curator identities, dependency freshness, and typed product references before inserting article, diktat, question, solution, flashcard, blueprint, dependency, publication, audit, and canonical vector outbox rows. Product validation also runs the existing strict Article compiler gate, enforces one-Idea flashcards, normalized Idea weights, deterministic typed question options, exactly one solution per question, complete multi-Idea relations, required ITB source identity, allowed ITB curation references, and mandatory Article to Diktat lineage dependencies. Every Product Bundle question is written as `itb_example`; the source event must match the allowed `soal_itb_referensi.source_label`. The same transaction projects the question into `ai_question_bank` so legacy quiz and tryout assembly can use it. Correct-answer markers remain in the private grading representation but are stripped from runtime hydration and vector payloads. Version greater than one uses a versioned physical target ID so the prior published row is not overwritten.

```mermaid
flowchart LR
    U[Admin ZIP upload] --> V[Pure typed validation]
    V --> P[Editable content and traceability preview]
    P --> F[Server merge, hash refresh, and revalidation]
    F --> S[Draft import]
    S --> R[Admin preview and edit]
    R --> C{Dependencies current}
    C -->|No| H[Needs review]
    C -->|Yes| T[Atomic publication transaction]
    T --> O[Product rows and vector outbox]
    T --> A[Publication and mutation audit]
    T --> W[Audited withdrawal]
```

The public lifecycle is `draft -> published -> withdrawn`. A draft may be replaced in place by the same bundle ID or deleted. Publishing creates or refreshes an internal approved review record as accountability evidence and commits canonical products atomically. Published bundles cannot be replaced or deleted. Withdrawal retains rows and audit history, marks learner-facing products inactive, and queues removal for vectorized article, question, and solution content. The Product Bundle workflow is always-on. Legacy assessment import remains available as a rollback path, while changed legacy Assessment Bundle sources are now written as new source versions instead of overwriting the prior source. Runtime vector jobs are limited to `published_articles`, `published_questions`, and `published_solutions`; there is no generic `product` namespace.

The Product review inventory uses `/admin/materials/review`, while detail review uses `/admin/materials/review/product/[slug]`. Product-family tabs prevent a generated Article, Diktat, question, or solution from being presented as one unstructured vertical stream. Preview content uses the shared `MathText` KaTeX renderer, including formula-only fields that arrive without delimiters.

Question provenance crosses the compatibility boundary as data, not presentation-only state. `soal` and `ai_question_bank` store `origin`, `source_event_name`, and `source_reference_id`. Quiz attempts, tryout submissions, PKA attempts, and live quiz sessions carry the same fields in JSON snapshots. `QuestionSourceCitation` is the shared student renderer and shows a lower-right source line only for `itb_example`. The admin question bank exposes origin filtering, while the tutor tryout action copies a published bank question and its provenance into the per-exam question snapshot.

External authoring has three active MCP instruction skills under `plugins/zyx-authoring-mcp/skills`: `zyx-source-pack-mcp`, `zyx-idea-bundle-mcp`, and `zyx-product-bundle-mcp`. They guide the agent through Source Pack, Idea, and Product workflows while MCP calls canonical repository quality modules. The prior `source-pack-translator`, `zyx-idea-authoring`, and `zyx-product-authoring` directories remain migration references only. Product authoring requires published Idea identity and fresh dependency checks, preventing unpublished candidate Ideas from leaking into products. It copies ITB questions from the Source Pack, matches the exact event label to an allowed context reference, and never substitutes a benchmark ID for the dedicated source reference ID. Preference profiles do not alter source truth, schemas, or quality gates and create no additional pack lifecycle.

### Article and Diktat Quality Compiler

The Plan 009 compiler is a deterministic boundary over the staged Product Bundle representation. It does not call Gemini and does not invent canonical claims.

```mermaid
flowchart LR
    I[Approved Ideas and source refs] --> B[Typed article block contract]
    R[Idea prerequisite relations] --> O[Stable topological outline]
    B --> Q[Article quality gates]
    O --> Q
    Q --> A[Article AST and Markdown]
    A --> D[Approved article compression]
    D --> G[Diktat compression gates]
    Q --> P[Traceable admin preview]
    G --> P
```

`lib/materials/article-contract.ts` requires block purpose, covered Ideas, source references, generation hash, and reviewer state. `lib/materials/quality-gates.ts` returns stable reason codes and fails closed for missing coverage, stale dependencies, invalid math delimiters, missing traces, and rejected blocks. `lib/materials/diktat-contract.ts` accepts an approved `ArticleDocument` only; it records the source article ID, version, and hash and checks that every preserved core statement, formula, Idea, and source trace remains present.

The article quality gate is always applied by `lib/material-storage.ts` during review and publication. Existing `website_materials` readers and rollback data remain unchanged.

### Assessment Integrity V2

Assessment compilation is a deterministic boundary between authored content and a published attempt:

```mermaid
flowchart LR
    I[Idea and question candidates] --> B[Versioned blueprint]
    B --> R[Exact dimension rounding]
    R --> S[Seeded eligible selection]
    S --> V[Solver, critic, and stale checks]
    V --> H[Benchmark and holdout policy]
    H --> P[Published assessment snapshot]
    P --> A[Stable option ID attempt]
    A --> E[Versioned per-Idea evidence rubric]
```

Quiz scope is exactly one chapter. Tryout scope contains one or more chapters. Every dimension is rounded independently with the largest-remainder method, and the selected item count equals the requested count. Stable option IDs are stored in the V2 attempt snapshot; the server may accept legacy numeric input but resolves it to stable IDs before grading.

The active-attempt serializer is an explicit allowlist. It can expose prompt, options, safe metadata, and stable option IDs, but never answer keys, explanations, grading rubrics, evidence mappings, or holdout content. Objective evidence uses a deterministic rubric. Free-response evidence is blocked until a tutor rubric or grading result is reviewed.

### Legacy quiz to Idea evidence bridge

The compatibility submit route keeps the legacy quiz as the source of the user-visible grade. When the four canonical rollout flags are enabled, it performs an exact lookup of every snapshot question against published `soal` rows and published `soal_ide` links. Only a complete, unambiguous mapping writes `item_asesmen`, `jawaban_murid`, and `bukti_ide_jawaban` rows. Multi-Idea answers create one weighted evidence row per Idea. Free-response answers remain `needs_review` and do not affect mastery. Stable IDs mirror the legacy backfill identity rules, and repeated submission writes are conflict-safe.

### Tutor & Booking
| Table | Purpose |
|---|---|
| `tutor_courses` | Which courses a tutor can teach |
| `tutor_slots` | Weekly availability (dayOfWeek, startTime, endTime) |
| `bookings` | Student→Slot, unique per slot (FCFS) |

### Legacy Exams (pre-v4)
| Table | Purpose |
|---|---|
| `exams` | Quiz/tryout, draft/published/ended |
| `questions` | Per-exam questions (JSON blob approach) |
| `submissions` | Student exam submissions with snapshots |
| `progress` | Legacy material progress tracking |

### AI Content Ecosystem (vNext)

#### MTD & Extraction
| Table | Purpose |
|---|---|
| `master_teaching_documents` | Source-of-truth markdown, versioned, `type: learning|assessment`, `sourceHash`, `derivedHash`, status: draft/active/archived |
| `ai_extraction_failures` | Logs of failed Gemini extraction/canonicalization/validation steps |

#### Knowledge Architecture
| Table | Purpose |
|---|---|
| `knowledge_objects` | Atomic learning unit ; typed, bloom-leveled, difficulty, importance, linked to concept + MTD + chapter |
| `knowledge_relationships` | KO→KO edges: prerequisite, related, extends, example_of, misconception_of |
| `concepts` | Canonical cross-course concept registry (slug-based) |
| `concept_localizations` | id\|en display names + aliases + embeddings per concept |
| `concept_graph_edges` | Rollup: concept→concept edges for the graph visualization |

#### Assessment Architecture
| Table | Purpose |
|---|---|
| `assessment_objects` | Extracted assessment metadata per MTD: questionType, difficulty, applicationLevel, pattern, reasoningType, estimatedSteps, concepts |
| `assessment_profiles` | One per course: difficultyDistribution, commonPatterns, topContexts ; automatically computed from assessment_objects |
| `course_policies` | One per course: maxApplicationLevel, maxEstimatedSteps, forbiddenContexts, allowedPatterns ; teacher-defined |

#### Published Assets
| Table | Purpose |
|---|---|
| `website_materials` | Compiled chapter material ; canonicalMarkdown + structuredContent (AST JSON) + termIndex, generationHash, isStale, slug |
| `website_material_versions` | Edit history with author tracking |
| `flashcard_sets` | Per-chapter flashcard sets, hash-versioned, sourceMtdId, isStale |
| `flashcards` | Front/back/explanation, linked to KO |
| `diktats` | Compiled PDF study guides, Puppeteer-generated, hash-versioned |
| `course_materials` | Uploaded PDFs (materi_kelas / contoh_soal), linked to chapters |

#### AI Generation
| Table | Purpose |
|---|---|
| `ai_material_instances` | Legacy material metadata (pre-v4, deprecated in favor of KO flow) |
| `ai_material_instance_sections` | Legacy sections |
| `ai_material_instance_chunks` | Legacy text chunks retained for read-only compatibility |
| `ai_generation_jobs` | Tracks Gemini generation: pending→processing→completed→failed, token counts |
| `ai_question_bank` | Permanent question repository: classifies Zyx originals and ITB examples, stores the ITB event and reference when applicable, and remains linked to KO/MTD with generationHash, distractorMap, bloomLevel, pattern, estimatedSteps, and isStale |
| `question_option_stats` | Per-option selection counters for distractor analytics |
| `ai_usage_events` | Token usage per user per feature per model |
| `ai_generation_traces` | Privacy-safe AI execution provenance traces (hashes, versions, tokens, violations, latency, terminal outcome) |

#### Quiz System
| Table | Purpose |
|---|---|
| `quiz_templates` | Legacy compatibility projection of canonical `asesmen` and `blueprint_asesmen`: selection rules, time limits, category (daily/weekly/chapter/premium) |
| `student_quiz_attempts` | Per-student quiz session with deep question/answer snapshots, masteryBefore snapshot, strong/weak areas (dual-written to `percobaan_asesmen`) |
| `attempt_feedback` | Per-question feedback payloads |
| `live_quiz_sessions` | Real-time tutor-led quiz (code, state: lobby→question→reveal→ended) |
| `live_quiz_results` | Per-student results for live quizzes |

#### Vector Sync
| Table | Purpose |
|---|---|
| `vector_sync_queue` | Transactional outbox for canonical Vectorize sync; upsert/delete, retry with backoff, namespace, version, and content hash |

#### Mastery & Analytics
| Table | Purpose |
|---|---|
| `learning_events` | Append-only event log: quiz_answer, flashcard_review, material_completed, tutor_question |
| `student_concept_mastery` | Per (student, course, concept) mastery score + confidence + trend |
| `student_concept_mastery_history` | Daily snapshots for trend computation |
| `student_streaks` | Current/longest streak tracking |
| `daily_recommendations` | Per-student daily payload with completed items tracking |
| `tutor_session_summaries` | Aggregated per (student, course) tutor chat context |
| `tutor_chat_messages` | Per-message history (capped at 100 per student×course) |
| `study_paths` | Personalized study path JSON |
| `course_analytics_snapshots` | Daily per-course pre-computed analytics |
| `student_flashcard_progress` | SM-2 spaced repetition per (student, flashcard) |
| `interventions` | Active intervention flags per student×concept |
| `weekly_reflections` | Weekly learning reflection payloads |

#### Concept Graph (Assessment EIF E5)
| Table | Purpose |
|---|---|
| `concept_graph_edges` | Concept-level prerequisite/related graph edges |

#### Mastery Recompute
| Table | Purpose |
|---|---|
| `mastery_recompute_queue` | Async mastery recomputation queue |

#### Learning Outcomes (Accreditation)
| Table | Purpose |
|---|---|
| `learning_outcomes` | CPL/CPMK/Sub-CPMK hierarchy |
| `learning_outcome_concepts` | Outcome to concept mapping |

#### Career Paths
| Table | Purpose |
|---|---|
| `career_path_templates` | Career-oriented learning path templates |
| `career_path_concepts` | Career path to concept mapping |

#### PKA Campaign
| Table | Purpose |
|---|---|
| `pka_simulation_stages` | Subject/stage to quiz mapping (matematika, fisika, kimia) |
| `pka_stage_progress` | Per-student PKA stage gating state |
| `pka_announcements` | Admin broadcast announcements |
| `pka_schedules` | Google Meet review session schedules |
| `pka_registrations` | Gated enrollment intake form |

#### Content Quality
| Table | Purpose |
|---|---|
| `content_quality_flags` | Auto-detected quality flags: too_easy, too_hard, dead_distractor |

#### Blog & Short Links
| Table | Purpose |
|---|---|
| `blog_articles` | Blog system (tips_kuliah, pojok_kampus, fakta_seru, kegiatan_zyx) |
| `short_link` | URL shortener (zyxacademy.com/s/[slug]) |
| `page_analytics` | GA4 popular pages cache |

#### Admin Drive
| Table | Purpose |
|---|---|
| `drive_item` | Legacy read-only file pointers (folder\|file, uploadthingKey, ufsUrl, mimeType, sizeBytes); no longer surfaced in the admin UI. R2 browsing moved to the admin Media page "Storage R2" tab |

#### Push Notifications
| Table | Purpose |
|---|---|
| `user_push_tokens` | FCM device tokens per user |
| `notifications` | In-app notification log (quiz_published, flashcard_reminder, tutor_reminder, etc.) with persisted FCM delivery stats (`attempted`, `succeeded`, `failedCount`, `sentAt`) |

---

## 4. Upload & Ingestion Pipeline (vNext)

```
Upload PDF via direct R2 (structured object keys)
  │
  ├──→ Admin Media (/admin/media) ; "Storage R2" tab is a read-only browser over domain prefixes
  │
  ├──→ Create Master Teaching Document (MTD)
  │    ├── Select type: "learning" or "assessment"
  │    ├── Upload markdown content
  │    └── Pre-ingestion canonical validation (lib/canonical-validator.ts)
  │         ├── Validates heading hierarchy
  │         ├── Checks custom container syntax
  │         ├── Validates KaTeX compilation
  │         └── Fails early if structure is malformed
  │
  ├── type="learning" → KO Extraction Pipeline (lib/ko-extractor.ts, lib/knowledge/*)
  │    ├── Stage 1: Source normalization & hashing (`lib/knowledge/chunker.ts`)
  │    ├── Stage 2: Deterministic semantic chunking preserving math, code, tables & headings without 30k char truncation
  │    ├── Stage 3: Per-chunk candidate KO & Learning Objective extraction (`lib/knowledge/candidate-extractor.ts`)
  │    ├── Stage 4: Cross-chunk deduplication preserving all source spans (`lib/knowledge/candidate-reconciler.ts`)
  │    ├── Stage 5: Canonical resolution checking exact names, aliases & flagging high embedding similarity as ambiguous (`lib/knowledge/canonicalizer.ts`)
  │    ├── Stage 6: Deterministic validation & run state assignment (`staged`, `accepted`, `needs_review`, `failed`) (`lib/knowledge/extraction-run.ts`)
  │    ├── Stage 7: Atomic accepted-run persistence using stable identity keys (`lib/knowledge/identity.ts`)
  │    ├── Source spans tracked in `knowledge_object_sources` & cognitive objectives in `learning_objectives`
  │    ├── Concept resolution (`concepts` / `concept_localizations`)
  │    ├── `vector_sync_queue` populated (namespace: "learning")
  │    └── Inngest background job syncs to canonical Vectorize `canonical_ideas`
  │
  └── type="assessment" → Assessment Extraction Pipeline (lib/assessment-extractor.ts)
       ├── Deterministic split on H2 headings → question blocks
       ├── Gemini classifies each block (questionType, difficulty, pattern, etc.)
       ├── Computes sourceHash + derivedHash
       ├── Writes assessment_objects rows
       ├── Updates assessment_profiles rollup for the course
       └── vector_sync_queue populated (namespace: "assessment")

Storage Services (abstracted via lib/storage/index.ts):
 ─ UploadThing: Browser file upload (dev fallback)
 ─ R2 (@aws-sdk/client-s3): Production object storage
 ─ STORAGE_PROVIDER_MODE env var controls routing
```

---

## 5. AI Generation Pipeline

### A. Question Generation (Pedagogical Pipeline)
```
Tutor clicks "Generate Questions" (/admin/ai/questions)
  → startGenerationJob() in generation-pipeline.ts
      ├── Creates question_generation_runs audit record (status: processing)
      ├── Blueprint Engine (lib/questions/blueprint.ts)
      │    └── Produces per-slot specs: KO ID, learning objective, cognitive process, target difficulty, reasoning pattern, targeted misconceptions
      ├── Gemini generates draft candidate options with stable option IDs (opt_0..opt_3)
      ├── Application Option Shuffle (lib/questions/option-shuffle.ts)
      │    └── Shuffles options deterministically with seed; recomputes correctIndices and stable IDs
      ├── Distractor Provenance Engine (lib/questions/distractor-provenance.ts)
      │    └── Maps non-correct options with targeted misconception family, method, score, and uncertainty state
      ├── Validation & Policy Gates (lib/question-validator.ts, lib/pedagogical-validator.ts)
      │    ├── Checks KaTeX syntax, duplicate options, and position leakage phrases
      │    ├── Checks forbiddenContexts, maxApplicationLevel, maxEstimatedSteps, allowedPatterns
      │    └── Rejects non-compliant questions
      ├── Inserts into ai_question_bank (status: generated, qualityScore: null [unverified], generationRunId linked)
      ├── Inserts into distractor_provenance table
      └── Updates question_generation_runs status: completed / partial / failed
```

### B. Website Material Generation
```
Tutor clicks "Generate Material" (for a chapter)
  → generateMarkdownForChapter() in material-generator.ts
      ├── Fetches course + chapter + all active KOs ordered by learningOrder
      ├── buildMaterialGenerationPrompt() → constructs Gemini prompt
      │    └── Precise custom markdown containers: :::learning_objective, :::concept, :::formula, :::example, :::misconception
      ├── Gemini returns canonical markdown
      ├── saveWebsiteMaterial() in material-storage.ts
      │    ├── compileMarkdownToAST() → parses custom containers into structured AST
      │    ├── validateAST() → Zod validation of AST structure
      │    ├── buildTermIndex() → extracts terms for interactive popover
      │    ├── buildConceptGraph() → concept graph edges
      │    ├── Writes website_materials row with generationHash
      │    └── Writes website_material_versions row
      └── Website material appears in course portal
```

### C. Flashcard Generation
```
Tutor generates flashcards per chapter
  → generateFlashcardsForChapter() in flashcard-generator.ts
      ├── Fetches KOs for the chapter
      ├── Gemini generates front/back/explanation for each KO
      ├── Creates flashcard_sets + flashcards rows (generationHash, sourceMtdId)
      └── Students review via SM-2 scheduler (student_flashcard_progress)
```

### D. Diktat (PDF) Generation
```
Tutor compiles diktat in /admin/ai/diktats
  → diktat-generator.ts
      ├── Fetches MTD content + chapter selections
      ├── Puppeteer renders markdown → PDF (via Railway service: DIKTAT_RENDERER_URL)
      ├── Uploads to R2 (via lib/storage)
      └── Creates diktats row with fileUrl, generationHash
```

### E. Canonical Vector Sync
```
Any canonical Idea, article, question, solution, or source update → vector_sync_queue row
  → Inngest background function (vectorSyncWorker) processes batches:
      ├── Fetch pending queue items per namespace, retrying failed rows
      ├── Embed with Gemini Embedding 2 through canonical-content-v2 at 768 dimensions
      ├── Upsert to the authenticated `/v2/*` Vectorize worker contract
      ├── Canonical namespaces: canonical_ideas, published_articles, source_materials, itb_question_references, published_questions, or published_solutions
      ├── Preserve provider-neutral metadata, version, access class, and content hash
      └── Mark queue completion only after the canonical mutation succeeds
```

---

## 6. Student Learning Flow

```
Student redeems enrollment token
  → group_members + enrollments created
  → Dashboard (/dashboard) shows:
     ├── Active classes with progress bars
     ├── Daily recommendations (daily_recommendations)
     ├── Weak concepts (student_concept_mastery)
     ├── Streak info (student_streaks)
     └── Quick links to materials/quizzes/flashcards

  → Course Portal (/courses/[id]):
     ├── Material viewer ; renders website_materials (markdown + AST)
     │    └── Interactive popover on terms (termIndex → concept lookup)
     ├── Quiz player ; selects questions from ai_question_bank via quiz_templates.selectionRules
     │    ├── Creates student_quiz_attempts with question snapshot + masteryBefore
     │    ├── API answer redaction: GET /api/quiz/attempts & GET /api/quiz/attempts/[id] redact correct_indices & stored explanations during in_progress attempts
     │    ├── Auto-grades MC, flags essays as pending_review
     │    ├── Records learning_events for mastery update
     │    └── Shows results with mistake feedback (attempt_feedback)
     ├── Tryout ; timed exam mode
     ├── Flashcards ; SM-2 spaced repetition (student_flashcard_progress)
     ├── Live quiz ; join via code, real-time leaderboard (WebSocket/SSE via zyxrealtime Worker)
     ├── AI Tutor ; Gemini chat with canonical Vectorize retrieval, Query Action Router (`lib/tutor/query-action.ts`), and Tier 1 Cache Isolation (`lib/tutor/cache-contract.ts`)
     │    ├── Typed Query Actions: `retrieve`, `reuse_previous_evidence`, `answer_from_conversation`, `clarify`
     │    ├── Style modifier extraction (`simpler`, `analogy`, `worked_example`, `graph`, `flowchart`, etc.) applied post-retrieval
     │    ├── Student-free Tier 1 shared KV payload: zero student ID, session ID, or history in cached data (`assertNoStudentTextInSharedCache`)
     │    ├── Deterministic cache keys: incorporates academic content query hash, prompt version, policy version, schema version, and `evidenceVersion` digest
     │    └── Governed by Assessment Assistance Policy (`lib/assessment-assistance-policy.ts`) ; forbids direct answer reveals during active attempts
     ├── Tutor Booking ; book slots from tutor_slots
     ├── Leaderboard ; per-course ranking
     └── My Results ; attempt history + mastery graph

Mastery System (background, Inngest cron):
  learning_events → student_concept_mastery recomputed
  → student_concept_mastery_history (daily snapshots)
  → interventions (if mastery drops)
  → daily_recommendations (personalized next steps)
  → study_paths (personalized learning path)
  → weekly_reflections (weekly summary via Gemini)
```

---

## 7. Key Services Integration

| Service | Usage |
|---|---|
| **Next.js 16** | App Router, Server Actions, React Server Components |
| **Drizzle ORM** | SQLite (dev via `file:dev.db`) / Turso (prod via `@libsql/client`), schema in `db/schema.ts` |
| **Better-Auth** | Auth: credentials + Google OAuth, role-based (admin/teacher/student) |
| **Gemini** (`@google/genai`) | Text generation plus the fixed Gemini Embedding 2 canonical-content-v2 profile at 768 dimensions |
| **Cloudflare AI Gateway** | All Gemini requests routed through gateway for caching, rate limiting, observability |
| **Cloudflare Vectorize** | Canonical vector store through `zyx-vector-api`, profile `canonical-content-v2`, 768 dimensions, cosine metric, versioned IDs, and allowlisted metadata |
| **Cloudflare R2** | S3-compatible object storage for diktat PDFs, long-term assets, course materials (via `lib/storage/index.ts`) |
| **Cloudflare KV** | AI response cache (used by AI tutor for repeated questions) |
| **Cloudflare Workers** | Four Worker packages: `zyx-vector-api` (Vectorize proxy), `zyxrealtime` (live quiz WebSocket/SSE), `zyxacademydiktat` (Puppeteer PDF, hosted on Railway, local copy in `workers/diktat-renderer`), and the staging-only Zyra control plane (`workers/zyra-control-plane`) |
| **UploadThing** | Browser file uploads (dev fallback); production prefers direct R2 via storage abstraction |
| **Inngest** | Background job orchestration: vector sync (learning + assessment namespaces), generation pipelines, mastery recompute, assessment ingest, analytics snapshots, weekly reflections |
| **Firebase Admin** | FCM push notifications |
| **Puppeteer** | PDF generation for diktats (runs as separate Railway service at `DIKTAT_RENDERER_URL`) |
| **Resend** | Essential and preference-gated optional emails |
| **Sentry** | Error tracking |

Optional application emails enter through `lib/email-preferences/send.ts`. The always-on sender resolves the authenticated account email, reads the global preference row or the legacy PKA fallback, suppresses disabled categories, and adds a 30-day signed unsubscribe contract. The visible `/unsubscribe` route confirms before changing state. `POST /api/email/unsubscribe` implements RFC 8058 one-click unsubscribe for the token category. Preference lookup failure suppresses optional delivery. Essential transactional senders remain outside this optional boundary.

---

## 8. Directory Map

The app uses Next.js route groups. Admin routes live under `app/(admin)/admin/` and student surfaces under `app/(student)/`, so the group parentheses do not appear in URLs.

```
app/
├── (marketing)/           ; Public marketing site (about, plans, testimonial, blog)
├── (student)/             ; Student portal
│   ├── courses/[id]/      ; Course portal (material, quiz, tryout, flashcard, live, mastery, path, leaderboard, my-results)
│   ├── dashboard/         ; Student hub (active classes, weak concepts, recommendations)
│   ├── profile/           ; User profile
│   └── settings/          ; User settings
├── (murid)/               ; Canonical murid read model
├── (tutor)/               ; Tutor portal
├── (admin)/admin/
│   ├── (academic)/        ; Courses, groups, tokens, materials (+ manual, review), schedules, notifications, bundles, authoring-context, tutorial-pka
│   ├── (content)/         ; Assessments, diktats, AST inspector
│   ├── (eval)/            ; Questions, quizzes, quiz-insights, jobs, distractors, leaderboard
│   ├── ops/               ; Flags, keys, analytics, short-links, web-analytics
│   ├── blog/              ; Blog management
│   ├── forms/             ; Form Studio & Visualizer (builder, presets, spreadsheet export)
│   ├── media/             ; Media Library (R2 shared media browser, upload, preview)
│   ├── meet/              ; Meet Studio (sessions, hosts, co-hosts, invited emails)
│   └── tautan/            ; Tautan (important links manager)
├── api/
│   ├── uploadthing/       ; UploadThing route handler
│   ├── inngest/           ; Inngest serve endpoint
│   ├── admin/             ; Admin API routes (materials, canonical validation, type selection)
│   ├── mcp/authoring/     ; Provider-neutral Authoring MCP endpoint
│   ├── quiz/              ; Quiz submission endpoints
│   └── storage/           ; R2 signed URLs
├── f/[slug]/              ; Shared Form / Meet slug resolver
├── tautan/                ; Public link page
└── s/[slug]/              ; Short links

lib/
├── db/                  ; Database client & schema
├── ai/                  ; AI utilities & analytics
├── storage/             ; Storage abstraction (UploadThing + R2 providers)
├── zyra/                ; Zyra runtime: provider router, cache, pedagogy, canvas, images, proposals, ops, runtime-env
├── asesmen/             ; Assessment blueprints, evidence rubric, benchmark policy (canonical)
├── authoring/           ; Authoring Context Pack snapshot, projection, redaction, export
├── bundle/              ; Idea and Product Bundle validators, staging, publication, drafts
├── migrasi/             ; Legacy backfill engine and identity mapping
├── questions/           ; Blueprint engine, option shuffle, distractor provenance
├── knowledge/           ; KO extraction stages (chunker, candidates, reconciler, canonicalizer, runs)
├── materials/           ; Article contract, quality gates, diktat compression, compiler
├── email-preferences/   ; Optional email preference resolution and send boundary
├── vectorize/           ; Canonical Vectorize contracts and outbox processing
├── notifications/       ; Server-side FCM delivery layer, payload builders, shared types
│
├── (AI Core)
│   ├── gemini.ts                ; Gemini provider (generateContentWithFallback, embedText)
│   ├── ai-router.ts             ; Use-case → model routing with fallback chains
│   ├── canonical-validator.ts   ; Pre-ingestion markdown structure validation (vNext)
│   ├── assessment-extractor.ts  ; Assessment MTD parsing & classification (vNext)
│   ├── pedagogical-validator.ts ; Policy-guarded question validation (vNext)
│   ├── question-blueprint-engine.ts ; Per-KO blueprint generation (vNext)
│   ├── question-validator.ts    ; Structural validation of generated questions
│   ├── distractor-mapper.ts     ; Maps wrong options to misconception KOs
│   ├── generation-pipeline.ts   ; Question generation orchestration
│   ├── question-authoring.ts    ; Canonical-first manual and Markdown question authoring
│   ├── ko-extractor.ts          ; KO extraction from learning-type MTDs
│   ├── ko-utils.ts              ; Shared utilities (repairJson, slugify, etc.)
│   ├── material-generator.ts    ; Website material generation (Gemini → markdown)
│   ├── material-storage.ts      ; Save compiled material + AST + versioning
│   ├── flashcard-generator.ts   ; Flashcard generation
│   ├── flashcard-scheduler.ts   ; SM-2 scheduling engine
│   ├── question-generator.ts    ; Question generation + validation
│   ├── diktat-generator.ts      ; PDF compilation via Puppeteer
│   ├── ingestion-parser.ts      ; Markdown → sections → chunks
│   ├── markdown-compiler.ts     ; Custom markdown → AST parser
│   ├── ast-validator.ts         ; Zod AST validation
│   ├── term-index.ts            ; Build interactive term index
│   ├── graph-trace.ts           ; Concept graph construction
│   └── tutor/                   ; V2 Tutor Pipeline
│       ├── cache-contract.ts    ; Student-free Tier 1 shared KV cache key & assertion contract
│       └── query-action.ts      ; Deterministic & AI follow-up Query Action Router

├── (Vector & Search)
│   ├── vector-store.ts          ; Canonical Vectorize store and read-only rollback seam
│   ├── vectorize-client.ts      ; Canonical Cloudflare Vectorize client
│   └── context-assembly.ts      ; RAG context assembly for AI tutor

├── (Jobs)
│   ├── inngest.ts               ; Inngest client
│   └── inngest-functions.ts     ; Background job handlers (vector sync, assessment ingest, mastery, etc.)

├── (Learning Analytics)
│   ├── mastery-store.ts         ; Mastery score computation
│   ├── learner-profile.ts       ; Student profile aggregation
│   ├── recommendation-service.ts ; Daily recommendations
│   ├── intervention-service.ts  ; Intervention generation
│   ├── mistake-feedback.ts      ; Per-question mistake analysis
│   ├── reflection-service.ts    ; Weekly reflection generation
│   ├── streak-service.ts        ; Streak computation
│   ├── study-path-service.ts    ; Personalized study paths
│   └── cohort-analytics.ts      ; Cohort-level analytics

├── (Infrastructure)
│   ├── drive.ts                 ; Admin drive folder/file operations
│   ├── uploadthing.ts           ; UploadThing client components
│   ├── kv-cache.ts              ; KV cache wrapper
│   ├── env.ts                   ; Environment variables & feature flags
│   ├── feature-flags.ts         ; Admin flag catalog metadata (lib/feature-flags.ts)
│   ├── date-utils.ts            ; Date handling utilities (lib/date-utils.ts)
│   ├── google-sheets.ts         ; Spreadsheet export with fingerprint conflict detection
│   ├── google-meet.ts / google-forms.ts / google-drive-permissions.ts ; Google Workspace integrations
│   ├── auth.ts / auth-client.ts / auth-redirect.ts ; Auth helpers
│   ├── public-app-url.ts        ; Public URL helper
│   └── whatsapp-admin.ts        ; WhatsApp admin notifications
└── site.ts, site-search.ts, testimonials.ts, youtube.ts ; Static content
```

### Admin collaboration libraries

The shared `/f/[slug]` route preserves an existing active Form first, then resolves an active Meet session when no Form owns the slug. Both creation APIs check active records in `google_meet_sessions` and `custom_forms`, so a new slug cannot be assigned to both domains. Meet space creation enables moderation, provisions the signed-in creator and active admins as `COHOST` members, and provisions Restricted or Trusted invitees with `ROLE_UNSPECIFIED` through the Developer Preview v2beta member endpoint. The OAuth principal remains the meeting organizer.

Media uses the application-owned `media/` R2 prefix with nested virtual folders represented by `.keep` objects. Other canonical R2 domains remain read-only in the Media storage browser and can only be copied into `media/`. Tautan is a separate relational catalog in `important_links`; the feature flag gates both admin APIs and the public `/tautan` route.

---

## 9. Production Deployment Architecture

```
                    ┌─────────────────────────┐
                    │      Vercel (Next.js)     │
                    │  zyx-edu.vercel.app       │
                    │                           │
                    │  App Router + Server      │
                    │  Actions + API routes     │
                    └─────┬──────┬──────┬───────┘
                          │      │      │
          ┌───────────────┘      │      └───────────────┐
          ▼                      ▼                      ▼
   ┌──────────────┐    ┌────────────────┐    ┌──────────────────┐
   │  Turso DB     │    │  Cloudflare R2 │    │   Inngest Cloud  │
   │  (libsql)     │    │  (S3 API)      │    │  (bg jobs)       │
   │  zyx.soezyx.. │    │  zyx bucket    │    │                  │
   └──────────────┘    └────────────────┘    └────────┬─────────┘
                                                      │
                                                      ▼
                                          ┌─────────────────────┐
                                          │  Gemini AI (Google)  │
                                          │  via Cloudflare AI   │
                                          │  Gateway (caching)   │
                                          └──────────┬──────────┘
                                                     │
                          ┌──────────────────────────┼──────────┐
                          ▼                          ▼          ▼
               ┌──────────────────┐    ┌────────────────────┐
               │ Canonical Vectorize│    │ via zyx-vector-api │
               │ profile v2, 768  │    │  Worker            │
               │ course namespaces │    └────────────────────┘
               │ and versioned IDs │
               └──────────────────┘

Cloudflare Workers (deployed via wrangler):
  ├── zyx-vector-api     ; Vectorize upsert/query/delete proxy
  ├── zyxrealtime         ; Live quiz WebSocket/SSE server
  └── zyxacademydiktat    ; Puppeteer PDF renderer (hosted on Railway)
```

### Key Production Differences from Dev

| Aspect | Development | Production |
|---|---|---|
| **Database** | SQLite file (`dev.db`) | Turso (libsql, distributed SQLite) |
| **Object Storage** | R2 via `lib/storage/index.ts` (`STORAGE_PROVIDER_MODE`) | UploadThing compatibility fallback |
| **Vector Store** | Cloudflare Vectorize | canonical-content-v2, 768 dimensions |
| **AI Gateway** | Direct Gemini API | Cloudflare AI Gateway (rate limit, caching, observability) |
| **Auth URL** | `localhost:3000` | `BETTER_AUTH_URL` = production origin |
| **Diktat Renderer** | Mock PDF | Railway Puppeteer service at `DIKTAT_RENDERER_URL` |
| **Analytics** | None | Vercel Analytics + Speed Insights + Sentry |

### Feature Flags
Only explicitly approved optional capabilities remain runtime configurable. The approved catalog and activation semantics are documented in [DEVELOPMENT.md](./DEVELOPMENT.md#feature-flags). New capabilities are not required to use a flag; the always-on versus flag-gated decision must be confirmed before implementation when it is not already specified. Canonical content, assessment, authorization, retrieval, pedagogy, and learning foundations are always-on.

---

## 10. Data Flow Diagrams

### Content Creation Flow (Admin/Teacher)

```
Upload PDF/Markdown
   │
   ├──→ R2 via structured object keys (lib/storage/keys.ts)
   │    └──→ Admin Media (/admin/media) ; "Storage R2" tab = read-only browser over domain prefixes
   │
   └──→ Create MTD (type: "learning" | "assessment")
         │
         ├── Canonical Validation (canonical-validator.ts)
         │    └── Fails fast if structure invalid
         │
         ├── type="learning":
         │    ├──→ KO Extraction (Gemini → knowledge_objects)
         │    │      ├──→ Generate Website Material (Gemini → markdown → AST → website_materials)
         │    │      ├──→ Generate Flashcards (Gemini → flashcard_sets → flashcards)
         │    │      ├──→ Generate Questions (Gemini + Blueprint Engine + Pedagogical Validator → ai_question_bank)
         │    │      ├──→ Generate Diktat PDF (Puppeteer → R2)
         │    │      └──→ Vector Sync (Inngest → canonical Vectorize, namespace: "canonical_ideas")
         │
         └── type="assessment":
              └──→ Assessment Extraction (Deterministic split + Gemini classification)
                     ├──→ assessment_objects + assessment_profiles
                     └──→ Vector Sync (Inngest → canonical Vectorize, namespace: "published_questions")
```

### Student Interaction Flow

```
Student
  ├── Views Material → renders website_materials (markdown + AST + term popover)
  ├── Takes Quiz → quiz_templates × assessment_profile × course_policies → ai_question_bank
  │                  → student_quiz_attempts → learning_events
  │                  → mastery recompute → daily_recommendations update
  ├── Reviews Flashcards → SM-2 scheduler → student_flashcard_progress
  ├── AI Tutor Chat → tutor-rag.ts (canonical Vectorize similarity search, "canonical_ideas" namespace)
  │                    → tutor_chat_messages → tutor_session_summaries
  └── Live Quiz → WebSocket/SSE (zyxrealtime Worker) → live_quiz_sessions → live_quiz_results
```

---

## 11. Dual-Hashing & Staleness

All derived assets (website_materials, flashcard_sets, diktats, ai_question_bank) track their source MTD version via a dual-hashing system:

1. **`sourceHash`**: SHA-256 of the raw MTD markdown content. Changes when the source document is edited.

2. **`derivedHash`**: SHA-256 of active KOs' key attributes (for learning) or sorted question blocks (for assessment). Only changes when structured content actually shifts.

3. **Staleness cascade**: When MTD content changes:
   - `sourceHash` and `derivedHash` are recomputed
   - If `derivedHash` matches previous value → no regeneration needed (cosmetic edit only)
   - If `derivedHash` differs → downstream assets flagged `isStale = true`
   - `sourceMtdVersion` tracks which MTD version was used for each asset

This dual approach prevents unnecessary regeneration (e.g., fixing a typo in a paragraph does not invalidate flashcards derived from the same KOs).

## 12. Zyra Control Plane Foundation

The Zyra AI program owns a separate staging control plane. Plan 001 provisions the `zyx-zyra-control-staging` Worker with the SQLite-backed `ZyraQuotaCoordinator` Durable Object export, the existing `zyx-staging` KV namespace, a private R2 attachment bucket, a dedicated semantic-cache Vectorize index, and an Analytics Engine binding.

The Zyra semantic cache is `zyx-zyra-cache-staging` at exactly 768 dimensions with cosine distance. It is not the canonical `zyx-vectors-staging-v2` index and must never use either preserved 1024-dimensional rollback index. Learner attachments use the private `zyx-zyra-private-staging` bucket under `zyx-attachments/` with a seven-day lifecycle policy and no public domain.

Only `/health` is unauthenticated. Every other control-plane route requires the bearer secret `ZYRA_CONTROL_PLANE_TOKEN`. Health responses contain resource aliases and binding booleans only; they never expose credentials, namespace IDs, or learner data. Plan 001 has no database migration and does not change the existing realtime or canonical Vectorize Workers.

### Zyra model registry and provider adapters

Plan 002 keeps Gemini model identity, project-level limits, deadlines, capabilities, health gates, and embedding profiles in `lib/ai/provider/model-registry.ts`. Runtime calls cross one of two family-specific boundaries: the `models.generateContent` adapter for stable generation models, or the installed SDK `interactions.create` adapter for the 3.5 and 3.6 routes. GenerateContent traffic prefers Cloudflare AI Gateway. Interactions traffic uses the direct Google endpoint because the gateway provider path has a different endpoint contract. The adapters sanitize ordered text and inline image parts, enforce capability and byte limits, attach request deadlines, remove deprecated thinking configuration, and return typed retry classifications.

Tutor math presentation is enforced at two boundaries. Versioned grounded, ungrounded, and image prompts require equation-first Markdown with valid `$...$` and `$$...$$` delimiters. The pure `lib/tutor/math-markdown.ts` normalizer adds delimiters only to bounded common raw equation shapes and is applied before persistence output composition and drawer rendering, including restored history. Existing LaTeX, inline code, and fenced code are protected from rewriting.

The canonical `canonical-content-v2` profile and the separate `zyra-semantic-cache-v1` profile both use Gemini Embedding 2 at exactly 768 dimensions, but use different task instruction versions and index aliases. Neither profile can access the other index, and Embedding 001 is legacy provenance only. Preserved 1024-dimensional vectors remain rollback-only. The model registry is the default provider route; route selection is controlled only by the retained provider-router capability flag.

### Zyra distributed quota coordinator

Plan 003 keeps the four project aliases and model limits in the Plan 002 registry contract, then generates the Worker-facing serializable model contract from it. A single SQLite-backed `ZyraQuotaCoordinator` Durable Object owns daily project-model counters, minute buckets, lease transitions, circuit state, health samples, idempotency, and privacy-safe transition telemetry. The lease lifecycle is `reserved`, `dispatched`, then exactly one terminal result: `committed`, `refunded`, `expired_refunded`, or `expired_committed`.

Reservation and counter updates occur in one Durable Object SQLite transaction. A reserved lease is the only state that can be refunded; a dispatched lease is conservatively committed when it expires because the provider may have received the request. Project selection filters quarantine, circuit, RPM, and effective per-project daily ceilings, then uses deterministic utilization and least-recent-use ordering. Stored records contain no prompt, answer, API key, raw project number, or raw user ID. Only a SHA-256 user hash and bounded telemetry dimensions are persisted.

### Zyra application allowance ledger

Plan 004 adds `ai_allowance_leases` as an additive application-side lease ledger. It resolves the active compatibility role from `pengguna` and `pengguna_peran`, reserves before provider dispatch, and transitions through `reserved`, `dispatched`, `committed`, or `refunded`. A bounded fallback chain shares one application lease. Successful responses commit it; terminal provider failures explicitly refund it, while each provider-side attempt remains in the control-plane ledger. Provider units and interaction units are tracked separately so cache hits and deterministic actions count toward abuse protection without spending a provider turn.

The ledger is enabled only by `FEATURE_ZYRA_ALLOWANCE_V2`. Existing `ai_usage_events` and `ai_generation_traces` remain readable and are not backfilled. Committed leases write a derived compatibility event using the lease ID as the idempotency key; the staging reconciliation script repairs a missing derived event without changing the authoritative lease. The authenticated allowance route returns only the current session actor's summary and never enumerates users.

Allowance ownership is exclusive. `PromptExecutor` owns the lease on the legacy provider path, while Request Lifecycle owns it when Provider Router V2 is active. The same request must never reserve at both layers. Multimodal routing remains a premium model classification, but murid and tutor premium ceilings match their published provider-turn ceilings so image support has no smaller hidden daily balance.

### Zyra privacy-safe semantic cache

Plan 006 adds a profile-free cache above provider dispatch. The exact identity includes canonical course and Idea versions, evidence, policy, schema, language, route, assessment mode, visual capability, and embedding profile; learner identity, mastery, history, offsets, and API aliases are excluded. The application passes the same safe identity to AI Gateway, while a Durable Object single-flight gate ensures one provider reservation for simultaneous identical misses.

Validated shared scaffolds are stored in the staging Worker KV binding and may be indexed only in the separate `zyx-zyra-cache-staging` 768-dimensional cosine index under `zyra-semantic-cache-v1`. Vector metadata contains no response text or learner fields. Semantic candidates are filtered by server-owned scope and revalidated against the exact metadata and hydrated KV payload before reuse. Personalization is composed after the shared scaffold, and the daily KV write policy stops at 900 writes while reads continue.

### Zyra pedagogical harness

Plan 007 makes teaching behavior application-owned. A deterministic planner selects one state from orientation, diagnosis, explanation, bounded hint sequence, teach-back, check, or clarification using the request mode, evidence sufficiency, assessment policy, learner response shape, and prior hint level. The model receives only the selected state and hydrated evidence. Its typed response separates observed facts from diagnosis hypotheses, requires canonical citations for substantive claims, allows at most one checkpoint, and records the next allowed action and assessment reason code.

Active assessment policy is enforced before prompt composition and again during response validation. Invalid shape, citation, visual claim, unsupported diagnosis, pipeline-language, or answer-safety output becomes a typed rejection followed by deterministic safe composition. The prompt contract uses one total model attempt and keeps shared cache payloads profile-free. Canonical retrieval remains the source of truth.

The legacy tutor route distinguishes evidence grounding from learning scope. Empty retrieval and deterministic `none` coverage invoke one uncited general-knowledge teaching call for school, university, technical, academic-skill, exam-preparation, and study-method questions. The response states the course-material boundary and remains subject to assessment output validation. Out-of-scope requests receive a short learning redirection. If the grounded model itself rejects weak evidence, its uncited general explanation is retained instead of being replaced by a hard refusal, without adding a second provider call.

### Zyra evidence-based personalization

Plan 008 adds additive `zyra_learning_events`, `zyra_learner_profiles`, and `zyra_learner_preferences` tables. Events use a strict allowlist of bounded event kinds, outcomes, latency buckets, hint levels, representations, weights, and optional opaque evidence references. Raw chat, assessment answers, and sensitive traits are not ingested into the profile. Events expire, queries are scoped by murid and course, and a learner reset moves the profile watermark forward without deleting historical evidence.

The aggregator is deterministic. It requires at least three recent events for inference, keeps uncertain fields as `unknown`, records evidence count, confidence, expiry, and reason codes, and stores inferred fields separately from explicit presentation preferences. Explicit preferences can select pace, representation, explanation length, or checkpoint type, but cannot change canonical content, grades, mastery, or assessment policy. The personalization layer is always-on.

Personalization is composed after shared-cache retrieval. The Tier 1 scaffold is asserted profile-free before caching, while the adaptation decision remains in the current learner response only. A failure to load or aggregate the profile falls back to the grounded base answer, so personalization cannot make the tutor less safe or less evidence-grounded.

### Zyra typed Learning Canvas

Plan 009 adds `lib/zyra/canvas` as the application-owned visual protocol. A canvas spec is a discriminated, versioned object with a bounded visual type, purpose, learner-safe alt text, optional canonical claim references, controls, and an accessible fallback table or explanation. Claim references are required by policy for grounded model claims. Function expressions are parsed into an allowlisted AST supporting only numeric constants, declared variables, arithmetic, and bounded approved functions. No model-provided JavaScript, HTML, SVG markup, or unrestricted diagram language is executed.

`LearningCanvasRenderer` keeps control values and editable expressions in local component state. Function and data plots render through custom SVG surfaces with labeled adaptive axes, hover crosshair tooltips, reference axes, zero crossings, and semantic theme tokens. Plots are directly manipulable in the client: drag pans, scroll or pinch zooms around the pointer, and double-click restores the fitted view. Sampling, reset, invalid-expression handling, and table fallback use local computation and make no provider or network call. Structured function plots normalize common Gemini equation notation before semantic validation and persistence. The tutor harness renders exactly one visual per answer: the validated `canvasSpec` from the model's structured output channel. It never synthesizes a canvas from prose, so an answer without a structured spec has no interactive visual. Legacy persisted answers containing markdown visual blocks still render through the backward-compatible renderer. The Learning Canvas layer is always-on.

Legacy graph blocks remain readable for historical and ungrounded responses, but their expressions are normalized and evaluated by the bounded Learning Canvas expression AST. The compatibility parser accepts plural and singular function fields plus inline or expanded domains. A failed expression renders an explicit learner-facing error instead of an empty plot.

The course shell renders a draggable pet launcher as part of the always-on murid experience. `ZyraCharacter` is an application-owned fox-like SVG companion whose ears, tail, paws, facial expression, and bounded status glyph are derived from the typed `ZyraPetState`; it does not execute or render provider-authored SVG. Its clamped viewport position and visibility preference are browser-local presentation state. They are not sent to the server or learner profile. Quiz-review page context is resolved server-side from the authenticated route, student, and course. Only a bounded title and prompt list enters the tutoring request, and any response using this attempt-specific context bypasses shared cache reads and writes.

Staging shadow mode is an explicit internal execution mode, not a public feature flag. It requires `ZYX_ENVIRONMENT=staging` and an exact match with `STAGING_ZYRA_PEDAGOGY_USER_ID`. The legacy and candidate generations run beside one another with one attempt each; only the legacy answer is returned. Learner summary and learning-event writes are suppressed, while comparison metadata stores only hashes, stable outcomes, state, hint level, violation codes, counts, and an opaque trace ID. Synthetic review output is available only to the local staging runner and is not added to the application response.

The runner renders a self-contained local HTML review page. Candidate and baseline output are escaped before insertion, no external resources are loaded, and the browser hashes the human reviewer identity before producing a submission. The strict validator requires the submitted case set to exactly match the generated draft and writes a final aggregate-only artifact. Raw answers and raw reviewer identity are excluded from the final release-gate result.

Canonical hydration and retrieval now wrap course lookup, enrollment lookup, vector query, and database hydration in one fail-closed boundary. Database and provider details are never logged. A failure returns the stable `CANONICAL_RUNTIME_UNAVAILABLE` reason and an empty evidence result, preventing a raw `DrizzleQueryError` from becoming a non-JSON application failure.

### Zyra private multimodal path

Plan 010 adds an authenticated attachment boundary. Browser files are checked by declared type and bounded source size, decoded with `sharp`, rotated, resized to a maximum 2048 px dispatch edge without enlargement, re-encoded without source metadata, and stored under an opaque date-scoped key. The database record binds owner, course, session, expiry, sanitizer version, dimensions, and sanitized hash. Private reads recheck the full scope immediately before dispatch. Image turns pass ordered text and inline image parts to a visual-capable registry route, bypass shared exact and semantic caches, and use one bounded attempt. Expiry blocks reads before storage lifecycle timing, while the sweeper converges storage and row state without exposing a public URL.

When the chat exchange is persisted, each attachment is linked to its authenticated student message through `zyra_message_attachments.message_id`. History hydration returns only bounded preview metadata, never bytes or object keys. The drawer builds a scoped private route URL for thumbnail and dialog preview reads. Provider errors and allowance rejection remain distinct terminal states in the tutor response.

An image turn bypasses text-only Vectorize retrieval and page-context injection. Its sanitized attachments and current learner text are the primary problem statement for the visual provider, so semantically similar course questions cannot replace the uploaded exercise or introduce unrelated source links. Clipboard images enter the same private upload, authorization, sanitization, and dispatch path as file-picker images.

### Zyra murid experience

Plan 011 composes the existing tutor drawer with an authenticated allowance summary, bounded selection-to-ask context, the Plan 010 attachment composer, local Learning Canvas controls, and an application-owned SVG character pet. The pet state is derived from upload, request, response, quota, and error state, then represented through bounded facial expressions, glyphs, and accessible labels. Public flags are independent, so text tutoring remains available when image input, pet, or selection actions are disabled.

The drawer exposes direct resize and viewport expansion controls. Grounded turns retain the Plan 007 typed pedagogy path. A no-evidence turn uses a separate bounded general-teaching contract with a learning goal and one checkpoint because it cannot claim canonical grounding.

### Proposal-first copilots

Plan 012 separates deterministic facts, labeled interpretation, and typed operations. Tutor and admin surfaces can create and review scoped proposals, but no model output is executed as SQL, a command, a URL, or arbitrary JSON. A proposal records evidence references, preconditions, learner impact, reversibility, expiry, diff hash, validator result, and lifecycle events. The current apply boundary fails closed until the approved mutation service is integrated.

### Zyra operational truth

Plan 013 stores fixed-column operational events and derives admin metrics from the allowance ledger, attachment records, generation traces, and versioned model limits. It uses the Asia/Jakarta calendar boundary, exposes deduplicated alert codes with rollback flags and versioned runbook references, and distinguishes configured limits, Zyx-recorded usage, active reservations, cache activity, and external provider usage that is unknown. Murid and tutor views remain actor-scoped. Raw prompts, responses, image data, object keys, and raw identity do not enter the telemetry table.

### Release verification boundary

Plan 014 is a masked verifier that inventories predecessor artifacts, approved optional flags, staging fingerprints, worktree state, and the approved request cap. Synthetic-only execution writes a blocked result when any release gate is absent. It does not deploy, migrate, change rollout settings, call a provider, or authorize production.
