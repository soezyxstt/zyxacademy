# Zyx Academy Documentation Index

`OPEN / IN PROGRESS`: [Neon Functions worker cutover](operations/neon-functions-cutover.md) records the successful production worker-only recovery without a web rebuild, 22 registered functions, a completed Inngest PDF run and 10 passing production HTTP/PDF checks. It records Cloudflare Browser Run handling, exact environment guards, partial staging evidence and the unchanged web's source-figure, V4 verification and direct RPC compatibility limits. The background-only Vectorize writer, web deployment hold and resumable manual worker acceptance preserve the unchanged web. Main workflow integration is complete in PR 309; main CI released production deployment 3 with 10/10 HTTP/PDF checks passing. Guarded maintenance covers the 2,083 historical vector rows and remaining search, mastery and deterministic schedules; execution evidence is pending. Remaining business-path and unchanged-web compatibility acceptance is still open. Staging web/DNS work is deferred. The `ACTIVE` architecture, deployment and development guides link this transition.

The `ACTIVE` [feature catalog](features.md) and [coding contract](coding-foundation.md) record one Zyra composer with Python/Tutor modes, inline editable math with keyboard, deletion and palette behavior, accurate session counts, and guarded placement of final Python in the editor. The `ACTIVE` architecture guide records the editor context bridge and scoped message-count query, and single-owner coding history persistence with replay protection, save acknowledgements, persisted-only counts, and recovery for malformed Python replies.

The `ACTIVE` [Product Bundle V4 contract](bundle/product-bundle-v4.md) describes ordered scientific content, authored Diktat static exports, source assets, trusted verification and explicit review gates implemented locally. V4 is the creation default for new Article/Diktat; V3 readers, validators and explicit legacy revisions remain supported. Synthetic-fixture HTTP/browser/PDF checks do not establish full-chapter acceptance. Deployment, trusted remote verification and installed-host acceptance remain separate boundaries.

The `ACTIVE` [MCP skills distribution runbook](operations/authoring-mcp-skills.md) documents pinned external builds, full and compact catalogs, local V4 candidate provenance, attested web/Deno builds, configurable Cloudflare Browser Run or Steel verification, resource integrity and host acceptance. The `ACTIVE` deployment and development guides and Product Bundle V4 contract describe provider/version-bound plans, Steel session cleanup and failure categories, GitHub Variables/Secrets compatibility, an explicitly authorized exact-draft staging fixture transfer and read-only Deno context diagnostics when credentials are available, Deno runtime identity, and the read-only `/v4` preview. Full chapter verification remains unproven by local code checks. Local package checks remain separate from installed-host, OAuth and deployment evidence.

The `ACTIVE` architecture guide records request-scoped session and read deduplication in Next.js consumer wrappers, framework-neutral Deno data resolvers, bounded catalogue count projections retaining zero counts and PKA, and parent layout boundaries for child loading streams.

The `ACTIVE` architecture guide records integer PNG dimensions, source checksum metadata, explicit PDF page citations, and visual review markers for damaged extracted text. The source playbook includes polling fallback for stale connector catalogs.

The `ACTIVE` architecture, deployment, development, and feature guides document all four MCP OAuth default scopes, consent limited to requested scopes and explicit admin scope grants, and reauthorization for existing tokens.

The `ACTIVE` development, architecture, and Product Bundle V3 guides document R2-backed MCP PDF page images, deterministic course/document/checksum folders, citation metadata, the page-read stage-scope requirement, the compute text/PNG cache keyed by document checksum, page, renderer revision, and resolution, plus text/image representation, request timings, per-page Inngest jobs and polling, and resumable signed binary downloads. The `ACTIVE` deployment guide records worker registration and remote Range verification required for this always-on change.

This directory contains the technical documentation, architecture specifications, data schemas, operational runbooks, bundle contracts, and audits for Zyx Academy.

All markdown documents across `docs/` and `plans/` must be registered in this index with an explicit lifecycle status. The active feature catalog also specifies catalogue-based Article headings, chapter numbering, decoded canonical product URLs, and subsection navigation matching visible block headings. The active Product Bundle V3 contract includes labelled open and closed graph points and accepts complete Diktat PDFs from 1 to 4 pages without filler or font shrinking.

The `ACTIVE` feature catalog records Zyra session continuity, conversational tutoring, article-style math presentation, proactive grounded visual exploration, and safe retry responses when generation fails.

The `ACTIVE` feature catalog also documents compact Article formula rows, reading-first embedded graphs, optional parameter controls, and explicit graph interaction activation.

The `ACTIVE` feature catalog records Article selection explanations, policy-validated contextual live-session follow-up suggestions, explicit Python generation with preserved retry intent and image snapshots, and the beginner Python generation policy.
The `ACTIVE` feature catalog documents compact Form Studio rows, publication per question or per section, upload size labels, and confirmation before submission. Local fixture checks do not verify live storage or publication.

The `ACTIVE` feature catalog records the mobile Article selection action and saved quote handoff to Zyra, with the desktop selection popover preserved.

---

The `ACTIVE` feature catalog and schema reference document permanent admin-managed platform and tutorial discount schedules, shared public pricing, and the singleton `pricing_settings` table. Local verification does not establish a deployed migration or production pricing change.

## 1. Documentation Taxonomy & Hierarchy

The documentation is organized into clear functional layers:

```text
docs/
â”œâ”€â”€ README.md                                 # Master Index and Status Authority (this file)
â”œâ”€â”€ ARCHITECTURE.md                           # System Architecture, Data Flow, and Boundaries
â”œâ”€â”€ DATABASE.md                               # Database Setup, Environments, and Adapters
â”œâ”€â”€ DB_SCHEMA.md                              # Schema Definition, Tables, and Relations
â”œâ”€â”€ DEPLOYMENT.md                             # Production and Staging Deployment Topology
â”œâ”€â”€ DEVELOPMENT.md                            # Local Development, Tooling, and Feature Flags
â”œâ”€â”€ FILE_NAMING_CONVENTIONS.md                # Official File Naming and Directory Taxonomy
â”œâ”€â”€ features.md                               # Product Feature Catalog and Workflows
â”‚
â”œâ”€â”€ bundle/                                   # Bundle Specifications and Authoring Contracts
â”‚   â”œâ”€â”€ authoring-context-pack-v1.md          # Authoring Context Pack V1 Contract
â”‚   â”œâ”€â”€ authoring-job-pack-v1.md              # Authoring Job Pack V1 Contract
â”‚   â”œâ”€â”€ idea-bundle-v2.md                     # Transitional Idea Bundle V2 Contract
â”‚   â”œâ”€â”€ idea-bundle-v3.md                     # Structured Idea Bundle V3 Contract
â”‚   â”œâ”€â”€ product-bundle-v2.md                  # Transitional Product Bundle V2 Contract
â”‚   â”œâ”€â”€ product-bundle-v3.md                  # Structured Product Bundle V3 Contract
â”‚   â””â”€â”€ product-bundle-v4.md                  # Default V4 authoring contract, legacy compatibility and generated JSON Schema delivery
â”‚
â”œâ”€â”€ operations/                               # Operational Runbooks, Checklists, and Allowances
â”‚   â”œâ”€â”€ authoring-mcp-skills.md                # Pinned MCP Skills Build and Import Acceptance
â”‚   â”œâ”€â”€ legacy-vector-contract-allowlist.md   # Allowed Legacy Vector References during Cutover
â”‚   â”œâ”€â”€ manual-test-plan-bundles-v2.md       # Human-driven Verification for Bundle Ingestion
â”‚   â”œâ”€â”€ neon-migration.md                    # Neon rehearsal and live staging cutover evidence
â”‚   â”œâ”€â”€ neon-production-cutover.md           # Production rehearsal and guarded maintenance cutover
â”‚   â”œâ”€â”€ production-readiness-checklist.md     # Pre-deployment Gates and Plan Checkpoints
â”‚   â”œâ”€â”€ structured-article-v3-rollout.md       # Structured Article V3 Migration and Rollout
â”‚   â”œâ”€â”€ visual-audit-capture.md               # Procedure for Staging Visual Capture Audits
â”‚   â””â”€â”€ zyra-ops-runbooks.md                  # Zyra AI Alert Runbooks and Incident Handling
â”‚
â””â”€â”€ handoffs/                                 # Milestone Handoff Records and Checkpoints
    â””â”€â”€ zyra-ai-plans-001-007.md              # Zyra AI Plans 001-007 Staging Checkpoint
```

---

## 2. Document Status Definitions

Every document in this repository has one of the following explicit statuses:

| Status | Definition |
|---|---|
| `ACTIVE` | Canonical source of truth. Reflects current production or active staging behavior. |
| `TRANSITIONAL / LEGACY` | Preserved for compatibility, cutover verification, or rollback support. Not for new features. |
| `HISTORICAL CHECKPOINT` | Frozen point-in-time milestone, migration handoff, or audit record. Read-only. |
| `OPEN / IN PROGRESS` | Active audit with open findings, or in-flight implementation plan currently being executed. |
| `COMPLETED / RESOLVED` | Historical plan or audit that has been fully implemented, verified, and closed. |

---

## 3. Master Document Inventory

| Document | Category | Status | Updated / Date | Purpose and Scope |
|---|---|---|---|---|
| [operations/cloud-run-staging.md](operations/cloud-run-staging.md) | Operations | `ACTIVE` | 2026-11-02 | Verified Taiwan Cloud Run staging deployment with shared Neon web/worker target guards, GitHub Actions image publication and automatic revision/traffic rollout, runtime configuration sync, direct readiness checks, IAM preservation and coordinated Turso-compatible rollback. |
| [README.md](README.md) | Index | `ACTIVE` | 2026-11-05 | Master documentation index, hierarchy map and lifecycle status ledger, including live Neon staging topology, per-feature AI model routing, production boundaries, bilingual evidence and open gates. |
| [coding-foundation.md](coding-foundation.md) | Coding | `ACTIVE` | 2026-10-30 | Python contextual help sheet and viewport-aware Playground editor, Article/Playground/Live Quiz contract, staging WASI terminal and bounded editor prewarming, browser runtime outside staging, explicit Submit provider and fail-closed session cleanup. |
| [coding-verification.md](coding-verification.md) | Coding verification | `ACTIVE` | 2026-10-24 | PR #217: real Steel Python matrix, Article/Live correct and incorrect grading, deadline retries with zero Live score, authenticated Playground Run at both viewports, browser harness and cleanup. CI remains blocked by Sonar authorization and inherited bilingual Schedule assertions; earlier evidence is historical. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Core Architecture | `ACTIVE` | 2026-11-02 | Separate live Neon PostgreSQL/storage targets, request-scoped read deduplication, catalogue projections, demo metadata and component streaming, first-content streaming, V4 authoring default, canonical MCP admin access, OAuth consent grants, verification and publication boundaries, bilingual request locale and preference precedence, finite public rewrites, worker-safe communications, Zyra override memory limits, per-feature AI model routing and Ops AI fallback, source figures, and publication gates, and isolated Python provider execution. |
| [operations/authoring-mcp-skills.md](operations/authoring-mcp-skills.md) | Operations | `ACTIVE` | 2026-10-23 | Pinned external snapshots, 0.4.1 V4 defaults, browser deadlines and 2-slice checkpoints, early remote cleanup, backoff-aware leases, canonical CDP validation, scoped diagnostics and exact-revision recovery/cancellation, attested renderer and separate installed-host acceptance. |
| [DATABASE.md](DATABASE.md) | Core Database | `ACTIVE` | 2026-11-02 | Live Neon staging target, PostgreSQL development/CI, separate protected production Neon target, signed import settings, Drizzle workflows and coordinated rollback. |
| [DB_SCHEMA.md](DB_SCHEMA.md) | Core Database | `ACTIVE` | 2026-11-06 | PostgreSQL staging schema authority and retained legacy catalog, including staging-verified `ai_model_settings` migration, locale preferences, coding, tutorial occupancy/refunds, historical assessments, Product Bundle review and PDF evidence. |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Core Infrastructure | `ACTIVE` | 2026-11-10 | Main-integrated Neon background releases, exact production guards, worker-only Vectorize credentials, web deployment hold and retained legacy deployment references. |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Core Development | `ACTIVE` | 2026-11-02 | Dependency-aware CI, successful-release baselines, and local development with separate live Neon targets and signed source snapshot imports, pinned scientific dependencies, i18n catalogs, staging Python terminal configuration, and provider/runtime probe commands. |
| [FILE_NAMING_CONVENTIONS.md](FILE_NAMING_CONVENTIONS.md) | Standards | `ACTIVE` | Current | Standard file naming formula, taxonomy, and directory hierarchy for academic assets. |
| [features.md](features.md) | Product | `ACTIVE` | 2026-11-05 | Student, tutor, admin and public workflows; live per-feature AI model configuration (`/admin/ops/models`) and deduplicated AI analytics (`/admin/ops/analytics`), tutorial booking deadlines and cancellation refunds, bilingual application interface and search boundaries, Zyra language persistence limits, Idea-linked quizzes, Authoring MCP consent and admin access, V4 authoring defaults, scientific rendering and review gates, including Python Playground code generation and automatic editor insertion, problem assistance, editor shortcuts and guided error recovery. |
| [bundle/authoring-context-pack-v1.md](bundle/authoring-context-pack-v1.md) | Bundle Contract | `ACTIVE` | Current | Specification for authoring context pack export format and security boundaries. |
| [bundle/authoring-job-pack-v1.md](bundle/authoring-job-pack-v1.md) | Bundle Contract | `ACTIVE` | 2026-10-11 | Specification for authoring job packs, Source Pack provenance, and local or stored-original ingestion and persistence. |
| [bundle/idea-bundle-v2.md](bundle/idea-bundle-v2.md) | Bundle Contract | `TRANSITIONAL / LEGACY` | Current | Read and rollback submission contract for Idea Bundle V2. |
| [bundle/idea-bundle-v3.md](bundle/idea-bundle-v3.md) | Bundle Contract | `ACTIVE` | 2026-08-31 | Learning section hierarchy, Idea membership, validation, editing, and MCP transition contract. |
| [bundle/product-bundle-v2.md](bundle/product-bundle-v2.md) | Bundle Contract | `TRANSITIONAL / LEGACY` | Current | Read compatibility and Article block review adapter for Product Bundle V2. |
| [bundle/product-bundle-v3.md](bundle/product-bundle-v3.md) | Bundle Contract | `ACTIVE` | 2026-10-11 | Structured Article, fixed readable Diktat typography, pagination, and numbered contact footer, typed visuals with geometric axis scaling and domain boundaries, simplified revision-bound review, publication, and student reads. |
| [bundle/product-bundle-v4.md](bundle/product-bundle-v4.md) | Bundle Contract | `ACTIVE` | 2026-10-22 | Default V4 authoring contract with legacy compatibility: scientific parts, authored graphical Diktat with fixed readable typography, source figures, trusted verification, unmarked scientific prose blockers, current explicit review and checksum-pinned schema delivery. Operational rollout is separate. |
| [operations/public-demo-seeding.md](operations/public-demo-seeding.md) | Operations | `OPEN / IN PROGRESS` | Current | First-chapter learning access and authorized fictional fallbacks; active chapter and student-visible product metadata catalogue update and replacement baseline are under verification. |
| [operations/production-readiness-checklist.md](operations/production-readiness-checklist.md) | Operations | `ACTIVE` | Current | Pre-deployment gates, quality criteria, staging validation checklist, and mandatory Idea links with exactly one primary for MCP quiz drafts and edits. |
| [operations/neon-migration.md](operations/neon-migration.md) | Operations | `COMPLETED / RESOLVED` | 2026-11-02 | Verified staging cutover with 21,273 business rows, 124 source objects, Google login, 14 hosted routes, booking recovery, worker PDF integration and six concurrency regressions. CI passed 2,038 contracts across 313 files; hosted authoring passed 22 checks through review, publication and PDF download. Production cutover is recorded separately. |
| [operations/neon-production-cutover.md](operations/neon-production-cutover.md) | Operations | `ACTIVE` | 2026-11-02 | Production serves Neon: 78,918 rows in 193 reconciled tables, 1,005 objects with metadata and SHA-256 proofs, existing role sessions, private storage proxy and signed worker acceptance. Maintenance removed, jobs restored, seven-day snapshot and compute-free storage backup retained. Fresh browser Google login awaits owner confirmation. |
| [operations/zyra-ops-runbooks.md](operations/zyra-ops-runbooks.md) | Operations | `ACTIVE` | 2026-09-02 | Operational runbooks, health metrics, alert responses, and Admin Ops AI v2 operational procedures (Vectorize sync, rollback without flag, provider mitigation, proposal retention). |
| [operations/visual-audit-capture.md](operations/visual-audit-capture.md) | Operations | `ACTIVE` | Current | Verified Neon staging target, read-only session capture, candidate build provenance, visual checks and owned server cleanup. |
| [operations/structured-article-v3-rollout.md](operations/structured-article-v3-rollout.md) | Operations | `ACTIVE` | 2026-09-01 | Additive migration, authoring rollout gates, rollback, and published student visibility for structured Articles. |
| [operations/manual-test-plan-bundles-v2.md](operations/manual-test-plan-bundles-v2.md) | Operations | `ACTIVE` | Current | Manual test procedure for Idea Bundle V2 and Product Bundle V2 ingestion, block review, and destructive confirmation flows. |
| [operations/legacy-vector-contract-allowlist.md](operations/legacy-vector-contract-allowlist.md) | Operations | `TRANSITIONAL / LEGACY` | Current | Non-runtime vector matches permitted during the Vectorize 768d migration cutover. |
| [handoffs/zyra-ai-plans-001-007.md](handoffs/zyra-ai-plans-001-007.md) | Milestone Handoff | `HISTORICAL CHECKPOINT` | 2026-08-11 | Staging checkpoint and test evidence summary for Zyra AI system Plans 001 through 007. |

---

| [audit/production-playground-css-20261102.md](audit/production-playground-css-20261102.md) | Audit | `OPEN / IN PROGRESS` | 2026-11-02 | Production lacks editor color tokens despite matching source; clean local CSS probes pass, Vercel cache diagnosis and fresh deployed verification remain open. |

## 4. Plans Cross-Reference

Implementation plans reside in `plans/` with detailed specifications:

| Plan Track | Path | Status | Summary |
|---|---|---|---|
| Admin documentation | [admin-documentation.md](../plans/admin-documentation.md) | `OPEN / IN PROGRESS` | Admin help implementation, guide inventory, section navigation, synthetic local browser checks, and pending operational verification. |
| Indonesian and English web app | [bilingual-web-app.md](../plans/bilingual-web-app.md) | `OPEN / IN PROGRESS` | CP0 inventory and baseline are accepted. Release candidate build, typecheck, lint, catalogs, focused contracts, a 52-capture public matrix, 26 focused state screenshots, and 8 metadata browser checks passed. CP7 remains partial for unavailable demo/PKA data, broad route/state coverage, and untested live provider/cache behavior. Read-only staging inspection confirmed migration 0098 is pending. CP8 remains blocked with no rollout authorization. |
| Article and Diktat system design | [article-diktat-authoring-system-design.md](../plans/article-diktat-authoring-system-design.md) | `OPEN / IN PROGRESS` | System design with local implementation status. Full chapter, live executor, staging and host-by-host rollout acceptance remain open. |
| Authoring MCP distribution and playbooks | [authoring-mcp-distribution-and-playbooks.md](../plans/authoring-mcp-distribution-and-playbooks.md) | `OPEN / IN PROGRESS` | Local review fixes validated by 95 Bun contracts, 11 Python tests, a production build with local fixtures, and 15 traced playbook assets. Repository lint/typecheck still have unrelated errors; Staging and production deployment/runtime smoke are verified; CP5 host verification and strict bootstrap enforcement remain open. |
| Marketing conversion and portfolio | [marketing-conversion-and-portfolio.md](../plans/marketing-conversion-and-portfolio.md) | `OPEN / IN PROGRESS` | M01 through M03 and M05 through M09 are implemented locally in a separate worktree. M04 and CP5 remain partial because the public study-case URL, external runtime configuration, and clean full validation are still open. |
| Navigasi dan performa web | [navigation-performance-plan.md](../plans/navigation-performance-plan.md) | `OPEN / IN PROGRESS` | WP4 batching and WP5 pagination are integrated locally. Selected candidate measurements and visual checks are recorded in the open validation audit; unresolved gates and Cloud Run capacity remain. |
| Product Bundle sebagai sumber belajar mandiri | [product-bundle-sumber-belajar-mandiri.md](../plans/product-bundle-sumber-belajar-mandiri.md) | `COMPLETED / RESOLVED` | Locally completed CP0 through CP8 implementation for self-study Articles, review Diktat PDF export, revision-bound pedagogic review, shared MCP gates, UI, skills, and four authoring rehearsals. Ready for a separately authorized guarded staging rollout. |

On 2026-09-05, the previous plan index, Plan 017, student learning UX plan, Ops AI orchestration and checkpoint handoffs/corrections, and Zyra AI System Plans 001 through 014 were removed at the user's direction. Their prior versions remain in Git history. Removal does not certify completion of previously open work; current runtime behavior remains documented in the canonical documents above.

---

## 5. Audit Lifecycle and Resolution Log

Audits are created to systematically identify architectural, quality, or security gaps. Once all findings in an audit are implemented, verified, and closed by implementation plans, the obsolete audit file is retired, and its resolution is recorded in this log.

| Audit | Date Logged | Resolution Status | Resolution Details |
|---|---|---|---|
| `heavy-api-routes-audit.md` | 2026-09-06 | `COMPLETED / RESOLVED` | Resolved by decoupling heavy compute into Deno background worker tier: Inngest physical entrypoint separation (jobs/web vs jobs/compute), asynchronous thumbnail generation via pdf/thumbnail.requested, async Diktat compilation via diktat/pdf.generate.requested, compute RPC endpoints (/internal/pdf/pages and /internal/authoring/source-pack/resolve), and static web tier boundary guards (audit:web-boundaries). |
| Navigation performance validation | [navigation-performance-validation.md](audit/navigation-performance-validation.md) | `OPEN / IN PROGRESS` | Selected local candidate evidence, authenticated staging dashboard delay with explicit browser User-Agent, retained measurement evidence after cache cleanup, and unresolved performance and visual gates. |
| `student-deep-ui-ux-audit.md` | 2026-09-03 | `COMPLETED / RESOLVED` | All 8 student UI/UX findings (AUD-STU-01 through AUD-STU-08) resolved: functional `/feedback` server action and `/calendar` agenda, normalized `CoursePageShell` and `PageHeader` navigation, Indonesian copy across settings and reflections, structured empty states with CTAs, `FormattedDate` and `lib/date-utils.ts` standardization, parallelized leaderboard queries, post-quiz review navigation alignment, and mobile bottom navigation. |
| `admin-visual-quality-audit.md` | 2026-08-24 | `COMPLETED / RESOLVED` | All 14 visual findings resolved: F1 (push notification dialog gated from admin surfaces), F2 (normalizeDate applied to prevent year 58604 bug), F3 (defensive image error fallbacks for PKA and blog thumbnails), F4 (error sanitization and explainBundleError mapping), F5 (instant top scroll on quiz form mount), F6 (persistent AdminPageHeader on all data states), F7 (standardized AdminEmptyState and Indonesian copy), F8 (sentence-case table headers without all-caps), F9 (DOM pagination for question bank), F10 (concise sidebar labels without truncation), F11 (semantic status tokens instead of raw Tailwind palettes), F12 (Lucide icons replacing emojis in notifications), F13 (styled file upload dropzone), F14 (--text-body-2xs declared for 10px micro UI). |

| `00-master-summary.md` | 2026-08-01 | `COMPLETED / RESOLVED` | Master audit recommendations resolved by Overhaul Plans 001 through 016. |
| `active-recall-and-exploration-audit.md` | 2026-08-02 | `COMPLETED / RESOLVED` | Resolved by Zyra Learning Canvas (Plan 009) and active recall engine (Plan 011). |
| `admin-knowledge-infrastructure-audit.md` | 2026-08-02 | `COMPLETED / RESOLVED` | Resolved by Source, Idea, and Product database schema overhaul (Plans 003, 004, 006). |
| `dosen-tutor-facing-audit.md` | 2026-08-02 | `COMPLETED / RESOLVED` | Resolved by Indonesian role compatibility (Plan 002) and tutor copilot harness (Plan 012). |
| `external-bundle-workflow-audit.md` | 2026-08-02 | `COMPLETED / RESOLVED` | Resolved by Idea Bundle V2 (Plan 006) and Product Bundle V2 (Plan 008) implementations. |
| `knowledge-factory-pipeline-audit.md` | 2026-08-02 | `COMPLETED / RESOLVED` | Resolved by staged extraction pipeline, KO provenance, and Vectorize 768d migration (Plans 003, 005, 007). |
| `student-personalization-tutor-audit.md` | 2026-08-02 | `COMPLETED / RESOLVED` | Resolved by personalization engine (Plan 008) and student experience harness (Plan 011). |

---

## 6. Canonical vs Legacy Operational Matrix

To prevent confusion when navigating code or documentation, the active vs legacy boundaries are summarized below:

| System Area | Canonical / Active Standard | Legacy / Transitional Mechanism | Boundary Rules |
|---|---|---|---|
| **Retrieval & Vector Store** | Cloudflare Vectorize 768-dimensional (`text-embedding-004`) | Pinecone, 1024-dimensional Vectorize indexes | New retrieval queries use 768d Vectorize only. Legacy indexes are preserved for rollback only. |
| **Object Storage** | Separate private Neon buckets in staging and production | Preserved source R2 objects; UploadThing compatibility | Keys use `lib/storage/keys.ts`; credentials and endpoints remain branch-scoped. |
| **Database** | Separate Neon PostgreSQL branches in staging and production | Preserved Turso source and legacy SQLite artifacts | No Turso fallback. After accepting writes, freeze and reconcile before restoring the prior runtime unit. |
| **Roles & Permissions** | Canonical `pengguna_peran` table with role assignments | Flat string role column on user | All new authorization checks use canonical `pengguna_peran`. |
| **Course Ingestion** | Bundle V3 behind `FEATURE_STRUCTURED_ARTICLE_READER_V1` | Bundle V2 submission and legacy readers | Published V2 and V3 remain readable. New submissions require V3 only while the flag is enabled. |
| **AI Harness & Quota** | Zyra Control Plane with Durable Object Quota Coordinator | Uncoordinated direct provider calls | Tutoring and generation route through Zyra quota coordinator and allowance ledger. |
| **Admin Ops AI** | Admin Ops AI v2 (isolated `admin_ops_knowledge` Vectorize namespace, two-phase mutation proposals, in-flow desktop panel) | Legacy ungrounded Ops AI v1 chat | Admin assistant uses isolated Vectorize 768d RAG and server-validated proposals only. |

---

## 7. Documentation Maintenance Contract for Agents and Contributors

1. **Mandatory Index Updates**: Every time a markdown file in `docs/` or `plans/` is created, renamed, materially modified, or deleted, `docs/README.md` MUST be updated in the same change.
2. **Explicit Status Assignment**: Every new or altered document must have its status recorded as `ACTIVE`, `TRANSITIONAL / LEGACY`, `HISTORICAL CHECKPOINT`, `OPEN / IN PROGRESS`, or `COMPLETED / RESOLVED`.
3. **Audit Lifecycle Tracking**: New audits must be placed in `docs/audit/` and marked `OPEN / IN PROGRESS` in Section 3 and Section 5. When all findings are resolved and verified, the audit file can be removed and moved to `COMPLETED / RESOLVED` in Section 5.
4. **No Dash Rule**: Never use em dashes or en dashes in documentation, code, or copy. Use commas, semicolons, colons, or periods instead.
5. **Accurate Cross-Linking**: Ensure all markdown links use relative paths that correctly resolve from the referencing file.

| Authoring MCP distribution and playbooks | [authoring-mcp-distribution-and-playbooks.md](../plans/authoring-mcp-distribution-and-playbooks.md) | `OPEN / IN PROGRESS` | Local review fixes validated by 95 Bun contracts, 11 Python tests, a production build with local fixtures, and 15 traced playbook assets. Repository lint/typecheck still have unrelated errors; HTTP smoke, CP5 host verification, and CP6 rollout remain open. |

| [operations/admin-mcp.md](operations/admin-mcp.md) | Admin MCP | `OPEN / IN PROGRESS` | 2026-11-02 | Exact operational tool catalog, scoped transaction and outbox contracts, local verification and remaining parity/rollout boundaries. | Runtime CI follow-up records isolated fixtures, browser discovery and local PDF page-boundary evidence.

Admin MCP changes also update `DB_SCHEMA.md`, `DEVELOPMENT.md`, `DEPLOYMENT.md`, `features.md`, `ARCHITECTURE.md` and `operations/authoring-mcp-skills.md`; their existing active registry status remains applicable.

Local verification for the active Admin MCP work includes isolated academic and communications integration checks; production compilation remains unverified after SIGKILL. The Admin MCP operations record stays `OPEN / IN PROGRESS`.

Admin MCP scope decision: PKA is excluded from the expansion; its new MCP tools, grants and worker broadcast additions have been removed. Existing PKA implementation remains unchanged. The operations record stays `OPEN / IN PROGRESS`.

The Admin MCP operations catalog now reflects the PKA exclusion and includes a transport guard against advertising PKA tools.

Admin MCP staging adaptation is `OPEN / IN PROGRESS`: existing capabilities are retained while adopting PostgreSQL migrations, native timestamp filters, canonical admin/consent checks and active storage selection from `a67a4744`. Updated operations, schema, development, deployment, feature and architecture records distinguish prior SQLite checks from pending staging compatibility. No new worker service is introduced.

Admin MCP adaptation to current staging passed 84 focused checks across 19 isolated processes and the application incremental TypeScript check. The operations record remains `OPEN / IN PROGRESS` for unverified deployment/provider boundaries and intentionally deferred UI-only operations.

Admin MCP local staging adaptation validation is complete: incremental application TypeScript, lint, static worker import audit and 84 focused tests passed. Deployment, real host and provider acceptance remain open in `operations/admin-mcp.md`.

Admin MCP isolation contract in `operations/admin-mcp.md` is `ACTIVE`: server environment identity, mandatory target matching for data tools, origin-bound plans/jobs, and fail-closed configuration. Real remote/harness acceptance is still unverified.

Admin MCP isolation validation: local negative scenarios, target-aware transport, TypeScript, lint, plugin packaging and worker dependency checks passed. Public staging/production OAuth metadata advertised separate canonical resources. Runtime database/storage targets, authenticated staging harness access and rollout remain unverified. The features, development and operations records reflect these boundaries.

Admin MCP review fixes update `operations/admin-mcp.md`: queued operations recheck persisted OAuth client/resource consent before provider effects; video metadata edits preserve omitted values. Local review regression checks are recorded there, with CI acceptance still pending.

Admin MCP review corrections were verified locally by the standalone OAuth consent integration, 80 CI-runner contracts, final video/outbox regressions, incremental TypeScript and source lint. Updated PR CI acceptance remains pending.

Admin MCP CI compatibility follow-up is `OPEN / IN PROGRESS` pending remote checks: all 105 prior test-compiler diagnostics were reproduced on staging, then corrected at fixture/type boundaries. The unchanged CI compiler scope and 263 affected runtime tests now pass locally. No CI selection or assertion coverage was reduced; evidence is recorded in `operations/admin-mcp.md`.

Rancangan navigasi di `plans/navigation-performance-plan.md` membedakan target usulan dari baseline, memakai Neon untuk staging dan produksi sesuai konfirmasi pengguna, serta menetapkan batas payload soal dan deduplikasi sesi pada route pilot. Status tetap `OPEN / IN PROGRESS`.

The `ACTIVE` [architecture](ARCHITECTURE.md), [feature catalog](features.md), and [development guide](DEVELOPMENT.md) describe local navigation changes. The [performance plan](../plans/navigation-performance-plan.md) and [validation audit](audit/navigation-performance-validation.md) remain `OPEN / IN PROGRESS`; local measurements do not establish causal savings or actual Cloud Run capacity.

The `ACTIVE` deployment, development, and feature guides document shared staging and production Python terminal access, environment-bound tickets, and coordinated ticket-key rotation.

| Production Playground CSS | [audit/production-playground-css-20261102.md](audit/production-playground-css-20261102.md) | `OPEN / IN PROGRESS` | Missing served editor tokens confirmed; cache hypothesis awaits a fresh production build and authenticated visual verification. |

Navigation staging release preparation integrates the current staging dashboard presentation with streamed sections. Deployment and post-release timing remain pending until the staging workflow completes.

The `ACTIVE` [deployment guide](DEPLOYMENT.md) records explicit release status conditions after optional CI jobs skip. Staging release `73d465d5` passed checks but its deployment jobs were skipped; hosted rollout remains pending a successful deployment job.
