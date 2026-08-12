# Zyx Academy Architecture (vNext)

**Stack:** Next.js 16 (App Router), Drizzle ORM + SQLite (dev) / Turso (prod), Better-Auth, Gemini AI via Cloudflare AI Gateway, canonical Cloudflare Vectorize (vector search), UploadThing / R2 (storage abstraction), Inngest (background jobs), Firebase Cloud Messaging (push notifs), Cloudflare Workers (vector API, realtime, diktat renderer)

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
| `session` | Auth sessions |
| `account` | OAuth/password accounts |
| `verification` | Email verification tokens |
| `pengguna` | Canonical one-to-one domain identity for a Better Auth user |
| `peran` | Stable access-role catalog: `admin`, `tutor`, `murid` |
| `pengguna_peran` | Independent many-to-many identity membership with source and audit actor |

`FEATURE_PERAN_V2=1` makes the admin and tutor layout gates read `pengguna_peran`. The legacy `user.role` column remains during expand and rollback; it is not the canonical authorization source when the flag is enabled.

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

The existing `concepts` and `concept_localizations` tables remain the global cross-course concept registry. `FEATURE_ARSITEKTUR_IDE_V1` stays off until a later plan switches callers; existing KOs and source pipelines are not backfilled or rewritten here.

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
| Bundle lifecycle | `impor_bundle`, `item_impor_bundle`, `review_bundle`, `publikasi_bundle`, `audit_mutasi` | Bundle identity is checksum-versioned and publication references an approved review. |

Plan 005 backfills the supported legacy shapes into these targets without deleting or rewriting source rows. Exact evidence is copied to target links; ambiguous questions, unattributable learning events, legacy concept baselines, and compatibility-only history are preserved in the exception ledger. `FEATURE_PRODUK_IDE_V1`, `FEATURE_ASESMEN_IDE_V1`, and `FEATURE_PEMAHAMAN_IDE_V1` remain absent or `0` in staging until their later canary gates pass.

### Per-Idea Mastery Learning Loop

Plan 011 computes mastery from verified, attributable evidence only. The pure engine applies evidence contribution, weight where available, confidence, evidence source policy, and recency to the score. Confidence is calculated independently from effective count, source diversity, recency, and agreement. Every stored state records `algorithmVersion` and `inputWatermark`; every changed state appends a `perubahan_pemahaman` row with the complete evidence ID list and reason code. Full and incremental replays use the same engine and are idempotent.

Legacy concept mastery remains a compatibility fallback only when no Idea state exists and an explicit concept mapping is supplied. It is labelled `concept-level baseline` and is never copied to an Idea. Flashcard scheduling remains SM-2 based; per-Idea mastery changes recommendation priority and reason codes, and canonical recommendations suppress cards at score 80 or higher. `mastery/idea-recompute.requested.v1` is the versioned deterministic event boundary and does not call Gemini.

### Legacy Backfill and Compatibility Boundary

The migration uses `lib/migrasi/backfill-engine.ts` in bounded transactions and records every source-to-target identity in `peta_id_legacy`. Rows that cannot be represented without inventing semantics are kept in `legacy_backfill_exceptions` with a source checksum, reason code, preservation path, and cutover blocking flag. A second apply is a read-and-compare operation for mapped rows and writes zero changed rows.

Current mutations remain legacy-first and are wrapped by one transaction when both `FEATURE_ARSITEKTUR_IDE_V1=1` and `FEATURE_DUAL_WRITE_IDE=1` are enabled:

```mermaid
flowchart LR
    L[Legacy mutation] --> T[One database transaction]
    T --> LL[Legacy row remains authoritative]
    T --> C[Compatibility repository]
    C --> N[Additive Indonesian target]
    C --> A[audit_mutasi]
    R[Existing reads] --> LL
```

The boundary covers material publication, flashcard review, quiz attempt start and submission, learning events with exact Idea identity, enrollment, tutor assignment, and Tutorial PKA progress. Target failures roll back the legacy mutation. With either flag disabled, the compatibility repository is a no-op and visible reads and writes stay on the legacy model.

Plan 005 staging evidence is stored at `artifacts/staging-overhaul/20260803-plan005-legacy-backfill/plan-005-result.json`.

### Idea Bundle V2 Workflow

Plan 006 adds a strict ZIP boundary around the additive source and Idea domain. The upload path validates archive structure, manifest checksums, source spans, entity references, stable keys, provenance, and relation acyclicity before any canonical row is written.

```mermaid
flowchart LR
    U[Admin ZIP upload] --> V[Secure ZIP and contract validation]
    V --> I[impor_bundle and item inventory]
    I --> R[Tutor review]
    R --> A[Admin approval]
    A --> P[One Turso publication transaction]
    P --> D[Source, chunk, Idea, provenance, relation rows]
    P --> O[vector_sync_queue outbox]
    P --> X[audit_mutasi and publikasi_bundle]
```

`impor_bundle` stores the checksum identity, legacy course association, and immutable validation report. `review_bundle` stores one immutable decision per reviewer. Publication is idempotent and compares existing target versions field by field; conflicts fail rather than overwrite. The transaction also inserts deterministic vector jobs for embedding-eligible source chunks and published Ideas. `FEATURE_IDEA_BUNDLE_V2` gates the admin API and panel, while the legacy importer remains the rollback path.

Plan 006 staging evidence is stored at `artifacts/staging-overhaul/20260803-plan006-bundle-v5/plan-006-result.json`, with an independent database reconciliation at `artifacts/staging-overhaul/20260803-plan006-bundle-v5/plan-006-reconcile.json`.

### Authoring Context Pack V1

Plan 007 adds a read-only, explicit allowlist projection for external authoring. The projection begins with published current Ideas and active source excerpts, joins only safe educational metadata, counts holdout benchmark rows, scans the projected object, then stores a private run-scoped ZIP.

```mermaid
flowchart LR
    Q[Admin export request] --> S[Typed DB snapshot]
    S --> A[Allowlist projection]
    A --> R[Redaction and holdout scan]
    R --> Z[Deterministic ZIP and checksum]
    Z --> K[Private R2 staging key]
    Z --> L[audit_mutasi with retention]
```

The exporter does not call an external model and never includes user, credential, attempt, answer, mastery, chat, embedding, signed URL, or holdout content. `FEATURE_AUTHORING_CONTEXT_V1` is disabled by default and tutor access remains disabled until a separate assigned-course policy test is added.

### Product Bundle V2

Product Bundle V2 extends the additive product tables with a strict import lifecycle. `lib/bundle/product-validator.ts` validates the manifest and typed entity files without database writes. `lib/bundle/product-staging.ts` stores the immutable ZIP and inventory in `impor_bundle` and `item_impor_bundle`. `lib/bundle/product-preview.ts` exposes only staged product content and its Idea and source references.

Publication in `lib/bundle/product-publication.ts` is a single transaction. It verifies published Idea versions and semantic hashes, active source versions and excerpts, creator and curator identities, dependency freshness, and typed product references before inserting article, diktat, question, solution, flashcard, blueprint, dependency, publication, audit, and canonical vector outbox rows. Product validation also enforces one-Idea flashcards, normalized Idea weights, complete multi-Idea relations, allowed ITB curation references, and explicit Article to Diktat dependencies when lineage is declared. Version greater than one uses a versioned physical target ID so the prior published row is not overwritten.

```mermaid
flowchart LR
    U[Admin ZIP upload] --> V[Pure typed validation]
    V --> S[Immutable staged import]
    S --> P[Traceable product preview]
    P --> R[Tutor and admin review]
    R --> C{Dependencies current}
    C -->|No| H[Needs review]
    C -->|Yes| T[Atomic publication transaction]
    T --> O[Product rows and vector outbox]
    T --> A[Publication and mutation audit]
```

`FEATURE_PRODUCT_BUNDLE_V2` is disabled by default. Legacy assessment import remains available as a rollback path, while changed legacy Assessment Bundle sources are now written as new source versions instead of overwriting the prior source. Runtime vector jobs are limited to `published_articles`, `published_questions`, and `published_solutions`; there is no generic `product` namespace.

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

The new path is gated by `FEATURE_MATERIAL_COMPILER_V2`. `lib/material-storage.ts` applies the article quality gate to review and publication only when that flag is active, so the existing `website_materials` readers and rollback path remain unchanged when it is absent or `0`.

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
| `ai_question_bank` | Permanent question repository: linked to KO/MTD with generationHash, distractorMap, bloomLevel, pattern, estimatedSteps, isStale |
| `question_option_stats` | Per-option selection counters for distractor analytics |
| `ai_usage_events` | Token usage per user per feature per model |
| `ai_generation_traces` | Privacy-safe AI execution provenance traces (hashes, versions, tokens, violations, latency, terminal outcome) |

#### Quiz System
| Table | Purpose |
|---|---|
| `quiz_templates` | Quiz config: selection rules (difficulty mix, tag filters), time limits, category (daily/weekly/chapter/premium) |
| `student_quiz_attempts` | Per-student quiz session with deep question/answer snapshots, masteryBefore snapshot, strong/weak areas |
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
  ├── type="learning" → KO Extraction Pipeline (lib/ko-extractor.ts, V2: FEATURE_KO_PIPELINE_V2, lib/knowledge/*)
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
| **Cloudflare Workers** | Three dedicated Workers: `zyx-vector-api` (Vectorize proxy), `zyxrealtime` (live quiz WebSocket/SSE), `zyxacademydiktat` (Puppeteer PDF, hosted on Railway) |
| **UploadThing** | Browser file uploads (dev fallback); production prefers direct R2 via storage abstraction |
| **Inngest** | Background job orchestration: vector sync (learning + assessment namespaces), generation pipelines, mastery recompute, assessment ingest, analytics snapshots, weekly reflections |
| **Firebase Admin** | FCM push notifications |
| **Puppeteer** | PDF generation for diktats (runs as separate Railway service at `DIKTAT_RENDERER_URL`) |
| **Resend** | Transactional emails |
| **Sentry** | Error tracking |

---

## 8. Directory Map

```
app/
├── courses/[id]/        ; Course portal (material, quiz, tryout, flashcard, live, mastery, path, leaderboard, my-results)
├── dashboard/           ; Student hub (active classes, weak concepts, recommendations)
├── admin/
│   ├── ai/              ; AI generation: materials, questions, quizzes, diktats, distractors, jobs, keys, analytics
│   ├── courses/         ; Course CRUD
│   ├── files/           ; UploadThing drive explorer
│   ├── meet/            ; Meet Studio (sessions, hosts, co-hosts, invited emails)
│   ├── forms/           ; Form Studio & Visualizer (builder, presets, spreadsheet export)
│   ├── media/           ; Media Library (R2 shared media browser, upload, preview)
│   ├── tautan/          ; Tautan (important links manager)
│   └── tokens/          ; Enrollment token management
├── api/
│   ├── uploadthing/     ; UploadThing route handler
│   ├── inngest/         ; Inngest serve endpoint
│   ├── admin/           ; Admin API routes (materials, canonical validation, type selection)
│   ├── quiz/            ; Quiz submission endpoints
│   └── storage/         ; R2 signed URLs
├── about/               ; About page
├── plans/               ; Pricing plans
├── testimonial/         ; Testimonials
├── profile/             ; User profile
├── settings/            ; User settings
├── tutor/               ; Tutor portal
└── feedback/            ; Feedback forms

lib/
├── db/                  ; Database client & schema
├── ai/                  ; AI utilities & analytics
├── storage/             ; Storage abstraction (UploadThing + R2 providers)

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
│   ├── ko-extractor.ts          ; KO extraction from learning-type MTDs
│   ├── ko-utils.ts              ; Shared utilities (repairJson, slugify, etc.)
│   ├── material-generator.ts    ; Website material generation (Gemini → markdown)
│   ├── material-storage.ts      ; Save compiled material + AST + versioning
│   ├── flashcard-generator.ts   ; Flashcard generation
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
│   ├── auth.ts / auth-client.ts / auth-redirect.ts ; Auth helpers
│   ├── pubic-app-url.ts         ; Public URL helper
│   └── whatsapp-admin.ts        ; WhatsApp admin notifications
├── notifications/
│   ├── send.ts                 ; Server-side FCM delivery layer (multicast, prune, persist)
│   ├── templates.ts            ; Pure payload builders per event type
│   └── types.ts                ; Shared notification payload/result types
└── site.ts, site-search.ts, testimonials.ts, youtube.ts ; Static content
```

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
| **Object Storage** | UploadThing (default) | R2 via `lib/storage/index.ts` (`STORAGE_PROVIDER_MODE`) |
| **Vector Store** | Cloudflare Vectorize | `FEATURE_VECTORIZE_ONLY_V1=1`, canonical-content-v2, 768 dimensions |
| **AI Gateway** | Direct Gemini API | Cloudflare AI Gateway (rate limit, caching, observability) |
| **Auth URL** | `localhost:3000` | `BETTER_AUTH_URL` = production origin |
| **Diktat Renderer** | Mock PDF | Railway Puppeteer service at `DIKTAT_RENDERER_URL` |
| **Analytics** | None | Vercel Analytics + Speed Insights + Sentry |

### Feature Flags (env `FEATURE_*`)
Gradual rollout via env vars ; all default to off unless set to `"1"`:
```
FEATURE_MASTERY, FEATURE_TODAY, FEATURE_EMBED, FEATURE_MISCONCEPTION,
FEATURE_REMEDIATION, FEATURE_MATERIAL_LIVE, FEATURE_FC_DIFFICULTY,
FEATURE_GRAPH, FEATURE_TUTOR_RAG, FEATURE_FEEDBACK, FEATURE_STUDY_PATH,
FEATURE_TUTOR_ANALYTICS, FEATURE_LIVE, FEATURE_REFLECTION,
FEATURE_REFLECTION_EMAIL, FEATURE_ADAPTIVE_QUIZ, FEATURE_PKA
```

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

Plan 002 keeps Gemini model identity, project-level limits, deadlines, capabilities, health gates, and embedding profiles in `lib/ai/provider/model-registry.ts`. Runtime calls cross one of two family-specific boundaries: the legacy `models.generateContent` adapter for stable generation models, or the installed SDK `interactions.create` adapter for the 3.5 and 3.6 routes. The adapters sanitize ordered text and inline image parts, enforce capability and byte limits, attach request deadlines, remove deprecated thinking configuration, and return typed retry classifications.

The canonical `canonical-content-v2` profile and the separate `zyra-semantic-cache-v1` profile both use Gemini Embedding 2 at exactly 768 dimensions, but use different task instruction versions and index aliases. Neither profile can access the other index, and Embedding 001 is legacy provenance only. Preserved 1024-dimensional vectors remain rollback-only. `FEATURE_AI_PROVIDER_REGISTRY_V1` is off by default so existing route order remains compatible until a later routing plan enables the new policy.

### Zyra distributed quota coordinator

Plan 003 keeps the four project aliases and model limits in the Plan 002 registry contract, then generates the Worker-facing serializable model contract from it. A single SQLite-backed `ZyraQuotaCoordinator` Durable Object owns daily project-model counters, minute buckets, lease transitions, circuit state, health samples, idempotency, and privacy-safe transition telemetry. The lease lifecycle is `reserved`, `dispatched`, then exactly one terminal result: `committed`, `refunded`, `expired_refunded`, or `expired_committed`.

Reservation and counter updates occur in one Durable Object SQLite transaction. A reserved lease is the only state that can be refunded; a dispatched lease is conservatively committed when it expires because the provider may have received the request. Project selection filters quarantine, circuit, RPM, and effective per-project daily ceilings, then uses deterministic utilization and least-recent-use ordering. Stored records contain no prompt, answer, API key, raw project number, or raw user ID. Only a SHA-256 user hash and bounded telemetry dimensions are persisted.

### Zyra application allowance ledger

Plan 004 adds `ai_allowance_leases` as an additive application-side lease ledger. It resolves the active compatibility role from `pengguna` and `pengguna_peran`, reserves before provider dispatch, and transitions through `reserved`, `dispatched`, `committed`, or `refunded`. Provider units and interaction units are tracked separately so cache hits and deterministic actions count toward abuse protection without spending a provider turn.

The ledger is enabled only by `FEATURE_ZYRA_ALLOWANCE_V2`. Existing `ai_usage_events` and `ai_generation_traces` remain readable and are not backfilled. Committed leases write a derived compatibility event using the lease ID as the idempotency key; the staging reconciliation script repairs a missing derived event without changing the authoritative lease. The authenticated allowance route returns only the current session actor's summary and never enumerates users.

### Zyra privacy-safe semantic cache

Plan 006 adds a profile-free cache above provider dispatch. The exact identity includes canonical course and Idea versions, evidence, policy, schema, language, route, assessment mode, visual capability, and embedding profile; learner identity, mastery, history, offsets, and API aliases are excluded. The application passes the same safe identity to AI Gateway, while a Durable Object single-flight gate ensures one provider reservation for simultaneous identical misses.

Validated shared scaffolds are stored in the staging Worker KV binding and may be indexed only in the separate `zyx-zyra-cache-staging` 768-dimensional cosine index under `zyra-semantic-cache-v1`. Vector metadata contains no response text or learner fields. Semantic candidates are filtered by server-owned scope and revalidated against the exact metadata and hydrated KV payload before reuse. Personalization is composed after the shared scaffold, and the daily KV write policy stops at 900 writes while reads continue.

### Zyra pedagogical harness

Plan 007 makes teaching behavior application-owned. A deterministic planner selects one state from orientation, diagnosis, explanation, bounded hint sequence, teach-back, check, or clarification using the request mode, evidence sufficiency, assessment policy, learner response shape, and prior hint level. The model receives only the selected state and hydrated evidence. Its typed response separates observed facts from diagnosis hypotheses, requires canonical citations for substantive claims, allows at most one checkpoint, and records the next allowed action and assessment reason code.

Active assessment policy is enforced before prompt composition and again during response validation. Invalid shape, citation, visual claim, unsupported diagnosis, pipeline-language, or answer-safety output becomes a typed rejection followed by deterministic safe composition. The prompt contract uses one total model attempt and disables the existing personalized second call while `FEATURE_ZYRA_PEDAGOGY_V3` is enabled. Shared cache payloads remain profile-free and canonical retrieval remains the source of truth.

### Zyra evidence-based personalization

Plan 008 adds additive `zyra_learning_events`, `zyra_learner_profiles`, and `zyra_learner_preferences` tables. Events use a strict allowlist of bounded event kinds, outcomes, latency buckets, hint levels, representations, weights, and optional opaque evidence references. Raw chat, assessment answers, and sensitive traits are not ingested into the profile. Events expire, queries are scoped by murid and course, and a learner reset moves the profile watermark forward without deleting historical evidence.

The aggregator is deterministic. It requires at least three recent events for inference, keeps uncertain fields as `unknown`, records evidence count, confidence, expiry, and reason codes, and stores inferred fields separately from explicit presentation preferences. Explicit preferences can select pace, representation, explanation length, or checkpoint type, but cannot change canonical content, grades, mastery, or assessment policy. The feature flag is `FEATURE_ZYRA_PERSONALIZATION_V1`, disabled unless explicitly enabled.

Personalization is composed after shared-cache retrieval. The Tier 1 scaffold is asserted profile-free before caching, while the adaptation decision remains in the current learner response only. A failure to load or aggregate the profile falls back to the grounded base answer, so personalization cannot make the tutor less safe or less evidence-grounded.

### Zyra typed Learning Canvas

Plan 009 adds `lib/zyra/canvas` as the application-owned visual protocol. A canvas spec is a discriminated, versioned object with a bounded visual type, purpose, learner-safe alt text, canonical claim references, controls, and an accessible fallback table or explanation. Function expressions are parsed into an allowlisted AST supporting only numeric constants, declared variables, arithmetic, and bounded approved functions. No model-provided JavaScript, HTML, SVG markup, or unrestricted diagram language is executed.

`LearningCanvasRenderer` keeps control values and editable expressions in local component state. Sampling, reset, invalid-expression handling, and table fallback use local computation and make no provider or network call. The compatibility adapter can map validated flowcharts, plots, and diagrams to the existing visual contract, while shared-cache bytes remain immutable and profile-free. `FEATURE_ZYRA_LEARNING_CANVAS_V1` is disabled by default.

Staging shadow mode is an explicit internal execution mode, not a public feature flag. It requires `ZYX_ENVIRONMENT=staging` and an exact match with `STAGING_ZYRA_PEDAGOGY_USER_ID`. The legacy and candidate generations run beside one another with one attempt each; only the legacy answer is returned. Learner summary and learning-event writes are suppressed, while comparison metadata stores only hashes, stable outcomes, state, hint level, violation codes, counts, and an opaque trace ID. Synthetic review output is available only to the local staging runner and is not added to the application response.

The runner renders a self-contained local HTML review page. Candidate and baseline output are escaped before insertion, no external resources are loaded, and the browser hashes the human reviewer identity before producing a submission. The strict validator requires the submitted case set to exactly match the generated draft and writes a final aggregate-only artifact. Raw answers and raw reviewer identity are excluded from the final release-gate result.

Canonical hydration and retrieval now wrap course lookup, enrollment lookup, vector query, and database hydration in one fail-closed boundary. Database and provider details are never logged. A failure returns the stable `CANONICAL_RUNTIME_UNAVAILABLE` reason and an empty evidence result, preventing a raw `DrizzleQueryError` from becoming a non-JSON application failure.

### Zyra private multimodal path

Plan 010 adds an authenticated attachment boundary. Browser files are checked by declared type and bounded source size, decoded with `sharp`, re-encoded without source metadata, and stored under an opaque date-scoped key. The database record binds owner, course, session, expiry, sanitizer version, dimensions, and sanitized hash. Private reads recheck the full scope immediately before dispatch. Image turns pass ordered text and inline image parts to a visual-capable registry route, bypass shared exact and semantic caches, and use one bounded attempt. Expiry blocks reads before storage lifecycle timing, while the sweeper converges storage and row state without exposing a public URL.

### Zyra murid experience

Plan 011 composes the existing tutor drawer with an authenticated allowance summary, bounded selection-to-ask context, the Plan 010 attachment composer, local Learning Canvas controls, and an application-owned SVG pet. The pet state is derived from upload, request, response, quota, and error state. Public flags are independent, so text tutoring remains available when image input, pet, or selection actions are disabled.

### Proposal-first copilots

Plan 012 separates deterministic facts, labeled interpretation, and typed operations. Tutor and admin surfaces can create and review scoped proposals, but no model output is executed as SQL, a command, a URL, or arbitrary JSON. A proposal records evidence references, preconditions, learner impact, reversibility, expiry, diff hash, validator result, and lifecycle events. The current apply boundary fails closed until the approved mutation service is integrated.

### Zyra operational truth

Plan 013 stores fixed-column operational events and derives admin metrics from the allowance ledger, attachment records, generation traces, and versioned model limits. It uses the Asia/Jakarta calendar boundary, exposes deduplicated alert codes with rollback flags and versioned runbook references, and distinguishes configured limits, Zyx-recorded usage, active reservations, cache activity, and external provider usage that is unknown. Murid and tutor views remain actor-scoped. Raw prompts, responses, image data, object keys, and raw identity do not enter the telemetry table.

### Release verification boundary

Plan 014 is a masked verifier that inventories predecessor artifacts, feature flags, staging fingerprints, worktree state, and the approved request cap. Synthetic-only execution writes a blocked result when any release gate is absent. It does not deploy, migrate, enable flags, call a provider, or authorize production.
