# Zyx Academy Documentation Index

The `ACTIVE` [Product Bundle V4 contract](bundle/product-bundle-v4.md) describes ordered scientific content, authored Diktat static exports, source assets, trusted verification and explicit review gates implemented locally. V4 is the creation default for new Article/Diktat; V3 readers, validators and explicit legacy revisions remain supported. Synthetic-fixture HTTP/browser/PDF checks do not establish full-chapter acceptance. Deployment, trusted remote verification and installed-host acceptance remain separate boundaries.

The `ACTIVE` [MCP skills distribution runbook](operations/authoring-mcp-skills.md) documents pinned external builds, full and compact catalogs, local V4 candidate provenance, attested web/Deno builds, configurable Cloudflare Browser Run or Steel verification, resource integrity and host acceptance. The `ACTIVE` deployment and development guides and Product Bundle V4 contract describe provider/version-bound plans, Steel session cleanup and failure categories, GitHub Variables/Secrets compatibility, an explicitly authorized exact-draft staging fixture transfer and read-only Deno context diagnostics when credentials are available, Deno runtime identity, and the read-only `/v4` preview. Full chapter verification remains unproven by local code checks. Local package checks remain separate from installed-host, OAuth and deployment evidence.

The `ACTIVE` architecture guide records request-scoped session and read deduplication in Next.js consumer wrappers, framework-neutral Deno data resolvers, bounded catalogue count projections retaining zero counts and PKA, and parent layout boundaries for child loading streams.

The `ACTIVE` architecture guide records integer PNG dimensions, source checksum metadata, explicit PDF page citations, and visual review markers for damaged extracted text. The source playbook includes polling fallback for stale connector catalogs.

The `ACTIVE` architecture, deployment, development, and feature guides document all four MCP OAuth default scopes, all four consent checkboxes even for narrower client requests, and reauthorization for existing tokens.

The `ACTIVE` development, architecture, and Product Bundle V3 guides document R2-backed MCP PDF page images, deterministic course/document/checksum folders, citation metadata, the page-read stage-scope requirement, the compute text/PNG cache keyed by document checksum, page, renderer revision, and resolution, plus text/image representation, request timings, per-page Inngest jobs and polling, and resumable signed binary downloads. The `ACTIVE` deployment guide records worker registration and remote Range verification required for this always-on change.

This directory contains the technical documentation, architecture specifications, data schemas, operational runbooks, bundle contracts, and audits for Zyx Academy.

All markdown documents across `docs/` and `plans/` must be registered in this index with an explicit lifecycle status. The active feature catalog also specifies catalogue-based Article headings, chapter numbering, decoded canonical product URLs, and subsection navigation matching visible block headings. The active Product Bundle V3 contract includes labelled open and closed graph points and accepts complete Diktat PDFs from 1 to 4 pages without filler or font shrinking.

The `ACTIVE` feature catalog records Zyra article-style math presentation, proactive grounded visual exploration, and safe retry responses when generation fails.

The `ACTIVE` feature catalog also documents compact Article formula rows, reading-first embedded graphs, optional parameter controls, and explicit graph interaction activation.

The `ACTIVE` feature catalog records the mobile Article selection action and saved quote handoff to Zyra, with the desktop selection popover preserved.

---

## 1. Documentation Taxonomy & Hierarchy

The documentation is organized into clear functional layers:

```text
docs/
├── README.md                                 # Master Index and Status Authority (this file)
├── ARCHITECTURE.md                           # System Architecture, Data Flow, and Boundaries
├── DATABASE.md                               # Database Setup, Environments, and Adapters
├── DB_SCHEMA.md                              # Schema Definition, Tables, and Relations
├── DEPLOYMENT.md                             # Production and Staging Deployment Topology
├── DEVELOPMENT.md                            # Local Development, Tooling, and Feature Flags
├── FILE_NAMING_CONVENTIONS.md                # Official File Naming and Directory Taxonomy
├── features.md                               # Product Feature Catalog and Workflows
│
├── bundle/                                   # Bundle Specifications and Authoring Contracts
│   ├── authoring-context-pack-v1.md          # Authoring Context Pack V1 Contract
│   ├── authoring-job-pack-v1.md              # Authoring Job Pack V1 Contract
│   ├── idea-bundle-v2.md                     # Transitional Idea Bundle V2 Contract
│   ├── idea-bundle-v3.md                     # Structured Idea Bundle V3 Contract
│   ├── product-bundle-v2.md                  # Transitional Product Bundle V2 Contract
│   ├── product-bundle-v3.md                  # Structured Product Bundle V3 Contract
│   └── product-bundle-v4.md                  # Default V4 authoring contract, legacy compatibility and generated JSON Schema delivery
│
├── operations/                               # Operational Runbooks, Checklists, and Allowances
│   ├── authoring-mcp-skills.md                # Pinned MCP Skills Build and Import Acceptance
│   ├── legacy-vector-contract-allowlist.md   # Allowed Legacy Vector References during Cutover
│   ├── manual-test-plan-bundles-v2.md       # Human-driven Verification for Bundle Ingestion
│   ├── production-readiness-checklist.md     # Pre-deployment Gates and Plan Checkpoints
│   ├── structured-article-v3-rollout.md       # Structured Article V3 Migration and Rollout
│   ├── visual-audit-capture.md               # Procedure for Staging Visual Capture Audits
│   └── zyra-ops-runbooks.md                  # Zyra AI Alert Runbooks and Incident Handling
│
└── handoffs/                                 # Milestone Handoff Records and Checkpoints
    └── zyra-ai-plans-001-007.md              # Zyra AI Plans 001-007 Staging Checkpoint
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
| [README.md](README.md) | Index | `ACTIVE` | 2026-10-24 | Master documentation index, hierarchy map, course workspace compatibility status, marketing improvement plan, and lifecycle status ledger, including current bilingual implementation evidence and open gates. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Core Architecture | `ACTIVE` | 2026-10-24 | Request-scoped read deduplication, catalogue projections, first-content streaming, V4 authoring default, trusted verification and publication boundaries, bilingual request locale and preference precedence, finite public rewrites, worker-safe communications, Zyra override memory limits, source figures, and publication gates. |
| [operations/authoring-mcp-skills.md](operations/authoring-mcp-skills.md) | Operations | `ACTIVE` | 2026-10-23 | Pinned external snapshots, 0.4.1 V4 defaults, browser deadlines and 2-slice checkpoints, early remote cleanup, backoff-aware leases, canonical CDP validation, scoped diagnostics and exact-revision recovery/cancellation, attested renderer and separate installed-host acceptance. |
| [DATABASE.md](DATABASE.md) | Core Database | `ACTIVE` | Current | Database topology (Turso remote, SQLite local), Drizzle workflows, and driver adapters. |
| [DB_SCHEMA.md](DB_SCHEMA.md) | Core Database | `ACTIVE` | 2026-10-24 | Comprehensive schema catalog including the account locale preference table and verified pending staging migration 0098 status, singleton public demo marker, tutorial scheduling lifecycle, historical assessment provenance, Product Bundle review, and PDF evidence. |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Core Infrastructure | `ACTIVE` | 2026-10-24 | Vercel, Cloudflare Workers/R2/Vectorize deployment processes, Diktat runtime checks, secrets, environments, read-only staging migration preflight, and CP7/CP8 bilingual boundaries. |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Core Development | `ACTIVE` | 2026-10-24 | Local development, pinned scientific dependencies, i18n catalogs, locale-aware Zyra tests and memory-only override limits, and worker-safe dispatch guidance. |
| [FILE_NAMING_CONVENTIONS.md](FILE_NAMING_CONVENTIONS.md) | Standards | `ACTIVE` | Current | Standard file naming formula, taxonomy, and directory hierarchy for academic assets. |
| [features.md](features.md) | Product | `ACTIVE` | 2026-10-24 | Student, tutor, admin and public workflows; bilingual application interface and search boundaries, Zyra language persistence limits, Idea-linked quizzes, V4 authoring defaults, scientific rendering and review gates. |
| [bundle/authoring-context-pack-v1.md](bundle/authoring-context-pack-v1.md) | Bundle Contract | `ACTIVE` | Current | Specification for authoring context pack export format and security boundaries. |
| [bundle/authoring-job-pack-v1.md](bundle/authoring-job-pack-v1.md) | Bundle Contract | `ACTIVE` | 2026-10-11 | Specification for authoring job packs, Source Pack provenance, and local or stored-original ingestion and persistence. |
| [bundle/idea-bundle-v2.md](bundle/idea-bundle-v2.md) | Bundle Contract | `TRANSITIONAL / LEGACY` | Current | Read and rollback submission contract for Idea Bundle V2. |
| [bundle/idea-bundle-v3.md](bundle/idea-bundle-v3.md) | Bundle Contract | `ACTIVE` | 2026-08-31 | Learning section hierarchy, Idea membership, validation, editing, and MCP transition contract. |
| [bundle/product-bundle-v2.md](bundle/product-bundle-v2.md) | Bundle Contract | `TRANSITIONAL / LEGACY` | Current | Read compatibility and Article block review adapter for Product Bundle V2. |
| [bundle/product-bundle-v3.md](bundle/product-bundle-v3.md) | Bundle Contract | `ACTIVE` | 2026-10-11 | Structured Article, fixed readable Diktat typography, pagination, and numbered contact footer, typed visuals with geometric axis scaling and domain boundaries, simplified revision-bound review, publication, and student reads. |
| [bundle/product-bundle-v4.md](bundle/product-bundle-v4.md) | Bundle Contract | `ACTIVE` | 2026-10-22 | Default V4 authoring contract with legacy compatibility: scientific parts, authored graphical Diktat with fixed readable typography, source figures, trusted verification, unmarked scientific prose blockers, current explicit review and checksum-pinned schema delivery. Operational rollout is separate. |
| [operations/production-readiness-checklist.md](operations/production-readiness-checklist.md) | Operations | `ACTIVE` | Current | Pre-deployment gates, quality criteria, staging validation checklist, and mandatory Idea links with exactly one primary for MCP quiz drafts and edits. |
| [operations/zyra-ops-runbooks.md](operations/zyra-ops-runbooks.md) | Operations | `ACTIVE` | 2026-09-02 | Operational runbooks, health metrics, alert responses, and Admin Ops AI v2 operational procedures (Vectorize sync, rollback without flag, provider mitigation, proposal retention). |
| [operations/visual-audit-capture.md](operations/visual-audit-capture.md) | Operations | `ACTIVE` | Current | Safe procedure for capturing staging visual audits and screenshots. |
| [operations/structured-article-v3-rollout.md](operations/structured-article-v3-rollout.md) | Operations | `ACTIVE` | 2026-09-01 | Additive migration, authoring rollout gates, rollback, and published student visibility for structured Articles. |
| [operations/manual-test-plan-bundles-v2.md](operations/manual-test-plan-bundles-v2.md) | Operations | `ACTIVE` | Current | Manual test procedure for Idea Bundle V2 and Product Bundle V2 ingestion, block review, and destructive confirmation flows. |
| [operations/legacy-vector-contract-allowlist.md](operations/legacy-vector-contract-allowlist.md) | Operations | `TRANSITIONAL / LEGACY` | Current | Non-runtime vector matches permitted during the Vectorize 768d migration cutover. |
| [handoffs/zyra-ai-plans-001-007.md](handoffs/zyra-ai-plans-001-007.md) | Milestone Handoff | `HISTORICAL CHECKPOINT` | 2026-08-11 | Staging checkpoint and test evidence summary for Zyra AI system Plans 001 through 007. |

---

## 4. Plans Cross-Reference

Implementation plans reside in `plans/` with detailed specifications:

| Plan Track | Path | Status | Summary |
|---|---|---|---|
| Indonesian and English web app | [bilingual-web-app.md](../plans/bilingual-web-app.md) | `OPEN / IN PROGRESS` | CP0 inventory and baseline are accepted. Release candidate build, typecheck, lint, catalogs, focused contracts, a 52-capture public matrix, 26 focused state screenshots, and 8 metadata browser checks passed. CP7 remains partial for unavailable demo/PKA data, broad route/state coverage, and untested live provider/cache behavior. Read-only staging inspection confirmed migration 0098 is pending. CP8 remains blocked with no rollout authorization. |
| Article and Diktat system design | [article-diktat-authoring-system-design.md](../plans/article-diktat-authoring-system-design.md) | `OPEN / IN PROGRESS` | System design with local implementation status. Full chapter, live executor, staging and host-by-host rollout acceptance remain open. |
| Authoring MCP distribution and playbooks | [authoring-mcp-distribution-and-playbooks.md](../plans/authoring-mcp-distribution-and-playbooks.md) | `OPEN / IN PROGRESS` | Local review fixes validated by 95 Bun contracts, 11 Python tests, a production build with local fixtures, and 15 traced playbook assets. Repository lint/typecheck still have unrelated errors; Staging and production deployment/runtime smoke are verified; CP5 host verification and strict bootstrap enforcement remain open. |
| Marketing conversion and portfolio | [marketing-conversion-and-portfolio.md](../plans/marketing-conversion-and-portfolio.md) | `OPEN / IN PROGRESS` | M01 through M03 and M05 through M09 are implemented locally in a separate worktree. M04 and CP5 remain partial because the public study-case URL, external runtime configuration, and clean full validation are still open. |
| Product Bundle sebagai sumber belajar mandiri | [product-bundle-sumber-belajar-mandiri.md](../plans/product-bundle-sumber-belajar-mandiri.md) | `COMPLETED / RESOLVED` | Locally completed CP0 through CP8 implementation for self-study Articles, review Diktat PDF export, revision-bound pedagogic review, shared MCP gates, UI, skills, and four authoring rehearsals. Ready for a separately authorized guarded staging rollout. |

On 2026-09-05, the previous plan index, Plan 017, student learning UX plan, Ops AI orchestration and checkpoint handoffs/corrections, and Zyra AI System Plans 001 through 014 were removed at the user's direction. Their prior versions remain in Git history. Removal does not certify completion of previously open work; current runtime behavior remains documented in the canonical documents above.

---

## 5. Audit Lifecycle and Resolution Log

Audits are created to systematically identify architectural, quality, or security gaps. Once all findings in an audit are implemented, verified, and closed by implementation plans, the obsolete audit file is retired, and its resolution is recorded in this log.

| Audit | Date Logged | Resolution Status | Resolution Details |
|---|---|---|---|
| `heavy-api-routes-audit.md` | 2026-09-06 | `COMPLETED / RESOLVED` | Resolved by decoupling heavy compute into Deno background worker tier: Inngest physical entrypoint separation (jobs/web vs jobs/compute), asynchronous thumbnail generation via pdf/thumbnail.requested, async Diktat compilation via diktat/pdf.generate.requested, compute RPC endpoints (/internal/pdf/pages and /internal/authoring/source-pack/resolve), and static web tier boundary guards (audit:web-boundaries). |
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
| **Object Storage** | Cloudflare R2 via `lib/storage/keys.ts` | UploadThing | All new storage writes use Cloudflare R2 keys. UploadThing remains for legacy compatibility paths only. |
| **Database** | Turso (Production/Staging), SQLite (Local `dev.db`) | PostgreSQL / `neon-client` | Turso and local SQLite are the only supported engines. PostgreSQL is not used. |
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
