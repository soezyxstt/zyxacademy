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
│   ├── idea-bundle-v2.md                     # Idea Bundle V2 Schema and Ingestion Spec
│   └── product-bundle-v2.md                  # Product Bundle V2 Schema and Ingestion Spec
│
├── operations/                               # Operational Runbooks, Checklists, and Allowances
│   ├── legacy-vector-contract-allowlist.md   # Allowed Legacy Vector References during Cutover
│   ├── manual-test-plan-bundles-v2.md       # Human-driven Verification for Bundle Ingestion
│   ├── production-readiness-checklist.md     # Pre-deployment Gates and Plan Checkpoints
│   ├── visual-audit-capture.md               # Procedure for Staging Visual Capture Audits
│   └── zyra-ops-runbooks.md                  # Zyra AI Alert Runbooks and Incident Handling
│
├── audit/                                    # Quality, Security, and Visual Audits
│   └── admin-visual-quality-audit.md         # Admin Visual Quality and Responsive Audit
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
| [README.md](README.md) | Index | `ACTIVE` | 2026-08-27 | Master documentation index, hierarchy map, and lifecycle status ledger. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Core Architecture | `ACTIVE` | Current | Core platform architecture, data boundaries, domain layers, and system interfaces. |
| [DATABASE.md](DATABASE.md) | Core Database | `ACTIVE` | Current | Database topology (Turso remote, SQLite local), Drizzle workflows, and driver adapters. |
| [DB_SCHEMA.md](DB_SCHEMA.md) | Core Database | `ACTIVE` | Current | Comprehensive catalog of database tables, relationships, indexes, and constraints. |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Core Infrastructure | `ACTIVE` | Current | Vercel, Cloudflare Workers/R2/Vectorize deployment processes, secrets, and environments. |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Core Development | `ACTIVE` | Current | Local development guide, scripts, environment variables, and `FEATURE_*` flags catalog. |
| [FILE_NAMING_CONVENTIONS.md](FILE_NAMING_CONVENTIONS.md) | Standards | `ACTIVE` | Current | Standard file naming formula, taxonomy, and directory hierarchy for academic assets. |
| [features.md](features.md) | Product | `ACTIVE` | Current | Authoritative catalog of student, tutor, and admin workflows and user capabilities. |
| [bundle/authoring-context-pack-v1.md](bundle/authoring-context-pack-v1.md) | Bundle Contract | `ACTIVE` | Current | Specification for authoring context pack export format and security boundaries. |
| [bundle/authoring-job-pack-v1.md](bundle/authoring-job-pack-v1.md) | Bundle Contract | `ACTIVE` | Current | Specification for authoring job pack export format and automated worker ingestion. |
| [bundle/idea-bundle-v2.md](bundle/idea-bundle-v2.md) | Bundle Contract | `ACTIVE` | Current | Specification for Idea Bundle V2 ZIP format, manifest, validation, and publication. |
| [bundle/product-bundle-v2.md](bundle/product-bundle-v2.md) | Bundle Contract | `ACTIVE` | Current | Specification for Product Bundle V2 ZIP format, manifest, validation, and publication. |
| [operations/production-readiness-checklist.md](operations/production-readiness-checklist.md) | Operations | `ACTIVE` | Current | Pre-deployment gates, quality criteria, and staging validation checklist. |
| [operations/zyra-ops-runbooks.md](operations/zyra-ops-runbooks.md) | Operations | `ACTIVE` | Current | Operational runbooks, health metrics, and alert responses for the Zyra AI system. |
| [operations/visual-audit-capture.md](operations/visual-audit-capture.md) | Operations | `ACTIVE` | Current | Safe procedure for capturing staging visual audits and screenshots. |
| [operations/manual-test-plan-bundles-v2.md](operations/manual-test-plan-bundles-v2.md) | Operations | `ACTIVE` | Current | Manual test procedure for Idea Bundle V2 and Product Bundle V2 ingestion flows. |
| [operations/legacy-vector-contract-allowlist.md](operations/legacy-vector-contract-allowlist.md) | Operations | `TRANSITIONAL / LEGACY` | Current | Non-runtime vector matches permitted during the Vectorize 768d migration cutover. |
| [audit/admin-visual-quality-audit.md](audit/admin-visual-quality-audit.md) | Audit | `COMPLETED / RESOLVED` | 2026-08-24 | Visual and responsive quality audit for admin pages. All 14 findings (F1-F14) resolved and verified. |
| [handoffs/zyra-ai-plans-001-007.md](handoffs/zyra-ai-plans-001-007.md) | Milestone Handoff | `HISTORICAL CHECKPOINT` | 2026-08-11 | Staging checkpoint and test evidence summary for Zyra AI system Plans 001 through 007. |

---

## 4. Plans Cross-Reference

Implementation plans reside in `plans/` with detailed specifications:

| Plan Track | Path | Status | Summary |
|---|---|---|---|
| Overhaul Plans 001-016 | `plans/README.md` | `COMPLETED / RESOLVED` | Core overhaul covering identity, schemas, bundles V2, Vectorize 768d cutover, and Zyra foundation. |
| Plan 017 | `plans/017-audit-rework.md` | `OPEN / IN PROGRESS` | Minimal audit rework for Idea-centered authoring and learning workflows. |
| Zyra AI System Plans 001-014 | `plans/zyra-ai-system/README.md` | `ACTIVE / IN PROGRESS` | AI control plane, quota coordinator, multi-model routing, semantic cache, canvas, and tutoring harness. |

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
| **Course Ingestion** | Bundle V2 (`idea-bundle-v2`, `product-bundle-v2`) | Legacy V1 direct JSON importers | Bundle V2 ZIP imports are always-on and verified through typed manifests. |
| **AI Harness & Quota** | Zyra Control Plane with Durable Object Quota Coordinator | Uncoordinated direct provider calls | Tutoring and generation route through Zyra quota coordinator and allowance ledger. |

---

## 7. Documentation Maintenance Contract for Agents and Contributors

1. **Mandatory Index Updates**: Every time a markdown file in `docs/` or `plans/` is created, renamed, materially modified, or deleted, `docs/README.md` MUST be updated in the same change.
2. **Explicit Status Assignment**: Every new or altered document must have its status recorded as `ACTIVE`, `TRANSITIONAL / LEGACY`, `HISTORICAL CHECKPOINT`, `OPEN / IN PROGRESS`, or `COMPLETED / RESOLVED`.
3. **Audit Lifecycle Tracking**: New audits must be placed in `docs/audit/` and marked `OPEN / IN PROGRESS` in Section 3 and Section 5. When all findings are resolved and verified, the audit file can be removed and moved to `COMPLETED / RESOLVED` in Section 5.
4. **No Dash Rule**: Never use em dashes or en dashes in documentation, code, or copy. Use commas, semicolons, colons, or periods instead.
5. **Accurate Cross-Linking**: Ensure all markdown links use relative paths that correctly resolve from the referencing file.
