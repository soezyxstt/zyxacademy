# Zyx Academy Documentation Index

Master index, taxonomy, and lifecycle status registry for all technical documentation under `docs/` and active implementation plans under `plans/`.

## 1. Documentation Taxonomy

```text
docs/
├── README.md                                 # Master Index and Status Authority (this file)
├── ARCHITECTURE.md                           # System Architecture, Multi-Platform Boundaries, and Data Flow
├── features.md                               # Product Feature Catalog (Student, Tutor, Admin, Public, Native, MCP)
├── DATABASE.md                               # Neon PostgreSQL Environments, Adapters, and Migration Workflow
├── DB_SCHEMA.md                              # PostgreSQL Schema Reference (244 tables through migration 0041)
├── DEVELOPMENT.md                            # Local Setup, Commands, CI Scope, Env Vars, and Feature Flags
├── DEPLOYMENT.md                             # Production/Staging Topology, Workers, AI Gateway, and Native Releases
├── FILE_NAMING_CONVENTIONS.md                # Academic Asset Naming Formula and Directory Hierarchy
├── data-fetching.md                          # Client Data Fetching and TanStack Query Standard
├── native-readiness.md                       # Expo readiness evidence and scope
├── mobile-native.md                          # Expo and Next.js Mobile Migration Roadmap
├── coding-foundation.md                      # Python Learning, Playground, Live Quiz, and Zyra Coaching
├── discussions.md                            # Bilingual Scoped Discussions Contract
├── gamification.md                           # Student Gamification, Pet Studio, Achievements, and Social Identity
├── notifications.md                          # Contextual Activity Notifications, Preferences, and Delivery
├── notifications-quiet-hours.md              # Quiet-Hour Digests, Push Isolation, and Device Sessions
├── public-showcase.md                        # Public Engineering Case Study
│
├── bundle/                                   # Canonical Authoring and Bundle Contracts
│   ├── authoring-agent-workflow.md           # Agent-Friendly Drafts, Compact Reads, Logic Checks, and Final PDFs
│   ├── authoring-context-pack-v1.md          # Authoring Context Pack V1 Export & Security Contract
│   ├── authoring-job-pack-v1.md              # Authoring Job Pack V1 and Source Pack Provenance
│   ├── authoring-revisions.md                # Stable-ID Revisions, Purpose-Bound Evidence, Atomic Releases, and Restore
│   ├── idea-bundle-v3.md                     # Idea Bundle V3 Contract
│   ├── product-bundle-v3.md                  # Product Bundle V3 Compatibility Contract
│   ├── product-bundle-v4.md                  # Product V4 Contract, Browser-Free Logic, and Final Diktat PDFs
│   └── product-bundle-v5.md                  # Product Bundle V5 Contract (Standalone Solution Collections)
│
└── operations/                               # Active Operational Runbooks and Checklists
    ├── zyra-ops-runbooks.md                  # Zyra AI, AI Gateway, Vector Recovery, and Admin Ops Runbooks
    ├── production-readiness-checklist.md     # Pre-Deployment Validation Gates and Invariants
    ├── cloud-run-staging.md                  # Cloud Run Bangkok Staging & Edge Worker Runbook
    ├── vercel-staging.md                     # Manual Vercel Staging Release & Recovery Runbook
    ├── offline-data-sync.md                  # Offline cache and native recovery
    ├── admin-mcp.md                          # Admin MCP Operations, Scopes, and Tool Catalog
    ├── agent-first-content.md                # Agent-First Content Operations (Blog, Forms, Media, Recovery)
    ├── authoring-mcp-skills.md               # Authoring MCP Skills, Purpose Contracts, Build, Pinning, and Distribution
    ├── mcp-host-compatibility.md             # MCP OAuth Consent, Tool Schemas, and Host Compatibility
    └── public-demo-seeding.md                # Public Demo Snapshot Policy and Guarded Seeding
```

## 2. Document Status Definitions

| Status | Definition |
| --- | --- |
| `ACTIVE` | Canonical source of truth reflecting current production or active staging behavior. |
| `TRANSITIONAL / LEGACY` | Preserved for compatibility or rollback support. Not for new feature development. |
| `OPEN / IN PROGRESS` | Active implementation plan or partially rolled-out capability. |
| `COMPLETED / RESOLVED` | Completed historical plan retained for reference. |

## 3. Master Document Inventory

### Core Architecture, Product, and Infrastructure

| Document | Category | Status | Purpose and Scope |
| --- | --- | --- | --- |
| [README.md](README.md) | Index | `ACTIVE` | Master documentation taxonomy and lifecycle status registry. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Architecture | `ACTIVE` | Full-stack topology (Next.js 16.3, Neon PostgreSQL/Storage/Functions, Cloudflare AI Gateway/Vectorize/Workers, Capacitor 7, Tauri v2), separated mobile/desktop shells, saved account sessions, canonical authoring with separate V4 logic and final PDF plans, Zyra quota/retrieval, and bilingual routing. |
| [features.md](features.md) | Product | `ACTIVE` | Authoritative catalog of Student, Tutor, Admin, Public, Native App, Zyra AI, Discussions, Calendar Sync, Form Studio, Gamification/Pet Studio, and MCP workflows with browser-free V4 logic and explicit final PDFs. |
| [DATABASE.md](DATABASE.md) | Database | `ACTIVE` | Neon PostgreSQL staging/production targets, private Neon Object Storage, Drizzle migration workflow (`drizzle-postgres/`), and schema domain overview. |
| [DB_SCHEMA.md](DB_SCHEMA.md) | Database | `ACTIVE` | PostgreSQL schema reference covering all 244 tables in `db/schema.ts` through migration `0041_discussion_search_indexes.sql`. |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Development | `ACTIVE` | Local setup, Bun commands, dependency-scoped CI planner, environment variables, 8 active feature flags, AI Gateway catalog/probes, bilingual catalogs, Google Calendar token rotation, and local V4 verification. |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Infrastructure | `ACTIVE` | Production Vercel (`sin1`), manual staging (Vercel & Cloud Run Bangkok), Neon Functions worker, `QUEUE_PROVIDER` (Inngest / Cloud Tasks), Cloudflare Workers, AI Gateway, Calendar sync, and Nightly/Stable mobile & desktop releases. |
| [FILE_NAMING_CONVENTIONS.md](FILE_NAMING_CONVENTIONS.md) | Standards | `ACTIVE` | Standard file naming formula, taxonomy, and directory hierarchy for academic assets. |
| [public-showcase.md](public-showcase.md) | Showcase | `ACTIVE` | Sanitized public-facing engineering case study. |

### Feature and Domain Contracts

| Document | Category | Status | Purpose and Scope |
| --- | --- | --- | --- |
| [data-fetching.md](data-fetching.md) | Architecture | `ACTIVE` | TanStack Query 5 standard: account-scoped keys, validated API functions, freshness/retry/invalidation policies, student return navigation, and RSC boundaries. |
| [mobile-native.md](mobile-native.md) | Plan | `OPEN / IN PROGRESS` | Staged Expo and Next.js mobile migration, component inventory, shared transport, public form respondent checks and upload limits, offline reading verification and storage recovery, pixel parity gates, and native capability boundaries. |
| [native-readiness.md](native-readiness.md) | Audit | `OPEN / IN PROGRESS` | Independent baseline and evidence for native component, page and backend readiness. |
| [coding-foundation.md](coding-foundation.md) | Feature Contract | `ACTIVE` | Editable Python Markdown in Articles, viewport-aware Playground, Pyodide/WASI execution, Submit grading, Live Quiz, and Zyra Python coaching. |
| [discussions.md](discussions.md) | Feature Contract | `ACTIVE` | Bilingual scoped Q&A discussions, compact composer, immutable retries, mention handles, full-text search, and single-dispatch `@Zyra` AI cooldowns. |
| [gamification.md](gamification.md) | Feature Contract | `ACTIVE` | Student-only ranks, XP/LP ledgers, achievements, animated frames, 6 Zyra chat skins, Pet Studio (4 GLB pets + 15 fitted suits), leaderboards, and public profile privacy boundaries. |
| [notifications.md](notifications.md) | Feature Contract | `ACTIVE` | Notification policy, preference controls, delivery, and the native Admin broadcast workflow. |
| [notifications-quiet-hours.md](notifications-quiet-hours.md) | Feature Contract | `ACTIVE` | Per-account quiet-hour push digests, native push isolation, and signed-in device session management. |

### Canonical Authoring Bundle Contracts

| Document | Category | Status | Purpose and Scope |
| --- | --- | --- | --- |
| [bundle/authoring-agent-workflow.md](bundle/authoring-agent-workflow.md) | Bundle Contract | `ACTIVE` | Typed V4/V5 creation, compact discovery and cached contracts, browser-free V4 logic, explicit final PDFs and bounded purpose-aware recovery. |
| [bundle/authoring-context-pack-v1.md](bundle/authoring-context-pack-v1.md) | Bundle Contract | `ACTIVE` | Export format, determinism, and security boundaries for Authoring Context Packs. |
| [bundle/authoring-job-pack-v1.md](bundle/authoring-job-pack-v1.md) | Bundle Contract | `ACTIVE` | Authoring Job Pack V1 structure, Source Pack provenance, and skill integration. |
| [bundle/authoring-revisions.md](bundle/authoring-revisions.md) | Bundle Contract | `ACTIVE` | Stable-ID edits, explicit derived-content review, immutable lineage, separate logic/PDF plans, unchanged PDF reuse and atomic V3+ releases. |
| [bundle/idea-bundle-v3.md](bundle/idea-bundle-v3.md) | Bundle Contract | `ACTIVE` | Atomic Idea extraction, learning sections, provenance, and revision-bound MCP lifecycle. |
| [bundle/product-bundle-v3.md](bundle/product-bundle-v3.md) | Bundle Contract | `TRANSITIONAL / LEGACY` | Read compatibility and legacy revision lifecycle for Product Bundle V3. |
| [bundle/product-bundle-v4.md](bundle/product-bundle-v4.md) | Bundle Contract | `ACTIVE` | V4 Articles, Diktats and flashcards; browser-free logic and semantic review; explicit final canonical Diktat PDFs without screenshot or visual-review gates. |
| [bundle/product-bundle-v5.md](bundle/product-bundle-v5.md) | Bundle Contract | `ACTIVE` | Standalone reviewed solution collections, scoped headless review/publication, and learner access boundaries. |

### Operational Runbooks

| Document | Category | Status | Purpose and Scope |
| --- | --- | --- | --- |
| [operations/zyra-ops-runbooks.md](operations/zyra-ops-runbooks.md) | Operations | `ACTIVE` | Incident runbooks for all 14 Zyra alert codes, canonical Vectorize outbox recovery, Admin Ops Knowledge sync/rollback, AI Gateway failure mitigation, and proposal retention. |
| [operations/production-readiness-checklist.md](operations/production-readiness-checklist.md) | Operations | `ACTIVE` | Pre-deployment quality, contract, database, worker, AI Gateway, MCP, and native app release gates. |
| [operations/cloud-run-staging.md](operations/cloud-run-staging.md) | Operations | `ACTIVE` | Cloud Run Bangkok staging container build, Secret Manager import, Cloudflare Edge Worker routing, and rollback. |
| [operations/vercel-staging.md](operations/vercel-staging.md) | Operations | `ACTIVE` | Manual Vercel custom `staging` deployment, target guards, and recovery procedure. |
| [operations/offline-data-sync.md](operations/offline-data-sync.md) | Operations | `ACTIVE` | Admin mutation coverage, account-scoped caches, reconnect and revocation checks, and native recovery. |
| [operations/admin-mcp.md](operations/admin-mcp.md) | Operations | `ACTIVE` | Admin MCP endpoint (`/api/mcp/authoring`), OAuth scopes, native outbox isolation, mutation boundaries, and supported tool catalog. |
| [operations/agent-first-content.md](operations/agent-first-content.md) | Operations | `ACTIVE` | Agent-first MCP workflows for blog, forms, media, and committed-mutation receipt recovery. |
| [operations/authoring-mcp-skills.md](operations/authoring-mcp-skills.md) | Operations | `ACTIVE` | Pinned skills catalog, source 0.5.6 logic/PDF purposes, optional PDF runtime diagnostics, distribution and separate host verification. |
| [operations/mcp-host-compatibility.md](operations/mcp-host-compatibility.md) | Operations | `ACTIVE` | Streamable HTTP MCP OAuth consent (46 grouped permissions), tool schemas, and host compatibility boundaries. |
| [operations/public-demo-seeding.md](operations/public-demo-seeding.md) | Operations | `ACTIVE` | First-chapter Free content policy, V2 JSONB snapshot validation, and guarded seeding for `/demo`. |

## 4. Plans Cross-Reference

Implementation plans reside in `plans/`:

| Plan Track | Path | Status |
| --- | --- | --- |
| Admin documentation | [admin-documentation.md](../plans/admin-documentation.md) | `OPEN / IN PROGRESS` |
| Bilingual web app (`id` / `en`) | [bilingual-web-app.md](../plans/bilingual-web-app.md) | `OPEN / IN PROGRESS` |
| Article and Diktat authoring system design | [article-diktat-authoring-system-design.md](../plans/article-diktat-authoring-system-design.md) | `OPEN / IN PROGRESS` |
| Authoring MCP distribution and playbooks | [authoring-mcp-distribution-and-playbooks.md](../plans/authoring-mcp-distribution-and-playbooks.md) | `OPEN / IN PROGRESS` |
| Marketing conversion and portfolio | [marketing-conversion-and-portfolio.md](../plans/marketing-conversion-and-portfolio.md) | `OPEN / IN PROGRESS` |
| Web navigation and performance | [navigation-performance-plan.md](../plans/navigation-performance-plan.md) | `OPEN / IN PROGRESS` |
| Product Bundle self-study | [product-bundle-sumber-belajar-mandiri.md](../plans/product-bundle-sumber-belajar-mandiri.md) | `COMPLETED / RESOLVED` |
