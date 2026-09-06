# Zyx Academy Documentation Index

This directory contains the technical documentation, architecture specifications, data schemas, operational runbooks, bundle contracts, and audits for Zyx Academy.

All markdown documents across `docs/` and `plans/` must be registered in this index with an explicit lifecycle status.

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
│   └── product-bundle-v3.md                  # Structured Product Bundle V3 Contract
│
├── operations/                               # Operational Runbooks, Checklists, and Allowances
│   ├── legacy-vector-contract-allowlist.md   # Allowed Legacy Vector References during Cutover
│   ├── manual-test-plan-bundles-v2.md       # Human-driven Verification for Bundle Ingestion
│   ├── production-readiness-checklist.md     # Pre-deployment Gates and Plan Checkpoints
│   ├── structured-article-v3-rollout.md       # Structured Article V3 Migration and Rollout
│   ├── visual-audit-capture.md               # Procedure for Staging Visual Capture Audits
│   └── zyra-ops-runbooks.md                  # Zyra AI Alert Runbooks and Incident Handling
│
├── audit/                                    # Quality, Security, and Visual Audits
│   ├── admin-visual-quality-audit.md         # Admin Visual Quality and Responsive Audit
│   └── student-deep-ui-ux-audit.md           # Student Deep UI/UX Quality and Design Audit
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
| [README.md](README.md) | Index | `ACTIVE` | 2026-09-06 | Master documentation index, hierarchy map, and lifecycle status ledger. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Core Architecture | `ACTIVE` | 2026-09-06 | Core platform architecture, canonical-first student reads, Product Bundle pedagogic and PDF evidence, compatibility boundaries, and system interfaces. |
| [DATABASE.md](DATABASE.md) | Core Database | `ACTIVE` | Current | Database topology (Turso remote, SQLite local), Drizzle workflows, and driver adapters. |
| [DB_SCHEMA.md](DB_SCHEMA.md) | Core Database | `ACTIVE` | 2026-09-06 | Comprehensive catalog including revision-bound Product Bundle pedagogic review and PDF evidence. |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Core Infrastructure | `ACTIVE` | 2026-09-06 | Vercel, Cloudflare Workers/R2/Vectorize deployment processes, secrets, and environments. |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Core Development | `ACTIVE` | 2026-09-04 | Local development guide, scripts, environment variables, and V3 authoring rollout flag boundaries. |
| [FILE_NAMING_CONVENTIONS.md](FILE_NAMING_CONVENTIONS.md) | Standards | `ACTIVE` | Current | Standard file naming formula, taxonomy, and directory hierarchy for academic assets. |
| [features.md](features.md) | Product | `ACTIVE` | 2026-09-06 | Authoritative catalog of canonical-first student, tutor, admin, and MCP authoring workflows, including self-study Product Bundles. |
| [bundle/authoring-context-pack-v1.md](bundle/authoring-context-pack-v1.md) | Bundle Contract | `ACTIVE` | Current | Specification for authoring context pack export format and security boundaries. |
| [bundle/authoring-job-pack-v1.md](bundle/authoring-job-pack-v1.md) | Bundle Contract | `ACTIVE` | 2026-09-04 | Specification for authoring job packs and local or stored-original Source Pack ingestion and persistence. |
| [bundle/idea-bundle-v2.md](bundle/idea-bundle-v2.md) | Bundle Contract | `TRANSITIONAL / LEGACY` | Current | Read and rollback submission contract for Idea Bundle V2. |
| [bundle/idea-bundle-v3.md](bundle/idea-bundle-v3.md) | Bundle Contract | `ACTIVE` | 2026-08-31 | Learning section hierarchy, Idea membership, validation, editing, and MCP transition contract. |
| [bundle/product-bundle-v2.md](bundle/product-bundle-v2.md) | Bundle Contract | `TRANSITIONAL / LEGACY` | Current | Read compatibility and Article block review adapter for Product Bundle V2. |
| [bundle/product-bundle-v3.md](bundle/product-bundle-v3.md) | Bundle Contract | `ACTIVE` | 2026-09-06 | Structured self-study Article, review Diktat, typed pedagogy and visuals, revision-bound review/PDF evidence, publication, and student reads. |
| [operations/production-readiness-checklist.md](operations/production-readiness-checklist.md) | Operations | `ACTIVE` | Current | Pre-deployment gates, quality criteria, and staging validation checklist. |
| [operations/zyra-ops-runbooks.md](operations/zyra-ops-runbooks.md) | Operations | `ACTIVE` | 2026-09-02 | Operational runbooks, health metrics, alert responses, and Admin Ops AI v2 operational procedures (Vectorize sync, rollback without flag, provider mitigation, proposal retention). |
| [operations/visual-audit-capture.md](operations/visual-audit-capture.md) | Operations | `ACTIVE` | Current | Safe procedure for capturing staging visual audits and screenshots. |
| [operations/structured-article-v3-rollout.md](operations/structured-article-v3-rollout.md) | Operations | `ACTIVE` | 2026-09-01 | Additive migration, authoring rollout gates, rollback, and published student visibility for structured Articles. |
| [operations/manual-test-plan-bundles-v2.md](operations/manual-test-plan-bundles-v2.md) | Operations | `ACTIVE` | Current | Manual test procedure for Idea Bundle V2 and Product Bundle V2 ingestion, block review, and destructive confirmation flows. |
| [operations/legacy-vector-contract-allowlist.md](operations/legacy-vector-contract-allowlist.md) | Operations | `TRANSITIONAL / LEGACY` | Current | Non-runtime vector matches permitted during the Vectorize 768d migration cutover. |
| [audit/admin-visual-quality-audit.md](audit/admin-visual-quality-audit.md) | Audit | `COMPLETED / RESOLVED` | 2026-08-24 | Visual and responsive quality audit for admin pages. All 14 findings (F1-F14) resolved and verified. |
| [audit/student-deep-ui-ux-audit.md](audit/student-deep-ui-ux-audit.md) | Audit | `COMPLETED / RESOLVED` | 2026-09-03 | Comprehensive UI/UX and system audit for student pages. All 8 findings (AUD-STU-01 through 08) resolved and verified. |
| [handoffs/zyra-ai-plans-001-007.md](handoffs/zyra-ai-plans-001-007.md) | Milestone Handoff | `HISTORICAL CHECKPOINT` | 2026-08-11 | Staging checkpoint and test evidence summary for Zyra AI system Plans 001 through 007. |

---

## 4. Plans Cross-Reference

Implementation plans reside in `plans/` with detailed specifications:

| Plan Track | Path | Status | Summary |
|---|---|---|---|
| Product Bundle sebagai sumber belajar mandiri | [product-bundle-sumber-belajar-mandiri.md](../plans/product-bundle-sumber-belajar-mandiri.md) | `COMPLETED / RESOLVED` | Locally completed CP0 through CP8 implementation for self-study Articles, review Diktat PDF export, revision-bound pedagogic review, shared MCP gates, UI, skills, and four authoring rehearsals. Ready for a separately authorized guarded staging rollout. |

On 2026-09-05, the previous plan index, Plan 017, student learning UX plan, Ops AI orchestration and checkpoint handoffs/corrections, and Zyra AI System Plans 001 through 014 were removed at the user's direction. Their prior versions remain in Git history. Removal does not certify completion of previously open work; current runtime behavior remains documented in the canonical documents above.

---

## 5. Audit Lifecycle and Resolution Log

Audits are created to systematically identify architectural, quality, or security gaps. Once all findings in an audit are implemented, verified, and closed by implementation plans, the obsolete audit file is retired, and its resolution is recorded in this log.

| Audit | Date Logged | Resolution Status | Resolution Details |
|---|---|---|---|
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
